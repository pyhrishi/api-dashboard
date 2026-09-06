# PRD: Standard Rate-Limit Headers

> Emit the emerging IETF-standard `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` / `RateLimit-Policy` headers on every response, plus `Retry-After` on a 429 — keeping the legacy `X-RateLimit-*` for compatibility — so any standard client can pace itself without guesswork.

**Status:** Built (prototype is the spec) · **Roadmap:** F-130 · **Routes:** header emission on all `/api/v1/*` (middleware + route), `/console/rate-limit-headers`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A well-behaved API tells clients how much quota they have left and when it resets, in a form their HTTP libraries already understand. The gateway previously emitted only the vendor-prefixed `X-RateLimit-*` — and only on a 429, never on success responses the client could actually read — with no `Retry-After` and none of the emerging IETF standard (`draft-ietf-httpapi-ratelimit-headers`). This feature upgrades the contract to the standard `RateLimit-*` set on **every** response plus `Retry-After` on throttling, so SDKs and off-the-shelf rate-limit middleware pace themselves automatically. It's the header contract sitting on top of the token-bucket limiter (F-129).

## 2. Goals & Non-Goals
**Goals**
- Emit **standard** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (**delta-seconds**, per the draft) and `RateLimit-Policy` (`100;w=60`) on **every** `/api/v1` response — success and error.
- Emit **`Retry-After`** (seconds) on a 429.
- Keep **legacy `X-RateLimit-*`** alongside (reset stays epoch there) so existing clients don't break.
- **One SSOT** builds the headers, consumed by the Edge middleware (emits) and the console (parses) — no drift.
- A **live header inspector** so a developer can see the exact headers on a real call, and the headers on a 429.

**Non-Goals (this phase)** — changing the limiter algorithm or limits (that's F-129 token-bucket); per-endpoint or per-plan quota headers (single global policy for now); the `RateLimit` combined structured-field form (draft-08) — the discrete headers are the widely-supported shape; server-push backoff; surfacing quota in the response body (headers only).

## 3. Users & Personas
- **Integrating developer (land):** their HTTP client reads `RateLimit-Remaining` / `Retry-After` and self-throttles — no custom backoff code. The inspector shows the exact headers in 10 seconds.
- **Platform/SRE (expand):** standard headers plug into off-the-shelf client-side rate-limit tooling and dashboards.
- **RBAC:** the console page is `admin | developer`; headers are emitted for every authenticated call regardless of role.

## 4. Differentiation
Table-stakes done to the actual standard, tied to **win #2 (developer-first ergonomics)**. The differentiator is **standards-correctness + provability**: the real IETF header names with reset as delta-seconds and a `RateLimit-Policy`, emitted on *every* response (not just 429s), verifiable with a one-click live inspector — where many APIs ship only ad-hoc `X-` headers on throttling. One SSOT guarantees the documented contract is the emitted contract.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/rateLimitHeaders.ts`** (Edge-safe, pure, `now` injected).
- `buildRateLimitHeaders(state, now)` → standard `RateLimit-*` (reset as `max(0, reset − now)` delta-seconds) + `RateLimit-Policy` (`${limit};w=${RATE_LIMIT_WINDOW_SEC}`) + legacy `X-RateLimit-*` (epoch reset).
- `retryAfterSeconds(state)` → per-token wait `max(1, ceil(window/limit))`; `buildRateLimitedHeaders` = the set + `Retry-After` (for 429s).
- `parseRateLimitHeaders(get, now)` → `{ limit, remaining, resetSeconds, policy, retryAfter, standard }`, preferring standard and falling back to legacy (converting epoch → delta). Consumes the `RateLimitResult` (`limit`/`remaining`/`reset`) the limiter already returns — no limiter change.

## 6. State / Integration
- **Middleware** (`middleware.ts`, Edge): on a 429 returns `buildRateLimitedHeaders`; on success sets `buildRateLimitHeaders` on both the forwarded request headers (for the route handler) **and the response** (so the client receives them). Legacy behavior preserved.
- **Route** (`app/api/v1/[...route]/route.ts`): unchanged pipeline; the middleware-set headers ride through.
- **No store slice.** Reuses the F-129 limiter's result shape.
- **Console** (`/console/rate-limit-headers`): a live inspector (fire a real call → parse + show limit/remaining/reset/policy + a quota gauge + standard-vs-legacy badge + raw header dump), a "see the headers on a 429" burst, and the header-contract reference. Cross-links to `/console/rate-limits` (F-129 bucket) and Logs.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, EmptyState, StatusBadge). **Idle** — inspect prompt. **Loading** — spinner. **Ready** — KPIs + quota gauge + standard/legacy badge + raw headers. **Error** — gateway didn't respond + retry. **429 demo** — animated Retry-After banner. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `rate_limit_headers_viewed` (page view) and `rate_limit_inspected` (status, remaining, standard). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**9-case** suite: standard headers + delta reset + policy, legacy retained (epoch), floor/clamp, Retry-After on 429 + per-token math, parse prefers standard / falls back to legacy / nulls / build→parse round-trip) · isolated `next build` green (`/console/rate-limit-headers` present) · Playwright smoke (`e2e/rate-limit-headers.spec.ts`) · live drill — a real call returns `RateLimit-Limit/Remaining/Reset/Policy` + `X-RateLimit-*`; a burst returns 429 with `Retry-After`. 0 console errors.

## 10. Deferred
Per-plan / per-endpoint quota policies + multiple `RateLimit-Policy` entries; the draft-08 combined `RateLimit` structured field; `RateLimit-Reset` as an HTTP-date option; quota surfaced in the response body; sharing the canonical limit value from the F-129 `lib/rate-limit.ts` SSOT (currently self-contained to decouple release timing).
