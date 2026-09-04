# PRD: Bulk Enrichment Jobs

| | |
|---|---|
| **Status** | In Build (prototype complete — reverse-engineered spec) |
| **Owner** | Product (dev7@zintlr.com) |
| **Last updated** | 2026-09-04 |
| **Prototype route(s)** | `/console/jobs`, `/console/jobs/[id]`, `/console/jobs?new=1&endpoint=<id>` |
| **Source artifacts** | `app/console/jobs/page.tsx`, `app/console/jobs/[id]/page.tsx`, `app/console/jobs/NewJobDrawer.tsx`, `app/console/jobs/jobs-shared.tsx`, `lib/store.ts` (`BulkJob` slice), `lib/bulk-runner.ts`, `lib/csv.ts`, `lib/bulk-samples.ts`, `lib/insight-engine.ts` (`summarizeBulkJob`), `e2e/bulk-jobs.spec.ts` |

## 1. Context & Problem
Every enrichment competitor (Clearbit, Apollo, ZoomInfo) lets a user enrich a *file*, not just a record. Zinbit only offered per-request calls (Explorer, SDKs) and a 50-domain batch endpoint. A developer with 500 leads had to write a loop; a RevOps user could not use the product at all. Competitors also hide the cost until after the run and force a full re-run on partial failure.

Bulk Enrichment Jobs turns any eligible GET endpoint into a row-per-request job with a **cost preview before run**, **live per-row status through the real gateway**, **retry-only-failures**, and **CSV/JSON export** — the developer's fastest path from "one call works" to "my dataset is enriched", and the moment usage (and spend) steps up.

## 2. Goals & Non-Goals
**Goals**
- G1 — Upload → enriched download in < 10 minutes for a 500-row CSV without writing code.
- G2 — Zero surprise billing: exact credit cost shown before Run; invalid rows never billed; credits deducted only on success.
- G3 — Partial failure is a first-class state: failed rows are retryable in isolation; results are never lost.
- G4 — Every row is a real gateway request: appears in Logs/Analytics/Security, respects scopes, rate limits, masking.
- G5 — Enterprise controls: tenant-scoped, role-guarded (billing = read-only), audit-logged create/delete.

**Non-Goals (this phase)** — scheduled/recurring jobs; server-side asynchronous execution (`/v1/jobs` API); warehouse/CRM destinations; files > 5 MB or > 2,000 rows per job; POST endpoints (AI search, batch enrich) as bulk sources.

## 3. Users & Personas
- **Integrating Developer** — wants to validate coverage on their real list before wiring the SDK. Win: sample data or their CSV in one click; sees match rate.
- **RevOps / Data Leader** — enriches lead lists for CRM import; needs downloadable results and a clear cost.
- **Org Admin / Billing** — needs cost predictability, an audit trail, and confidence that billing role can review but not spend.

## 4. User Stories & Flows
1. *As a developer*, I open Bulk Jobs → New job → pick "Find Phone by Email" → drop `leads.csv` → columns auto-map → I see "482 valid · 18 will be skipped (invalid email)" → cost 964 credits, balance after 4,036, ~1m 50s at 4× → Create & run → rows light up → download CSV.
2. *As a developer with a tight budget*, I see "You're 300 credits short" with a Recharge link; I can save a draft and run later.
3. *As RevOps*, a run finishes with 12 failures (404 not in coverage). The Insight card explains the dominant failure and suggests Reverse Enrichment; I click "Retry 12 failed" after fixing inputs.
4. *As an admin*, I switch organizations mid-run — the job pauses with "Paused because you switched organizations" and resumes later without double-billing rows already completed.
5. *As a billing user*, I open a job to review credits spent vs estimate; Run/Delete are unavailable with an explanation.
6. *From the Explorer*, "Run in bulk" opens the wizard with the current endpoint preselected; from ⌘K, "New bulk enrichment job".

