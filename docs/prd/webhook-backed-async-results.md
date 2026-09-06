# PRD: Webhook-Backed Async Results

> Submit a long-running job with a `callback_url`; Zinbit pushes the finished result to your endpoint as a signed webhook POST — with retries, a dead-letter queue, and replay — instead of you polling.

**Status:** Built (prototype is the spec) · **Roadmap:** F-072 (Next → shipped) · **Page:** `/console/webhook-deliveries` · **Source:** `src/lib/gateway/webhookDelivery.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Async jobs (F-060) let a caller kick off a long-running enrichment and poll it. Polling wastes requests, adds latency to "is it done yet?", and forces every integration to build a poller. The push alternative — deliver the result to a caller-supplied endpoint when the job finishes — is table-stakes for a serious async API, but only if it's *reliable*: signed, retried, dead-lettered, and replayable.

## 2. Goals & Non-Goals
**Goals**
- Accept a `callback_url` on job submission and push the finished result there as a signed POST.
- Sign every delivery (HMAC-SHA256, `X-Zinbit-Signature`) so the receiver can verify authenticity.
- Retry failed deliveries with exponential backoff; dead-letter after exhaustion; allow manual replay.
- A console that shows every delivery, its attempt timeline, the signed payload, and a live success rate.

**Non-Goals (this phase)** — real outbound HTTP (deliveries are simulated deterministically); per-customer retry-policy configuration; subscribing to arbitrary event types (that's the Webhooks product); delivery of streaming/partial results.

## 3. Users & Personas
- **Developer (land):** submits a job with `callback_url` and drops their poller — the 10-minute win.
- **Platform/ops (expand):** needs delivery reliability they can see — attempts, backoff, DLQ, replay (Win #5, operator-grade).
- **Security:** verifies the `X-Zinbit-Signature` against the endpoint secret.
- **RBAC:** the console is `admin | developer`.

## 4. Differentiation
Incumbents that offer async enrichment mostly make you poll; the ones with callbacks rarely expose the *delivery machinery*. Our angle is **Win #5 (operator-grade console)**: a full delivery timeline, exponential-backoff retries, a dead-letter queue, and one-click replay — the reliability surface incumbents hide. Signed payloads reuse the same HMAC model as the Webhooks product, so it's one coherent signing story.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/webhookDelivery.ts`** — an in-memory delivery registry, deterministic exactly like the async-job store (status derived from elapsed time; no `Math.random`).
- A delivery binds a `jobId` + `callbackUrl` + `event`, scheduled to first-attempt at the job's completion time.
- `successAttempt(url)` decides, deterministically per URL, which attempt succeeds (or none → DLQ), with keyword overrides (`ok`/`fail`) for demos.
- Attempts fire on a backoff schedule (0s · 30s · 2m · 10m); `viewOf` derives the current status (`pending` → `retrying` → `delivered`, or `failed`/DLQ) and attempt list from `now`.
- `signatureFor` = `t=<unix>,v1=<sha256(secret.t.payload)>` (reuses `lib/sha256`); per-delivery secret derived from the job+URL.
- `registerDelivery`, `getDelivery`, `listDeliveries`, `replayDelivery` (re-drives a non-delivered one to success), `getDeliveryStats`, deterministic seed (delivered / dead-letter examples).
- Invariants (unit-tested, `src/lib/gateway/__tests__/webhookDelivery.test.ts`, 8 tests): URL validation, first-try delivery + stable signature, pending-before-schedule, DLQ exhaustion, replay-to-success, refuse-replay-of-delivered, coherent stats, newest-first ordering.
- `asyncJobs.ts` `createAsyncJob` gains an optional `callbackUrl` → validates it and registers a delivery scheduled at completion; exposes `callback_url`/`delivery_id` on the job view.

## 6. API & Gateway
- `POST /v1/jobs` accepts `callback_url` in the body (invalid/non-http(s) is ignored). The job view returns `callback_url` + `delivery_id`.
- `GET /v1/deliveries` — free meta endpoint: delivered / retrying / dead-letter counts, success rate, recent deliveries with attempt timelines. `X-Credits-Cost: 0`.
- `POST /v1/deliveries/{id}/replay` — re-drive a failed delivery (404 unknown, 409 already delivered).
- Handled in the special-path block before route resolution, so it's free and independent of the enrichment pipeline.

## 7. UI
- **`/console/webhook-deliveries`** (`app/console/webhook-deliveries/page.tsx`, `RoleGuard admin|developer`):
  - A **dispatch panel** — pick kind, enter inputs + a callback URL, submit a real `POST /v1/jobs` (with a hint that `fail`/`ok` in the URL exercise the DLQ/first-try paths).
  - **KPIs** (delivered / retrying / dead-letter / success rate) and a **deliveries list**; each row expands to the **attempt timeline** (outcome, status code, latency, backoff), the **signature** (copyable) + payload preview, and a **Replay** button.
  - Polls while any delivery is pending/retrying, so the timeline advances live.
  - **States:** loading skeletons, empty, error (with retry), populated. Semantic tokens, Framer Motion.
- **Nav:** "Result Delivery" (Webhook icon) beside Async Jobs. Cross-links to Webhooks, Async Jobs, Logs.

## 8. Telemetry
`webhook_delivery_viewed` (on view), `async_result_dispatched` (job submitted with callback), `webhook_delivery_replayed` (manual replay). Registered in `lib/telemetry.ts` (delivery group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (8 new + async-jobs suite still passing) · isolated build ok (`/console/webhook-deliveries` emitted) · live gateway smoke: seeded stats (2 delivered / 1 DLQ), `POST /v1/jobs` with `callback_url` returns a bound `delivery_id`, and replaying the seeded DLQ delivery flips it to `delivered`.

## 10. Deferred
Real outbound HTTP; configurable retry policies / max attempts; signature-scheme versioning; delivering partial (206) results; per-endpoint callback defaults; a webhook-endpoint picker (reuse the Webhooks product's signing secrets).
