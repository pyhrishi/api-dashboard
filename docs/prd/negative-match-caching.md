# PRD: Negative-Match Caching

> A gateway spend-saver: `src/lib/gateway/negativeCache.ts` wired into the live `/api/v1` pipeline, plus a free `GET /v1/cache/negative` stats endpoint.

**Status:** Built (prototype is the spec) · **Roadmap:** F-036 (Next → shipped) · **Module:** `src/lib/gateway/negativeCache.ts` · **Endpoint:** `GET /v1/cache/negative`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Metered billing charges per lookup, and the positive edge cache runs *after* billing — so re-querying an identifier you already know isn't in the dataset (a coverage miss) costs a credit every time. Pipelines that retry, or re-run the same not-found list, quietly burn spend on lookups that can't succeed. Negative-match caching remembers misses so an identical repeat is served free.

## 2. Goals & Non-Goals
**Goals**
- Remember genuine coverage misses (a lookup that resolved to no match) keyed by path+params, for a short TTL.
- On an identical repeat GET, serve the cached miss **before billing** — at zero credits — and mark it `X-Negative-Cache: HIT`.
- Expose effectiveness via a free `GET /v1/cache/negative` (active entries, hits served, credits saved, hit rate).
- Misses expire (a miss can become a hit as data grows), so negatives are never stale for long.

**Non-Goals (this phase)** — caching across processes/regions (in-memory per process, like the positive cache); caching successful matches (that's the positive edge cache); caching validation/auth/rate errors as negatives; a configurable per-key TTL UI; persistence across restarts.

## 3. Users & Personas
- **High-volume developer (land):** stops paying for repeated not-found lookups automatically — no code change.
- **Finance / RevOps (expand):** sees credits saved and can reason about spend on unresolved traffic.
- **Platform:** lower load — repeat misses skip resolution entirely.
- **RBAC:** transparent gateway behavior; the stats endpoint needs a valid key but is billed 0.

## 4. Differentiation
Most APIs cache hits; charging full price for a *repeated miss* is the norm. The differentiated, operator-honest move is to cache the **negative** and refund the repeat to zero — and to prove it with a stats endpoint that reports exact credits saved. It ties to the operator-grade transparency theme: the gateway tells you what it saved you.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/negativeCache.ts`**.
- An in-memory `Map<key, { payload, status, expiresAt, hits, creditsSaved, firstSeen }>` with `NEGATIVE_TTL_SECONDS = 300`.
- `checkNegativeCache(key)` — pure read (expired entries evicted); `recordNegativeMiss(key, payload, status, ttl?)` — idempotent per key; `registerNegativeHit(key, creditsSaved)` — accrues per-entry + global stats; `getNegativeCacheStats()` — active entries, misses recorded, hits served, credits saved, hit rate, and the top entries by hits. `__resetNegativeCache()` for tests.
- Deterministic under a supplied `now` (TTL is time-based; tests inject the clock). No `Math.random`.
- Invariants (unit-tested, `src/lib/gateway/__tests__/negativeCache.test.ts`, 5 tests): miss on unknown; record then serve; TTL expiry; idempotent re-record; hit/credits/hit-rate accounting + top entries.

## 6. API & Gateway
Wired into the live pipeline (`app/api/v1/[...route]/route.ts`):
- **Before billing:** for a GET with no simulateStatus and not an idempotent replay, if the negative cache has the key → serve the cached miss, set `X-Negative-Cache: HIT` + `X-Credits-Cost: 0` (+ unchanged `X-Credits-Remaining`), register the saved credits, and **skip the billing engine** (guarded with `!result`).
- **After resolution:** if the result is a genuine coverage miss (`data.success === false`) on a GET, `recordNegativeMiss(...)` and mark `X-Negative-Cache: STORE`; otherwise the header is `MISS`.
- **`GET /v1/cache/negative`** — a special-path handler (catalog id `negative-cache-stats`, creditCost 0) returns `getNegativeCacheStats()`; documented in the catalog so it appears in docs/OpenAPI/Postman/CLI/Explorer.

## 7. UI
No dedicated page this phase — the behavior is observable where it matters: the `X-Negative-Cache` / `X-Credits-Cost: 0` response headers (visible in the Endpoint Explorer and Logs), and the runnable `/v1/cache/negative` stats endpoint. Credits-saved surfaces naturally in Billing (a repeat miss never decrements the balance).

## 8. Telemetry
No new client event — this is server-side gateway behavior; effectiveness is reported by the stats endpoint and reflected in existing billing/usage surfaces.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (5 new module tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live: `GET /api/v1/cache/negative` returns the stats snapshot (200). The record→serve path is exercised by the browser same-origin Explorer/Studio (curl from `::1` is IP-gated by the SOC 2 policy, as for all `/v1` routes).

## 10. Deferred
Cross-process/region negative cache (shared store); a configurable per-key TTL + enable toggle; a console panel charting credits saved over time; caching soft-miss variants; negative-cache invalidation hooks when the dataset updates.
