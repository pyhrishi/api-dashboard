# PRD: Request Coalescing

> Collapse identical in-flight lookups into a single upstream call. When N identical GET requests are in flight at the same instant, only the first does the work; the rest coalesce onto it and share the one result — not re-computed, not re-billed.

**Status:** Built (prototype is the spec) · **Roadmap:** F-068 · **Routes:** `GET /v1/coalescing` (stats), `POST /v1/coalescing` (drill), `/console/coalescing`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Under load, the same lookup is often requested many times at once — a cache stampede when a hot key expires, a fan-out where dozens of workers enrich the same domain, or a retry storm after a blip. Each of those identical requests independently hits the upstream, wasting work, capacity, and credits. Request coalescing (single-flight) makes the first request the leader that does the work, and every identical request that arrives while it's in flight becomes a follower that shares the leader's result. It's the concurrency-time complement to the edge cache: the cache dedupes *completed* work; coalescing dedupes work that is still *happening*. Sits alongside idempotency (F-061), the edge cache, and circuit breakers (F-066) in the reliability layer.

## 2. Goals & Non-Goals
**Goals**
- **Real single-flight:** an identical request (API key + method + path + params) arriving while a leader is in flight shares the leader's promise — one upstream call for the whole wave.
- **Followers ride free:** coalesced requests are not re-computed and not re-billed; each wave saves `(waveSize − 1) × creditCost`.
- **Observability:** a registry of waves collapsed, upstream calls saved, credits saved, largest/avg wave, and in-flight-now.
- **Prove it:** a drill fires N truly-concurrent identical requests and shows them collapse to a single upstream call.
- Correct lifecycle: leader failure propagates to followers and the in-flight slot is always cleaned up (no leaks).

**Non-Goals (this phase)** — coalescing writes/POSTs (only idempotent reads; writes are covered by idempotency F-061); cross-isolate/distributed coalescing (per-isolate, like the other gateway registries); configurable coalescing windows or max-wait; coalescing across *similar* (not identical) requests; persisting wave history beyond the in-memory ring buffer.

## 3. Users & Personas
- **Platform/SRE (expand):** sees stampede protection quantified — upstream calls and credits saved — and can run a game-day drill.
- **Integrating developer (land):** fan-out workers that hit the same domain no longer multiply cost; `GET /v1/coalescing` shows the savings.
- **Finance/RevOps:** credits-saved is a concrete efficiency line.
- **RBAC:** the console is `admin | developer`; the meta endpoint is free (creditCost 0), keyless-billed like the other gateway stat endpoints.

## 4. Differentiation
Ties to **win #6 (enterprise-grade reliability)** and complements the edge cache + circuit breakers already in the gateway. Most enrichment APIs leave stampede protection to the client; exposing coalescing as a **first-class, observable, drill-able** gateway behavior — with credits-saved attribution — is the operational depth enterprises expect and dev-first tools omit. The drill (watch 48 concurrent calls collapse to 1) is the demo moment.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/coalescing.ts`** (in-memory, per-isolate, seeded at import; no `Math.random`).
- `coalesceRequest(apiKey, path, fingerprint, creditCost, work)` — the leader registers its in-flight promise **synchronously** into a `Map`, so any identical caller in the same tick attaches to it as a follower; on settle the slot is finalized (wave recorded) and removed. Returns `{ result, role, coalesced, waveSize }`.
- `fingerprintRequest(method, path, params)` — sha256 over method + path + sorted params.
- `runCoalescingDrill(apiKey, path, concurrency, creditCost, latencyMs)` — fires `concurrency` concurrent `coalesceRequest` calls over a small-latency simulated upstream (clamped 2–64); returns `{ waveSize, upstreamCalls: 1, coalesced, creditsSaved, latencyMs }`.
- `getCoalescingStats()` / `__resetCoalescing()` — snapshot + test reset. Counters: coalescedRequests, upstreamCallsSaved, creditsSaved, wavesTotal, largestWave, avgWaveSize, inFlightNow, recent[].

## 6. State / Integration
- **Gateway:** a free special-path in `app/api/v1/[...route]/route.ts` (handled before route resolution + billing, like `/v1/idempotency` and `/v1/circuits`): `GET /v1/coalescing` returns stats; `POST /v1/coalescing { path, concurrency }` runs a drill and returns the result + fresh stats. Catalog entry `coalescing-stats` (creditCost 0) flows into docs / Explorer / OpenAPI / Postman / CLI.
- **No store slice** (server-side gateway registry, not client state).
- **Console** (`/console/coalescing`): KPI tiles, a drill control (path + concurrency → POST), a live result banner (`N → 1`), an explainer, and a recent-waves list.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge). **Loading** — skeleton grid. **Ready** — KPIs + drill + waves. **Empty** — no waves yet, prompt to run a drill. **Error** — gateway didn't respond + retry. Drill shows an optimistic spinner and an animated `N → 1` result banner. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `coalescing_viewed` (page view) and `coalescing_drill_run` (path, concurrency, coalesced). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**9-case** suite: N concurrent identical → 1 leader + N−1 followers with one upstream run; sequential non-overlap doesn't coalesce; different params/keys don't coalesce; in-flight clears after settle; leader error propagates + cleans up; stats accrual; seeded history; drill collapses + clamps) · isolated `next build` green (`/console/coalescing` present) · Playwright smoke (`e2e/coalescing.spec.ts`) · live gateway drill — `POST /v1/coalescing { concurrency: 24 }` → 1 upstream call, 23 coalesced. 0 console errors.

## 10. Deferred
Distributed/cross-isolate coalescing (shared cache); wiring `coalesceRequest` around every idempotent GET in the main pipeline (currently the drill + registry prove the behavior); configurable coalescing window / max concurrent wave; coalescing of near-identical requests; persisting wave history; a per-endpoint coalescing breakdown.
