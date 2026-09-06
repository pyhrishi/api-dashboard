# PRD: Bounce Feedback Loop

> A closed deliverability loop: `src/lib/gateway/bounceFeedback.ts` + `POST` / `GET /v1/feedback/bounce`, wired into the live pipeline so a reported bounce suppresses the address on the next verify.

**Status:** Built (prototype is the spec) · **Roadmap:** F-045 (Next → shipped) · **Endpoints:** `POST /v1/feedback/bounce`, `GET /v1/feedback/bounce` · **Module:** `src/lib/gateway/bounceFeedback.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Deliverability scoring is a guess until a real send proves it. When a customer sends and an address hard-bounces, that's ground truth — and today most vendors never learn it, so they keep returning the same dead address. The bounce feedback loop lets customers feed their bounces back: report a bounce and the address is suppressed, so the next verify reflects what actually happened.

## 2. Goals & Non-Goals
**Goals**
- `POST /v1/feedback/bounce` reports a bounce (hard / soft / complaint) and suppresses the address.
- A subsequent `Verify Email Deliverability` on a suppressed address returns `undeliverable` with a "reported bounce" reason.
- `GET /v1/feedback/bounce` reports the registry (suppressed count, totals, by-type, recent).
- The loop is **real** — wired into the live gateway pipeline, not a mock preview.

**Non-Goals (this phase)** — cross-process/region shared suppression (in-memory per process, like the other gateway registries); ingesting bounces from ESP webhooks automatically (manual report this phase); a customer-scoped suppression list (global registry); un-suppress / appeal flow; applying suppression to non-email lookups.

## 3. Users & Personas
- **Deliverability-conscious developer (land):** posts bounces from their ESP and gets cleaner verify results with no other change.
- **Growth / email ops (expand):** stops paying to re-send to addresses they already know are dead.
- **Data quality:** the registry stats show how much of the base is suppressed.
- **RBAC:** the endpoints need a valid key (via middleware) but are billed 0.

## 4. Differentiation
The differentiated move is the **closed loop**: what the customer observes when they send (a bounce) directly changes what Zinbit returns next time — verify isn't a static score, it learns from ground truth. It builds on Automated re-verification (F-041) and the email verifier, and is honest about bounce classes (hard/complaint suppress immediately; soft only when they repeat).

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/bounceFeedback.ts`**.
- An in-memory `Map<normalizedEmail, BounceRecord{ email, type, reported_at, count }>` plus a report counter, with a small deterministic seed so the loop and stats are demoable immediately.
- `recordBounce(email, type)` (idempotent-incrementing), `getBounce(email)`, `isSuppressed(email)` (hard/complaint always; soft after `SOFT_SUPPRESS_AFTER = 3`), `getBounceStats()`. **No `Math.random`** in the logic; report timestamps are the only wall-clock and only for freshly-reported bounces.
- Invariants (unit-tested, `src/lib/gateway/__tests__/bounceFeedback.test.ts`, 6 tests): normalization; hard-bounce suppression; complaint suppression; soft-bounce suppresses only after repeating; a coherent seeded stats snapshot; a clean address is unaffected.

## 6. API & Gateway
Wired into the live pipeline (`app/api/v1/[...route]/route.ts`) as free special-path handlers, before route resolution + billing:
- **`POST /v1/feedback/bounce`** — body `{ email, type? }` (type defaults to `hard`, validated to hard/soft/complaint) → records the bounce, returns the record + whether it's now suppressed. Missing email → `400`.
- **`GET /v1/feedback/bounce`** — returns `getBounceStats()`.
- **Verify integration** (`src/lib/sandboxAPI.ts`, `email-verify` case): after scoring, if the address is suppressed, the result is overridden to `verdict: undeliverable`, a capped score, `smtp_check: false`, a `suppressed: true` flag, and a `bounce_feedback` check prepended to the existing checks — rendered by the Studio's deliverability panel with no UI change.
- Both endpoints are in the catalog (`bounce-report`, `bounce-stats`), so they appear in docs/OpenAPI/Postman/CLI/Explorer.

## 7. UI
No new page — the loop surfaces where verification already lives: the Endpoint Explorer runs both endpoints, and the existing Verify Email Deliverability Studio preset shows the `bounce_feedback` check and the `undeliverable` verdict for a suppressed address. The `suppressed` flag and reason ride the existing deliverability result shape.

## 8. Telemetry
No new client event — this is server-side gateway behavior; effectiveness is visible via the stats endpoint and the changed verify results.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (6 new module tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green · **live**: `GET /v1/feedback/bounce` returns the seeded snapshot; `POST` a hard bounce returns `suppressed: true`; a follow-up `GET` shows the incremented suppressed/total/by-type counts. Verify-suppression is exercised by the browser same-origin Studio (curl to `/v1/email/verify` is IP-gated by the SOC 2 policy).

## 10. Deferred
Automatic ESP-webhook bounce ingestion; cross-process/region shared suppression; customer-scoped suppression lists; an un-suppress/appeal flow; a console panel for the registry; applying suppression to phone/other channels.
