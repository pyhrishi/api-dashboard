# PRD: Batch Endpoint

> A gateway primitive in the API catalog (`src/data/endpoints.ts`), runnable from the Endpoint Explorer. The synchronous counterpart to async Bulk Enrichment Jobs.

**Status:** Built (prototype is the spec) · **Roadmap:** F-059 (Now) · **Endpoint:** `POST /v1/batch/enrich`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriching a list one call at a time is slow and noisy — N round-trips, N log lines, and no single view of what matched. Developers want to submit many inputs in one request and get a per-item status back, with partial failures visible rather than swallowed. Batch Endpoint is that primitive: one call, many lookups, per-item results, one summary.

## 2. Goals & Non-Goals
**Goals**
- One `POST /v1/batch/enrich` runs a single operation (people / company / phone / email-verify) over up to 50 inputs.
- **Per-item status** (matched / missed) with the full result for each, plus a summary (total, matched, missed, match rate, credits).
- **Only-charge-on-match** billing in the summary.
- Deterministic and identical to the equivalent single lookups (reuses the resolvers).
- Flows through the single source of truth — docs, Endpoint Explorer (runnable), OpenAPI, Postman, CLI — automatically.

**Non-Goals (this phase)** — mixed operations in one batch (one operation per call); >50 items or CSV upload (that is Bulk Jobs, the async path); async/polling (this is synchronous); real per-item gateway billing (the flat endpoint cost applies at the gateway; the response summary states the true per-match cost).

## 3. Users & Personas
- **Integrating Developer (land):** enriches a list in one round-trip; reads per-item status to handle misses.
- **Engineering / Platform Lead (expand):** fewer calls, one log entry, a clear match rate per batch.
- **RBAC:** admin + developer (consumes credits/keys), same as single lookups.

## 4. Differentiation
Table-stakes for a serious API (the Stripe/Twilio bar), shipped clean: per-item status, a decisive summary, only-charge-on-match, and a hard 50-item cap so batch can't be abused as an unbounded scrape. Cross-linked to Bulk Jobs so the sync/async split is obvious.

## 5. Data Model & Logic
Single source of truth: **`lib/batch-runner.ts`** → `runBatch(operation, rawInputs): BatchResult | null`.
- `parseBatchInputs` splits on commas/newlines, trims, de-duplicates (case-insensitive), and caps at `BATCH_MAX_ITEMS` (50).
- Fans out over the existing resolvers (`resolvePersonFromEmail`, `resolveCompanyFromDomain`, `verifyPhoneForEmail`, `verifyEmailDeliverability`); an item that resolves is `matched`, else `missed`. **No `Math.random`.**
- `BatchResult`: `operation`, `summary { total, matched, missed, match_rate, credits }`, `results: [{ input, status, data }]`. Credits = matched × per-op cost.
- Invariants (unit-tested in `src/lib/__tests__/batchRunner.test.ts`): operation validation; parse dedupe + cap; null on bad op / empty inputs; summary arithmetic; missed items are null and uncharged; deterministic.

## 6. API & Gateway
- **Endpoint:** `POST /v1/batch/enrich` (catalog id `batch-enrich`), params `operation` + `inputs` (both strings), flat `creditCost` 1.
- **Mock:** `src/lib/sandboxAPI.ts` `batch-enrich` case returns `{ success, ...BatchResult }`; invalid op or empty inputs returns `INVALID_PARAMETERS`.

## 7. UI
- **Runnable in the Endpoint Explorer** (`/console/explorer`) — both params are strings, so the existing request builder runs it and renders the per-item JSON + summary. No new page or store slice.
- **Cross-link:** a next-step recommendation points to Bulk Jobs for large/CSV lists.
- **States:** the Explorer's existing loading/response/error states apply.

## 8. Telemetry
Reuses the gateway's request logging + metering. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (6 new tests + existing suites).

## 10. Deferred
Mixed-operation batches; per-item gateway billing; >50 items / CSV (Bulk Jobs); a dedicated batch UI beyond the Explorer.
