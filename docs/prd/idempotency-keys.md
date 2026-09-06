# PRD: Idempotency Keys

> Safe retries for writes. Send `Idempotency-Key: <uuid>` on a pipeline POST and a retry replays the exact original response — never re-processed, never re-charged. Reuse with a different body is rejected 409.

**Status:** Built (prototype is the spec) · **Roadmap:** F-061 · **Routes:** any pipeline POST (via the `Idempotency-Key` header), `GET /v1/idempotency` (registry stats), `/console/idempotency`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Networks drop, clients time out and retry, users double-click. Without idempotency, a retried write runs twice — a batch enrichment charged twice, a record created twice. The gateway already replayed POSTs carrying an `Idempotency-Key` and already skipped billing on replay, but it had two gaps that made it unsafe to rely on: reusing a key with a *different* body silently replayed the stale response (masking a real change), and there was zero visibility into what was stored or saved. F-061 closes both and makes idempotency a first-class, observable guarantee.

## 2. Goals & Non-Goals
**Goals**
- **Replay** the exact stored response for a retry with the same key + body, at **zero credits** (no double-charge).
- **Reject** key reuse with a different body — **409 IDEMPOTENCY_KEY_REUSED** — so a key can never mask a genuinely different request.
- **Observe** the registry: active keys, replays served, credits saved, and a per-key TTL countdown, in a console and via `GET /v1/idempotency`.
- **Single-source** the logic in a dedicated gateway module, replacing the ad-hoc cache.ts helpers.

**Non-Goals (this phase)** — idempotency on the special-path meta-writes (`/v1/feedback/*`, `/v1/suppression`, `/v1/jobs`, `/v1/data-shares`), which return before the pipeline's idempotency stage (documented follow-up; most are zero-credit or already-idempotent); client-supplied TTLs; cross-region/persistent storage (in-memory per process, like the other gateway registries); idempotency on GETs (already cache-safe).

## 3. Users & Personas
- **Integrating developer (land):** wraps batch/pipeline writes in a retry loop with one header and stops worrying about double-charges.
- **Platform / RevOps (expand):** sees credits saved by replays and active-key volume; trusts that retries won't inflate spend.
- **Support:** a 409 with a clear code turns "why did my key act weird?" into a self-explanatory error.
- **RBAC:** `/console/idempotency` is admin + developer; the header behavior is available to any valid key. The stats endpoint is free (zero credits).

## 4. Differentiation
Table-stakes for a serious API — shipped to Stripe-grade depth: not just replay, but **conflict detection** and **credits-saved visibility**. Ties to **win #5 (operator-grade)**: the guarantee is observable (a console with live TTLs and saved-credits), not a silent implementation detail.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/idempotency.ts`** (in-memory, per-process, per-API-key; deterministic, no `Math.random`).
- `IdempotencyRecord` — `{ payload, status, fingerprint, path, creditCost, storedAt, expiresAt, replayCount }`, keyed by `${apiKey}::${key}`, 24h TTL.
- `fingerprintRequest(method, path, body)` — SHA-256 of method + path + body; the identity that distinguishes a legitimate retry from key reuse.
- `checkIdempotency(apiKey, key, fingerprint)` → `miss` | `replay` (increments replay + credits-saved counters) | `conflict` (fingerprint mismatch).
- `storeIdempotency(...)` records a fresh response with its credit cost.
- `getIdempotencyStats()` → active keys, replays served, credits saved, `ttlHours`, and a masked recent-keys list with `ttlRemainingMs`.
- Replaces the former `checkIdempotency`/`setIdempotency` in `cache.ts` (removed).

## 6. State / Integration
- **Gateway pipeline** (`app/api/v1/[...route]/route.ts`): before billing, a POST with `Idempotency-Key` is fingerprinted; a conflict returns 409, a hit replays (billing is skipped by the existing `!isIdempotentReplay` guard, so no re-charge), and a fresh success is stored with its `appliedCreditCost`. Responses carry `X-Idempotency-Key` and `X-Idempotency-Replayed: true|false`. A `GET /v1/idempotency` special-path returns the stats.
- **Scope:** pipeline POSTs — batch enrichment (`/v1/batch/enrich`, `/v1/batch/companies/enrich`), AI people search, streaming — where credits and duplication actually bite. (Special-path meta-writes are the deferred follow-up.)
- **Catalog:** an `idempotency-stats` entry in `src/data/endpoints.ts` feeds docs / Explorer / OpenAPI / Postman / CLI.
- **No Zustand slice** — the registry is gateway-side; the console reads it live over the API (like the async-jobs page).

## 7. UI
`/console/idempotency` (icon `Repeat2`): KPI row (active keys, replays served, credits saved, 24h retention), a "How idempotency works" card (send → retry → conflict) with a copy-paste cURL against a batch endpoint, and a live "Active idempotency keys" table (masked key, endpoint, replay count, credits saved, stored-ago, TTL-left) that auto-refreshes every 20s. Beautiful loading (skeletons), empty (educational + Explorer CTA), and error (retry) states. Semantic tokens; Framer Motion; light + dark. Cross-links to Explorer and Logs.

## 8. Telemetry
`idempotency_viewed` (console open) via `lib/telemetry.ts`. Replays/credits-saved are tracked in the gateway registry and surfaced through the stats endpoint.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (7-case idempotency suite: fingerprint determinism/collision, miss/replay/conflict, per-key scoping, credits-saved tallies, seeded masked view) · isolated build green (route `/console/idempotency`) · **live gateway curl**: POST `/v1/batch/companies/enrich` with a key → `X-Idempotency-Replayed: false`, charged 20; retry same body → `Replayed: true`, no credit charge; retry different body → **HTTP 409**. Console renders KPIs + seeded/live keys, 0 console errors.

## 10. Deferred
Idempotency for special-path meta-writes (feedback/suppression/jobs/data-shares); client-supplied TTLs; persistent/cross-region storage; an in-console live "run the demo" that fires the three calls; surfacing replay events directly in the Logs view.
