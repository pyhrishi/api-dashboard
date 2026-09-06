# PRD: Request Replay & Debug Echo

> Add one header and the gateway shows you exactly how it read your request — params, region, policies, cost — before you spend a call; and replay any past request to reproduce a bug for real.

**Status:** Built (prototype is the spec) · **Roadmap:** F-074 (Next → shipped) · **Page:** `/console/debug` · **Source:** `src/lib/gateway/debugEcho.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Integration bugs are usually "the gateway didn't read my request the way I expected" — a param dropped, the wrong region, masking on when you thought it was off, a surprise cost. Today the only way to find out is to spend a real call and infer from the response. And when a call misbehaves, there's no faithful way to reproduce it — the Logs page's "Replay" was a mock that just re-logged the original response. Developers need to see the gateway's interpretation without spending a credit, and to replay a real request exactly.

## 2. Goals & Non-Goals
**Goals**
- A universal `X-Debug-Echo: true` header that returns the gateway's parsed view of any request (params, redacted headers, matched endpoint, region/node, key type + env, privacy framework, would-be cost, policy checks) at **zero credits**, without executing it.
- Never leak secrets — redact Authorization / API key / cookie in the echo.
- Make request replay **real**: re-fire a logged request against the gateway and record the actual response; fix the Logs page's mock replay.
- A console that composes+inspects+runs requests and replays from logs with a status diff.

**Non-Goals (this phase)** — saved request collections; replay-with-edits (mutating params before replay); echo for unmatched routes (a 404 fires first); a full HTTP client (curl/Postman replacement).

## 3. Users & Personas
- **Developer (land):** debugs an integration by inspecting the gateway's read before spending a call — the 10-minute win.
- **Support/ops (expand):** reproduces a customer's failing request by replaying it from logs (Win #5, operator-grade).
- **Security:** the echo must never expose a full key.
- **RBAC:** the inspector is `admin | developer`.

## 4. Differentiation
httpbin echoes your request; Stripe has a request inspector in its dashboard. Our angle ties to **Win #5 (operator-grade console)**: the echo reports not just what we received but *how the edge interpreted it* — which region, which compliance framework, which policies fired, and the exact credit cost — and pairs it with real replay from your own logs. It also closes a coherence gap (the mock Logs replay becomes real), consistent with the "no dead affordances" principle.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/debugEcho.ts`** (pure, deterministic).
- `buildDebugEcho(ctx)` formats a context the route handler assembles (it does not recompute region/framework, so the echo can never disagree with a live call). Returns `received` (method/path/params/redacted headers/body_present), `interpreted` (endpoint match, region/node, environment, auth key-type/prefix, privacy framework + whether masking applies, rate limit), `billing` (base + would-charge + note), and `policies[]` (auth / rate-limit / routing / masking / billing, each with a status).
- `redactHeaders` masks Authorization to `Bearer <prefix>••••`, hides `x-api-key`/`cookie`/`idempotency-key`; `keyTypeOf` classifies sandbox/live/jwt.
- Invariants (unit-tested, `src/lib/gateway/__tests__/debugEcho.test.ts`, 6 tests): header redaction; the echo never contains the raw key; masking-applies for a live key under a framework; sandbox returns unmasked; unmatched route flagged + billing skipped; would-be charge surfaced without executing.

## 6. API & Gateway
- `X-Debug-Echo: true` on any request → in `route.ts`, after params are parsed and region/framework resolved (endpoint matched) and **before** billing, short-circuit: build the echo from the live context and return it at `X-Credits-Cost: 0` with `X-Debug-Echo: true`. The request is inspected, not executed.
- Replay reuses the existing gateway — the console (and the Logs page) re-issue the logged request with the current key and record the real response via `logApiRequest`, so it flows into Logs / Analytics / Security like any call.

## 7. UI
- **`/console/debug`** (`app/console/debug/page.tsx`, `RoleGuard admin|developer`): a **request composer** (endpoint + identifier); **Inspect** (sends `X-Debug-Echo`) renders the interpretation, policies (status-badged), and the redacted `received`; **Run live** shows the real response; a **Replay from Logs** section lists recent `apiLogs` with a **Replay** button that re-fires for real and shows a `was → now` status diff. States: idle / loading / error / results.
- **Logs page:** `handleReplay` now performs a real gateway re-fire (replacing the `setTimeout` mock and its `Math.random`).
- **Nav:** "Request Inspector" (Bug icon) beside Logs. Cross-links to Logs.

## 8. Telemetry
`debug_inspector_viewed` (on view), `debug_echo_run` (inspect, with matched + would_charge), `request_replayed` (with was/now/changed). Registered in `lib/telemetry.ts` (debugging group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (6 new tests) · isolated build ok (`/console/debug` emitted) · live gateway smoke: `X-Debug-Echo: true` returns the interpretation at 0 credits with the Authorization header redacted to `Bearer sk_live_••••`, correct region/node, would-charge, and policy list.

## 10. Deferred
Echo for unmatched routes; saved request collections; replay-with-edits; a diff of response bodies (not just status); exposing the echo as a documented catalog endpoint (it's a universal header, like `fields`).
