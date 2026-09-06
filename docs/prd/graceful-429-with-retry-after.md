# PRD: Graceful 429 with Retry-After

> A 429 isn't a failure — it's a schedule. The gateway tells clients exactly when to come back (`Retry-After`); a well-behaved client honours it, and falls back to exponential backoff with jitter when it's absent. This is the client-side half of rate limiting.

**Status:** Built (prototype is the spec) · **Roadmap:** F-134 (Now → shipped) · **Console:** `/console/retry-strategy` · **Source:** `lib/retry-after.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The gateway rate-limits with a token bucket (F-129) and returns a standard `Retry-After` on a 429 (F-130) — but a 429 is only graceful if the *client* handles it well. Naive clients either give up (dropping work) or hammer the endpoint (making the throttling worse). Developers need the pattern — honour `Retry-After`, else back off with jitter, retry only what's retryable — and a way to see it work against the real gateway. This is the missing client-side companion to the gateway's rate-limit story.

## 2. Goals & Non-Goals
**Goals**
- A correct, reusable retry model: parse `Retry-After` (seconds or HTTP-date), compute the next delay (honour Retry-After, else exponential backoff with jitter, capped), decide what's retryable (429/5xx, not 4xx).
- A `fetchWithRetry` wrapper developers can copy.
- A console that visualizes the retry schedule and lets you trigger a real 429 and read its Retry-After.

**Non-Goals (this phase)** — the gateway-side limiter/headers/tiers (F-129/F-130/F-131, owned separately); server-driven adaptive backoff; circuit breaking (F-066); per-endpoint retry budgets; a full SDK.

## 3. Users & Personas
- **Developers (land):** copy the `fetchWithRetry` pattern and see the backoff schedule for a given Retry-After — the 10-minute win.
- **SRE/platform:** confirm the gateway hands out actionable Retry-After on a real 429.
- **RBAC:** page visible to `admin | developer | billing` (read-only + a self-contained 429 trigger).

## 4. Differentiation
Table-stakes client resilience (Win #5, the Stripe/Twilio DX bar), shipped clean, with the differentiator being that it's *demonstrable against the real gateway*: the page triggers an actual 429 and reads the actual `Retry-After` the edge returned, and the same `lib/retry-after.ts` that powers the visualizer is a real, tested `fetchWithRetry` — not just prose. Cross-links to Idempotency so retried writes stay safe.

## 5. Data Model & Logic
- **`lib/retry-after.ts`** (SSOT), deterministic (seeded jitter, no `Math.random`):
  - `parseRetryAfter(value, now)` — integer seconds or HTTP-date → ms-from-now (null if absent/invalid; past clamps to 0).
  - `backoffDelay(retryIndex, policy, retryAfterMs?)` — honour Retry-After (capped at `maxDelayMs`), else `base·multiplier^index` with equal-jitter, capped.
  - `isRetryableStatus` (429/5xx), `shouldRetry(status, retryIndex, policy)`, `retryTimeline(policy, retryAfterMs?)` (the schedule; first retry honours Retry-After), `totalBackoff`.
  - `fetchWithRetry(input, init, policy, sleep?, fetchImpl?)` — a retrying fetch (both `sleep` and `fetchImpl` injectable for tests); returns the last response + attempts + waits.
- **State:** none — pure; the live 429 uses a throwaway key.
- Invariants (unit-tested, `src/lib/__tests__/retryAfter.test.ts`, 9 tests): parse seconds/HTTP-date/invalid/past-clamp; deterministic capped backoff honouring Retry-After; retryable 429/5xx not 4xx + attempt bounds; timeline length/honour/accumulation; `fetchWithRetry` retries-429-then-succeeds (honours Retry-After), gives-up-after-max, doesn't-retry-400.

## 6. API & Gateway
No gateway change — it consumes the `Retry-After` header F-130 already emits. The live demo drains a fresh key with a rapid burst of `GET /api/v1/_ping` to force a real 429, then reads its `Retry-After`.

## 7. UI
`/console/retry-strategy` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (max attempts, base backoff, cap, retryable statuses).
- **Two backoff ladders:** "honouring Retry-After" (a slider sets the server's Retry-After; the first retry uses it, then backoff) and "no Retry-After — exponential backoff", each rendered as a delay-bar ladder with the worst-case total.
- **Live 429 trigger:** fires a burst with a fresh key and surfaces the real 429 + its Retry-After (or "stayed under the limit").
- **A copyable `fetchWithRetry` snippet.**
- **States:** loading skeleton; live-run skeleton; a "no 429" success path; cross-links to Rate Limits / Rate-Limit Headers / Idempotency / Logs. Framer Motion on the ladder bars.

## 8. Telemetry
`retry_strategy_viewed` (view), `retry_429_triggered {got429}` (live trigger) — via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (9 new tests) · `next build` green (new `/console/retry-strategy`) · Playwright smoke (`e2e/retry-strategy.spec.ts`) · live: a burst triggers a real 429 whose `Retry-After` the page reads and renders as a retry schedule.

## 10. Deferred
Adaptive/server-driven backoff; circuit breaking (F-066); per-endpoint retry budgets; honouring `RateLimit-Reset` as an alternative to `Retry-After`; language SDKs beyond the JS snippet; auto-retry-until-success in the live demo (kept fast by showing the schedule instead).
