# PRD: Async Job Endpoints

> **A real gateway API** (`/v1/jobs/*`) plus a live-polling console page. Ships at `/console/async-jobs` and as four catalog endpoints surfaced in docs / Explorer / OpenAPI / Postman / CLI.

**Status:** Built (prototype is the spec) · **Roadmap:** F-060 (Now) · **Route:** `/console/async-jobs` (+ `POST/GET /v1/jobs`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriching thousands of rows synchronously means holding a connection open for minutes and handling timeouts, retries, and partial failures by hand. The industry-standard answer is an async job: submit the work, get an id, and poll (or get a webhook) for the result. Async Job Endpoints give Zinbit that pattern — `POST /v1/jobs` to kick off, `GET /v1/jobs/{id}` to poll — sitting between the synchronous **Batch endpoint** (F-059, small lists in one call) and **CSV Bulk Jobs** (F-019, the console upload path).

## 2. Goals & Non-Goals
**Goals**
- `POST /v1/jobs` accepts up to 10,000 identifiers + an operation, charges credits up front, and returns **202** with a job id — immediately.
- `GET /v1/jobs/{id}` returns live **status** (queued / running / completed / cancelled), **progress** (processed of total), matched/missed counts, and the per-row **results** once complete.
- `GET /v1/jobs` lists a key's recent jobs; `POST /v1/jobs/{id}/cancel` stops an in-flight one.
- A console page that **runs the same API live** — start, watch, cancel, expand results.
- Deterministic progression and results (results agree with the equivalent single lookup).

**Non-Goals (this phase)** — webhook delivery of results (F-072, the Explorer/console poll for now); scheduled/recurring jobs (F-268); priority lanes (F-138); parallel worker fan-out (F-280); persisting jobs across a gateway restart (in-memory, like the other gateway modules); per-row retry queue (that's a CSV Bulk Jobs feature).

## 3. Users & Personas
- **Integrating Developer (land):** fires a 5,000-row enrichment in one call and polls a job id instead of babysitting a long request.
- **Data Engineer (expand):** wires the job API into a pipeline; the console page is the observability view.
- **RBAC:** `admin | developer` (creating a job consumes credits and a key); the page is guarded by `RoleGuard`.

## 4. Differentiation
Table-stakes async pattern, shipped **operator-grade** (win #5): a **live console view** of jobs created through the API — progress bars, matched/missed, cancellation, and expandable results — not just a JSON endpoint and a docs page. Credits are transparent (charged up front, shown per job), tying to win #4.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/asyncJobs.ts`** (in-memory store, like the other gateway modules).
- `createAsyncJob({ apiKey, endpoint, inputs, perRowCost })` → validates (non-empty, ≤ 10,000), charges `inputs.length × perRowCost` via the billing module, queues the job, returns the public view.
- `getAsyncJob(id)`, `listAsyncJobs(apiKey)`, `cancelAsyncJob(id)`.
- **`AsyncJobView`:** `id`, `kind` (people / companies), `endpoint`, `status`, `total`, `processed`, `succeeded`, `failed`, `progress`, `credits_charged`, timestamps, and `results` (capped at 100 inline; `results_truncated` for larger jobs).
- **Deterministic progression:** `processed = min(total, floor(elapsedSeconds × 3))` computed on every read — a job advances by wall-clock with **no background worker and no `Math.random`**. Results come from the same `resolvePersonFromEmail` / `resolveCompanyFromDomain` resolvers as single lookups, so a job row equals its direct call.
- Invariants (unit-tested in `src/lib/__tests__/asyncJobs.test.ts`): empty/oversized rejected; queued→completed by elapsed time; one credit per input; list is key-scoped and newest-first; cancel works in-flight and 409s after completion; unknown id → null.

## 6. API & Gateway
- **Routes** handled by a `/v1/jobs/*` block in `app/api/v1/[...route]/route.ts` (same pattern as the data-shares / partner blocks), *before* the generic catalog dispatch, so dynamic ids work:
  - `POST /v1/jobs` → 202 (create); 402 out of credits; 413 too large; 400 bad input.
  - `GET /v1/jobs/{id}` → 200 (poll); 404 unknown.
  - `GET /v1/jobs` → 200 (list).
  - `POST /v1/jobs/{id}/cancel` → 200; 404 unknown; 409 already completed.
- Inputs accepted as a JSON array or a comma/newline-delimited string (so the Explorer's array field works).
- **Catalog:** four entries (`async-job-create/get/list/cancel`) drive docs, Explorer, OpenAPI, Postman, and the CLI. The Explorer now substitutes `{id}`-style path params in the Run URL — a small general fix this feature required.

## 7. UI
- **`/console/async-jobs`** (new page): a "New job" panel (people/companies segmented control, inputs textarea, credit preview, Start) and a live-polling job list. Each job card: status badge (pulsing while running), animated progress bar, matched/missed/credits, a Cancel button while in-flight, and expandable per-row results. Cross-links to CSV Bulk Jobs, Explorer, and Logs.
- Polls `GET /v1/jobs` every 1.5s **only while a job is queued/running**, then stops. Fetches the real gateway with the active key (like the partners / data-sharing pages).
- **States:** loading (skeletons), empty (icon + how to start one, including via the API), error (retry), success (the list). Semantic tokens only; light + dark; Framer Motion.

## 8. Integration
- **Nav:** "Async Jobs" (Boxes icon) after Bulk Jobs, roles `admin | developer`.
- **Single sources of truth:** results via the shared resolvers; billing via the gateway billing module; catalog via `endpoints.ts`.

## 9. Telemetry
`async_jobs_viewed` (on load), `async_job_created` (kind + size), `async_job_cancelled`.

## 10. Verification
`tsc` clean · lint 0/0 · `jest` green (6 async-job cases; 211 total) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live: created + polled + cancelled + listed + 404 via curl through the real gateway, and a console walkthrough (start → live progress → completed 5/5 → expanded results).

## 11. Deferred
Webhook result delivery (F-072); scheduled/recurring jobs (F-268); priority lanes (F-138); worker fan-out (F-280); durable job persistence; per-row retry queue.