## 5. Functional Requirements
- **FR-1 Eligible endpoints:** GET, non-deprecated, ≥1 required parameter (`isBulkEligible`). Shown with per-row credit cost.
- **FR-2 Sources:** CSV/TSV/TXT upload (header row required; comma/semicolon/tab/pipe auto-detected; quoted fields; BOM stripped; ≤ 5 MB; > 2,000 rows truncated with a visible flag), pasted list (one value per line → first required param), and a deterministic 40-row sample set with 3 invalid rows.
- **FR-3 Mapping:** parameter → column, auto-mapped by name/alias (`autoMapColumns`); required params must be mapped to continue; live preview of the first 4 mapped rows.
- **FR-4 Validation preview:** per-row validation with the shared validator; counts of valid vs to-be-skipped, top 3 skip reasons; skipped rows are never sent nor billed.
- **FR-5 Key selection:** only active/expiring keys in the current environment with scope for the endpoint (`'*'`/`'all'` wildcards honored). No usable key → link to create one.
- **FR-6 Cost preview:** valid rows × endpoint credit cost; balance before/after; shortfall blocks Run (draft still allowed) and shows a recharge prompt (telemetry `upgrade_prompt_shown/clicked`).
- **FR-7 Execution:** client runner, configurable concurrency 2/4/8; one real `GET /api/v1/...` per row with `Authorization: Bearer <key>` and an `Idempotency-Key` of `<job>:<row>:<attempt>`; success → store output, deduct credits, increment key usage; failure → error message from gateway envelope; 429 → back off (Retry-After or 800ms × attempt), up to 3 attempts; network error → retry up to 3.
- **FR-8 Lifecycle:** draft → queued → running → paused | completed | completed_with_errors | cancelled. Pause/Resume keeps completed rows. Cancel and Delete use two-click confirmation. Reload marks in-flight jobs paused ("Interrupted by a page reload").
- **FR-9 Guardrails:** insufficient credits mid-run pauses the job with a reason; tenant switch pauses the job and never writes into another org's snapshot; revoked/expired key pauses with guidance.
- **FR-10 Retry failures only:** resets failed rows to pending and re-queues; succeeded/skipped rows untouched.
- **FR-11 Results:** progress bar (succeeded/failed/skipped segments, `role=progressbar`), counts, throughput, ETA, credits spent vs estimate, avg latency, elapsed; row table filterable All/Succeeded/Failed/Skipped/Pending, paginated 25, row drawer with input, response (PII-masked in live), error, attempts.
- **FR-12 Export:** CSV (input columns + status/http/error/latency + flattened `result.*`) and JSON; `export_downloaded` event.
- **FR-13 Insight:** deterministic `summarizeBulkJob` — match rate, dominant failure class with cause and next action.
- **FR-14 Integration:** nav "Bulk Jobs" (all roles), Explorer "Run in bulk", ⌘K action, Logs deep link, Billing link, webhook next-step on completion, changelog entry.
- **FR-15 Audit:** `bulk_job.created` and `bulk_job.deleted` audit events with before/after metadata.

## 6. Data Model
```ts
BulkJob { id; name; endpointId; environment: 'sandbox'|'live'; keyId; status: BulkJobStatus;
  createdAt; startedAt?; completedAt?; source: { kind: 'csv'|'paste'|'sample'; fileName?; rowCount; columns[]; truncated? };
  mapping: Record<param, column>; concurrency; creditEstimate; creditsSpent; rows: BulkJobRow[]; createdBy; lastError? }
BulkJobRow { index; input: Record<string,string>; status: 'pending'|'processing'|'succeeded'|'failed'|'skipped';
  output?: unknown; error?; httpStatus?; durationMs?; attempts }
```
Prototype storage: Zustand `bulkJobs` in `TenantState`, persisted (`partialize`), caps `BULK_JOB_ROW_CAP=2000`, `BULK_JOB_CAP=50`. Production: `jobs` + `job_rows` tables (row outputs in object storage), per-org partitioning, retention aligned with the org's data-retention policy.

## 7. API Contracts
Prototype: no new routes — rows call existing catalog endpoints. Production target (deferred): `POST /v1/jobs` (endpoint, rows|file_url, mapping, concurrency) → `202 { job_id }`; `GET /v1/jobs/{id}` (status, counts, cost); `GET /v1/jobs/{id}/results?format=csv|json`; `POST /v1/jobs/{id}/retry`; webhook events `job.completed`, `job.failed`.

## 8. Non-Functional
- **RBAC:** admin/developer — create, run, pause, cancel, retry, delete, export; billing — view + export only (UI disabled with reason; store actions throw).
- **Multi-tenancy:** jobs live in the tenant snapshot; runner captures `activeOrganizationId` and refuses cross-tenant writes.
- **Compliance:** live results are gateway-masked; exports carry the masked data; audit events for create/delete.
- **Performance:** batched row updates (120 ms flush), concurrency cap 8, pagination; UI stays interactive during 2,000-row runs.
- **Reliability:** idempotency key per attempt; 429/network retries; honest state after reload.
- **Observability:** every row logged to `apiLogs`; telemetry `bulk_job_created/started/completed/cancelled/retried`, `export_downloaded`, `upgrade_prompt_*`, `feature_abandoned` (wizard step).

## 9. Dependencies & Integrations
`src/data/endpoints.ts` (catalog, credit cost), `lib/validation.ts`, `lib/api-config.ts` conventions (same-origin `/api` + Bearer), `types/auth.ts` scopes, `lib/insight-engine.ts`, `components/ui`, Logs/Analytics/Billing/Webhooks pages.

## 10. Milestones / Phasing
1. **Prototype (done):** everything in §5.
2. **Scale:** server-side job runner + `/v1/jobs` API, resumable uploads, > 2k rows, streaming exports.
3. **Expand:** scheduled jobs, warehouse/CRM destinations (Integrations Marketplace), per-project budgets (Budgets & Guardrails).

## 11. Success Metrics
- % of activated developers who run a bulk job in week 1 (target 25%).
- Median time from job created → completed for ≤ 500 rows (target < 3 min).
- Credits per org per month, before vs after first bulk job (expansion lift).
- Retry-only usage on jobs with failures (> 60%) — proof the DLQ is valued.
- Wizard abandonment by step (`feature_abandoned`), target < 30% at step 3.

## 12. Open Questions
- Should skipped rows be billable at a reduced "validation" rate in production? (Prototype: free.)
- Hard cap on concurrency per plan tier?
- Should live-environment exports require an admin approval step (ties to Approval Workflows)?

## 13. Out of Scope
Recurring schedules, destinations, POST-endpoint bulk, server-side execution, > 5 MB files.

---

## Changelog
- **2026-09-04** — Initial PRD reverse-engineered from the shipped prototype (Claude, for dev7@zintlr.com).
