# PRD: Token-Bucket Rate Limiting

> Make the gateway's per-key token bucket visible and testable: burst up to the capacity instantly, then throttle to the steady refill rate — preview a burst with a deterministic simulator, or fire a real one and watch the bucket drain to 429s.

**Status:** Built (prototype is the spec) · **Roadmap:** F-129 (Now → shipped) · **Console:** `/console/rate-limits` · **Source:** `lib/rate-limit.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The gateway already rate-limits every key with a token bucket in the edge middleware — but it was invisible: developers hit a 429 in production with no way to understand the limit, preview how a burst would behave, or confirm the throttling is real. Token-Bucket Rate Limiting surfaces the model (capacity, refill, burst), lets you simulate a burst without spending calls, and fires a real burst against the gateway so you can watch the bucket drain.

## 2. Goals & Non-Goals
**Goals**
- One source of truth for the bucket constants, shared by the console and the real limiter.
- A deterministic client simulator: preview any burst size/rate and see allowed vs throttled, and the first 429.
- A real burst test against the gateway showing `X-RateLimit-Remaining` draining to 429s with a Retry-After.

**Non-Goals (this phase)** — per-plan/per-key configurable limits (the bucket is one tier here); distributed/Redis-backed limiting (in-memory per isolate, as the middleware notes); the standard response-header contract (that's F-130 Standard rate-limit headers, at `/console/rate-limit-headers`); quota (monthly) limits — this is request-rate, not spend.

## 3. Users & Personas
- **Developers (land):** understand the limit and preview a burst before shipping a tight loop — the 10-minute win.
- **Platform/SRE:** confirm the limiter actually throttles (the live burst) — the operational control.
- **RBAC:** page visible to `admin | developer | billing` (read-only + a self-contained burst test).

## 4. Differentiation
Table-stakes for an operator-grade API (Win #5), shipped clean, with a coherence twist most vendors skip: the console's simulator runs the *same math* as the real limiter because both read the constants from one SSOT (`lib/rate-limit.ts`) — the middleware's `rateLimiter.ts` imports them — so "what you preview is what the gateway enforces," and the live burst proves it against the real edge.

## 5. Data Model & Logic
- **`lib/rate-limit.ts`** (SSOT, Edge-safe, pure, deterministic) — `RATE_LIMIT` (`capacity` = burst, `refillPerMinute` = sustained), `refillPerSecond`, `simulateBurst(count, ratePerSecond, capacity)` → a per-request timeline (`remaining`, `allowed`) starting from a full bucket and refilling by elapsed time between requests, `summarizeBurst` (allowed/throttled/firstThrottle), `fillPct`, `retryAfterSeconds`, `rateSummary`.
- **`src/lib/gateway/rateLimiter.ts`** now **imports the constants from `lib/rate-limit.ts`** instead of hardcoding them — one source of truth for the console and the real edge limiter. `checkRateLimit`'s return shape (`limit`/`remaining`/`reset`) is unchanged, so the header layer (F-130) is unaffected.
- **State:** none — pure; the live burst uses a throwaway key.
- Invariants (unit-tested, `src/lib/__tests__/rateLimit.test.ts`, 5 tests): constants coherent; a fast burst drains then throttles (≈capacity allowed, rest 429), deterministic, first request leaves `capacity−1`; a burst slower than the refill rate is never throttled; `fillPct`/`retryAfterSeconds`; empty + clamped (max 1000) inputs.

## 6. API & Gateway
No new endpoint. The middleware's token bucket (now sourced from the SSOT) enforces limits on every `/api/v1/*` request and returns `X-RateLimit-*` + 429. The live burst fires rapid `GET /api/v1/_ping` with a **fresh key** (a full bucket, free 404s) and reads the rate-limit headers per response; the edge's DDoS protection may add throttling on top of the bucket, which the copy notes honestly.

## 7. UI
`/console/rate-limits` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (burst capacity, refill rate, 429 on exhaustion, Retry-After).
- **Burst controls** (request count + rate sliders).
- **Simulated preview** (deterministic): a per-request strip (green allowed / amber throttled) + allowed / throttled / first-429 stats — no requests sent.
- **Live burst**: fires a real burst with a fresh key and shows the reconstructed drain + allowed/429 counts + Retry-After.
- **Bucket fill** bar for the simulated end-state.
- **States:** loading skeleton; live-burst running skeleton; error card; cross-links to Rate-Limit Headers / Analytics / Logs. Framer Motion on the fill bar.

## 8. Telemetry
`rate_limits_viewed` (view), `rate_limit_simulated {burst, rate}` (simulator change), `rate_limit_burst_tested {requests, throttled}` (live burst) — via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (5 new tests) · `next build` green (new `/console/rate-limits`) · Playwright smoke (`e2e/rate-limits.spec.ts`) · live burst against the gateway: a 120-request burst with a fresh key is throttled with 429s (rate-limit + DDoS edge protection).

## 10. Deferred
Per-plan / per-key configurable buckets; Redis-backed distributed limiting; quota (monthly) limits; a rate-limit-over-time chart from real traffic; retry/backoff code snippets; separating the DDoS layer from the rate-limit layer in the live burst view.
