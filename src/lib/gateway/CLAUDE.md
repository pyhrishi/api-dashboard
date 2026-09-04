# API Gateway (`src/lib/gateway/`) — Guide

This is a **real, running** simulation of an enterprise API edge. Live requests to
`/api/v1/*` execute this pipeline. Data is mock (from `src/lib/sandboxAPI.ts`), but
auth, rate-limiting, billing, caching, and compliance genuinely run.

## Request lifecycle

1. **`middleware.ts`** (repo root) gates `/api/v1/*`: `validateApiKey` (auth.ts — format-only, accepts any `sk_test_`/`sk_live_` or an unverified JWT) + `checkRateLimit` (rateLimiter.ts — token bucket). Injects `x-request-id`, `x-api-key`, and `X-RateLimit-*`.
2. **`app/api/v1/[...route]/route.ts`** runs the pipeline, roughly in this order:
   DDoS/blackhole → data-residency (`451`) → load-balancer region → ISO-27001 headers →
   **special sub-routers** for `data-shares/*`, `partner/*`, `infra/*` (these return early) →
   `resolveEndpoint` (router.ts strips `/api`, matches `endpoints.ts` `path`) →
   WAF (`406`) → fraud/geo-velocity (`403`) → SOC2/MSA/DPA gating → idempotency →
   **billing** (`deductCredits`, `402`) → async `202` (`Prefer: respond-async`) →
   edge cache (`X-Cache: HIT/MISS/STALE`) → circuit breaker (serve-stale-on-error) →
   gzip (`CompressionStream`) → **privacy masking (LIVE keys only)** → standard envelope.
   Successful calls also `recordRevenueEvent` for partner attribution.

## Module map

`auth.ts` `rateLimiter.ts` `router.ts` `billing.ts` `waf.ts` `security.ts` (SOC2/fraud/DDoS/MSA/DPA)
`privacy.ts` (masking + opt-out) `cache.ts` (TTL + idempotency) `circuitBreaker.ts` `logger.ts`
`partnerRevenue.ts` (tiers/commission/payouts — surfaced by `/console/partners`)
`dataSharing.ts` (Snowflake/BigQuery zero-copy DDL — surfaced by `/console/data-sharing`)
`capacityForecast.ts` (OLS regression forecast — `/infra/*` routes).

## How to add an endpoint (do all of these — they stay in sync automatically)

1. Add the entry to **`src/data/endpoints.ts`** (`id`, `name`, `method`, `path` — include the `/v1/` prefix, `creditCost`, `parameters` with examples/validation, next-step recs). This alone flows into docs, OpenAPI, Postman, and the CLI.
2. Add its mock response in **`src/lib/sandboxAPI.ts`** `generateMockResponse()` (keyed by endpoint `id`) — otherwise the gateway returns empty/unknown data.
3. Verify end-to-end: `curl -H "Authorization: Bearer sk_test_x" http://localhost:<port>/api<path>` returns `200`.

## Rules

- **Auth accepts any well-formed key; billing lazily provisions** unknown `sk_test_`/`sk_live_` keys (`getApiKeyRecord` in billing.ts) — this is what closes the console↔gateway seam. Don't reject console-generated keys.
- **Mask for live keys only.** `sk_test_` sandbox responses stay unmasked (synthetic data, easier testing).
- **Base URLs never include `/v1`** (endpoint `path` carries it) — compose `${API_BASE_URL}${endpoint.path}`.
- In-memory Maps are per-isolate and reset; **seed** them at import (see partnerRevenue/dataSharing) so ledgers read as continuous.
- `createHash`/`crypto` is fine in route handlers (Node runtime); middleware is Edge — keep it to auth + rate-limit.
