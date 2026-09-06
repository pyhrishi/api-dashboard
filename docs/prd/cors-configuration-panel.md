# PRD: CORS Configuration Panel

> Configure which browser origins may call your API, and test any origin against a real preflight — the policy you set is exactly what the gateway sends back.

**Status:** Built (prototype is the spec) · **Roadmap:** F-082 (Next → shipped) · **Page:** `/console/cors` · **Source:** `src/lib/gateway/cors.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Front-end apps calling the API directly from the browser need CORS. Getting it right is fiddly — wildcard vs allowlist, the rule that `*` is invalid with credentials, `Vary: Origin`, which methods/headers to allow, preflight caching — and today there's no way to configure it or to see what the gateway will actually send back for a given origin. Developers guess, ship, and debug in the browser console.

## 2. Goals & Non-Goals
**Goals**
- A panel to set the CORS policy: mode (allowlist / wildcard / disabled), allowed origins, credentials, methods, headers, preflight max-age.
- The policy **actually governs the live gateway** — it answers preflight (OPTIONS) and reflects `Access-Control-*` on responses accordingly.
- A live preflight tester: type an origin, see the exact headers + allow/block verdict.
- Correct-by-construction semantics (credentials reflect the origin instead of `*`, `Vary: Origin`, method gating).

**Non-Goals (this phase)** — per-key or per-environment CORS scoping; regex / wildcard-subdomain origin patterns; private-network-access preflight headers.

## 3. Users & Personas
- **Front-end / full-stack developer (land):** whitelists their app origin and confirms a real preflight passes — the 10-minute win.
- **Security / platform (expand):** controls exactly which origins may reach the API from a browser, credentials on/off (Win #5, operator-grade + security).
- **RBAC:** `admin | developer` edit; **billing** can view (read-only).

## 4. Differentiation
Most APIs bury CORS in a docs page or a single "allowed origins" text box and make you debug in the browser. The operator-grade move (Win #5) is a **live preflight tester** wired to the real policy: you see the actual `Access-Control-*` headers the gateway returns for any origin before you ship. And it's seam-closed — the panel edits the same policy the gateway enforces, so what you configure is what runs.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/cors.ts`** (in-memory policy, seeded; pure/deterministic).
- `CorsPolicy` = `mode` (allowlist/wildcard/disabled), `allowedOrigins`, `allowCredentials`, `allowedMethods`, `allowedHeaders`, `maxAgeSeconds`.
- `evaluateCors(origin, method)` → `{ allowed, reason, headers }`: no Origin ⇒ same-origin (allowed, no headers); disabled ⇒ blocked; wildcard ⇒ `*` (or the reflected origin when credentials are on, since `*` is invalid with credentials); allowlist ⇒ reflect if listed, else block (no `Access-Control-Allow-Origin`). Sets `Access-Control-Allow-Methods/Headers/Max-Age`, `Allow-Credentials`, and `Vary: Origin` when reflecting; gates `allowed` on the method.
- `updateCorsPolicy` (validates mode + max-age bounds + origin format), `addAllowedOrigin`/`removeAllowedOrigin`, `getCorsStats`, `isValidOrigin`.
- Invariants (unit-tested, `src/lib/gateway/__tests__/cors.test.ts`, 11 tests): origin validation; add/remove/de-dup; mode + max-age validation; same-origin no-op; allowlist reflect + credentials + Vary; block off-list; wildcard reflects-with-credentials vs `*`; disabled sends nothing; method gating; stats.

## 6. API & Gateway
- **`middleware.ts`:** an early OPTIONS pass-through — a browser preflight has no `Authorization`, so it must bypass the auth gate and reach the route handler.
- **`route.ts`:** after building the response headers, `evaluateCors(Origin, method)` merges the `Access-Control-*` headers onto every response; an OPTIONS request short-circuits to `204` with those headers. A `/v1/cors` special-path: `GET` (policy + stats), `PATCH` (update), `POST /v1/cors/test` (evaluate a hypothetical origin server-side — the browser forbids scripts from setting `Origin`, so the tester posts the candidate). `PATCH` + `OPTIONS` method handlers exported.

## 7. UI
- **`/console/cors`** (`app/console/cors/page.tsx`, `RoleGuard admin|developer|billing`): KPIs (mode, origins, credentials); a mode `SegmentedControl`; an origins list with add (validated) / remove (allowlist mode only); a credentials toggle; method chips; a max-age field; and a **live preflight tester** (origin → `POST /v1/cors/test` → allow/block verdict + the returned headers). Edits apply immediately (PATCH). **billing** sees a read-only view. States: loading skeletons, error (retry), ready. Semantic tokens, Framer Motion.
- **Nav:** "CORS Policy" (Globe icon) beside Security Hub. Cross-links to Security Hub.

## 8. Telemetry
`cors_viewed` (on view), `cors_policy_updated` (with the changed keys), `cors_preflight_tested` (origin + allowed). Registered in `lib/telemetry.ts` (security group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (11 new tests) · live gateway smoke: `GET /v1/cors` returns the policy; an OPTIONS preflight from an allowlisted origin returns `204` with `Access-Control-Allow-Origin` reflected + credentials/methods/max-age (and succeeds with no auth header, proving the middleware pass-through); a GET reflects the origin; `POST /v1/cors/test` blocks an off-list origin with a reason.

## 10. Deferred
Per-key / per-environment CORS; wildcard-subdomain and regex origin patterns; private-network-access preflight; expose-headers configuration; an audit trail of policy changes.
