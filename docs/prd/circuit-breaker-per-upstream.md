# PRD: Circuit Breaker Per Upstream

> Each endpoint's real data provider gets its own circuit breaker. A failing upstream trips only its own breaker and sheds load gracefully (503 + Retry-After), while every endpoint that doesn't depend on it keeps serving.

**Status:** Built (prototype is the spec) · **Roadmap:** F-066 · **Routes:** the gateway pipeline (per-upstream breaker), `GET/POST /v1/circuits`, `/console/circuits`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment fans out to many upstreams — an SMTP prober, the MCA registry, carrier HLRs, the professional/company graphs, a funding database. The gateway already had a circuit breaker, but it was a single global circuit keyed `'sandboxAPI'`: if it tripped, it took down *everything*, and one flaky provider looked identical to a total outage. F-066 makes the breaker **per-upstream** — a degraded funding database sheds load only for funding calls, while people, company, and email lookups stay green — and makes that state observable and controllable.

## 2. Goals & Non-Goals
**Goals**
- **Isolate failures per upstream:** consecutive failures trip only that upstream's breaker; dependent endpoints return 503 + Retry-After, others are unaffected.
- **Recover automatically:** OPEN → HALF_OPEN after a cooldown, one success closes it.
- **Map every endpoint to its upstream** (aligned to the F-043 source-catalog providers), with a Zinbit Core fallback for deterministic in-house ops.
- **Observe + drill:** a console showing each upstream's state, failure rate, trips, cooldown countdown, and the endpoints it powers — with admin controls to force-open (drain) or reset for a game-day.

**Non-Goals (this phase)** — per-endpoint (vs per-upstream) breakers; configurable thresholds/cooldowns per upstream in the UI; automatic failover to a secondary provider; persisting breaker state across process restarts (in-memory, like the other gateway registries); half-open concurrency limiting.

## 3. Users & Personas
- **Integrating developer (land):** a 503 with `X-Upstream` + Retry-After tells them exactly which provider is down and when to retry — not a mysterious blanket failure.
- **SRE / platform admin (expand):** watches upstream health live and runs drills (force-open to drain an upstream before maintenance, reset after).
- **Support:** "is provider X down?" is answered at a glance.
- **RBAC:** `/console/circuits` is admin + developer; the force-open/reset drills are admin-only (in the UI and enforced at the `POST /v1/circuits` endpoint).

## 4. Differentiation
Ties to **win #5 (operator-grade)** and coheres with **F-043 source attribution**: the upstreams here *are* the named providers that attribute each field, so reliability and provenance tell one story. Most enrichment APIs expose no upstream health at all; a per-upstream breaker with a live console and drill controls is genuinely operator-grade.

## 5. Data Model & Logic
Two SSOTs, both pure/deterministic, in-memory per-process:
- **`src/lib/gateway/upstreams.ts`** — the `UPSTREAMS` registry (12 providers: professional/company graph, SMTP, DNS, carrier HLR, MCA registry, funding DB, news monitor, social graph, domain intel, IP intel, Zinbit Core) and `ENDPOINT_UPSTREAM` mapping every endpoint to its upstream; `upstreamForEndpoint(id)` (Zinbit Core fallback), `getUpstream`, `endpointsForUpstream`.
- **`src/lib/gateway/circuitBreaker.ts`** — generic per-name breaker: `getCircuitState` (OPEN→HALF_OPEN after `COOLDOWN_MS`), `recordSuccess` (closes), `recordFailure` (trips at `FAILURE_THRESHOLD`, or immediately from HALF_OPEN), `forceCircuit(name, 'OPEN'|'CLOSED'|'auto')` for drills, and `getCircuitSnapshot` (state, failure rate, totals, trip count, cooldown remaining, forced). Backward-compatible with the original 3 exports the pipeline already called.

## 6. State / Integration
- **Gateway pipeline** (`app/api/v1/[...route]/route.ts`): the existing breaker check is re-keyed from the hardcoded `'sandboxAPI'` to `upstreamForEndpoint(endpoint.id)`; success/failure record against that upstream; responses carry `X-Upstream` and (when tripped) `X-Circuit-Breaker: OPEN`. A `GET/POST /v1/circuits` special-path returns all circuit snapshots (joined with upstream metadata + `endpointsForUpstream`) and, for admins, forces a circuit for a drill.
- **No Zustand slice** — breaker state is gateway-side; the console reads it live over the API (like the async-jobs / idempotency pages).
- **Catalog:** a `circuits-stats` entry in `src/data/endpoints.ts` feeds docs / Explorer / OpenAPI / Postman / CLI.

## 7. UI
`/console/circuits` (icon `Zap`): a KPI row (upstreams, healthy, degraded, availability), a degraded-state banner, and a card per upstream — provider name + category, a state badge (Healthy / Recovering / Tripped, `+ forced`), failure-rate / requests / trips tiles, a live cooldown countdown when OPEN, the endpoints it powers, and (admin) Force-open (drain) / Reset controls. Beautiful loading (skeletons) and error (retry) states; auto-refreshes every 5s for countdowns. Semantic tokens; Framer Motion; light + dark. Cross-links to Infrastructure and Logs.

## 8. Telemetry
`circuits_viewed` (console open) and `circuit_forced` (a drill action, with upstream + mode) via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (per-upstream trip/isolation, threshold, half-open recovery, force open/close/auto, snapshot stats, determinism; upstream mapping + fallback + powers) · isolated build green (route `/console/circuits`) · live gateway drill: force-open an upstream → dependent endpoint returns 503 `X-Circuit-Breaker: OPEN` while others stay 200; reset → recovers. Console renders all upstreams with live state, 0 console errors.

## 10. Deferred
Per-endpoint breakers; UI-configurable thresholds/cooldowns; automatic failover to a secondary provider; persisted breaker state; half-open concurrency limits; surfacing trips as anomaly alerts.
