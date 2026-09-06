# PRD: Bulk Export Endpoint

> Stream a filtered slice of enriched data out in one call — pick an entity, narrow it with the Query grammar, select columns, and export as NDJSON (streams row-by-row), CSV, or JSON, with a free preview of row count and credit cost first.

**Status:** Built (prototype is the spec) · **Roadmap:** F-076 · **Routes:** `GET /v1/export` (stream + `preview=1`), `/console/export`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment is per-record, but analysts and data teams need the whole slice: "give me every fintech company over 1,000 employees as NDJSON for the warehouse", "export these columns to CSV for the sales team". Paging a per-record API to assemble that is slow and awkward. The bulk export endpoint streams a filtered, sorted, column-projected dataset in a single call — NDJSON row-by-row so it stays memory-flat at any size, CSV for spreadsheets, JSON for a quick load — reusing the same filter/sort grammar (F-078) and field selection (F-062) already in the gateway. It's the read-side complement to Bulk Jobs (which enrich *uploaded* records).

## 2. Goals & Non-Goals
**Goals**
- **Filtered export:** the F-078 grammar (`field:op:value` filters, `field` / `-field` sorts) narrows the dataset server-side.
- **Column projection:** select just the columns you want (F-062), in order.
- **Three formats:** NDJSON (**streamed** row-by-row via `ReadableStream`), CSV (header + escaped cells), JSON (array).
- **Preview before you pull:** `&preview=1` returns a free JSON summary — total, matched, exported, cost, fields, warnings, and a 5-row sample — so cost is known before billing.
- **Honest billing + delivery:** billed per 50-row block; real export returns `Content-Disposition: attachment` and `X-Export-Rows` / `X-Credits-Cost` headers.

**Non-Goals (this phase)** — exporting arbitrary tenant records from the client store (the dataset is built deterministically from the shared resolvers — a curated companies/people roster); async/scheduled exports to S3/GCS (that's the data-portability + scheduled-export track); pagination cursors (single streamed response, capped at 500 rows for the demo); exporting nested objects (flat scalar columns only); write-back.

## 3. Users & Personas
- **Data engineer (land):** `GET /v1/export?entity=companies&filter=industry:eq:Fintech&format=ndjson` pipes straight into a warehouse loader — one call, memory-flat.
- **RevOps / analyst (expand):** builds a filtered column set in the console, previews the count + cost, downloads CSV.
- **Developer:** copies the ready curl from the console.
- **RBAC:** the console is `admin | developer`; the endpoint bills per row-block against the caller's key.

## 4. Differentiation
Ties to **win #2 (developer-first ergonomics)** and reuses the F-078 query engine + F-062 field selection, so filter/sort/columns behave *identically* to the Query endpoint — one grammar across the product. The **free preview with exact cost** before a billed pull, and true **row-by-row NDJSON streaming**, are the operational niceties that make bulk export safe to run — details generic "export CSV" buttons skip.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/bulkExport.ts`** (pure; no `Math.random`, no wall-clock).
- `buildExportDataset(entity)` — flattens a curated roster (48 domains / 40 emails) through `resolveCompanyFromDomain` / `resolvePersonFromEmail` into flat scalar rows; deterministic, capped at `MAX_EXPORT_ROWS` (500).
- `planExport({ entity, filter, sort, fields, format, limit })` → `ExportPlan { rows, fields, total, matched, cost, contentType, filename, warnings }` — applies `parseQuery`+`applyQuery` (F-078), projects to validated `fields` (F-062 `parseFields`), caps at `limit`, and computes cost. Emits warnings for unknown fields, bad limits, and result capping.
- `exportCost(n)` = `max(1, ceil(n/50))`. `serializeCsv` (RFC-ish escaping), `serializeNdjson`, `serializeExport` (format dispatch). `EXPORT_FIELDS` drives the console + validation.

## 6. State / Integration
- **Gateway:** special path in `app/api/v1/[...route]/route.ts` — `GET /v1/export` plans, then either returns a free preview (`preview=1`, `X-Credits-Cost: 0`) or bills (`deductCredits`, 402 on shortfall) and returns the data: NDJSON via `ReadableStream`, CSV/JSON serialized, all with `Content-Disposition`. Catalog entry `bulk-export` flows into docs / Explorer / OpenAPI / Postman / CLI.
- **No store slice** (server dataset, not client state).
- **Console** (`/console/export`): entity segmented control, filter/sort/limit inputs, column chips, format picker, **Preview** (KPIs: matched / rows / cost + warnings + sample table) and **Download** (real blob download), plus a copy-ready curl. Reuses `EXPORT_FIELDS`/types from the SSOT.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, Input, SegmentedControl, EmptyState, Skeleton, StatusBadge). **Idle** — build prompt. **Loading** — skeletons. **Ready** — KPIs + sample table + curl; Download disabled until there are matched rows. **Empty** — 0 matched (Download disabled). **Error** — preview failed + retry. Semantic tokens; Framer Motion; light + dark; the sample table scrolls inside its own `overflow-x-auto`.

## 8. Telemetry
Via `lib/telemetry.ts`: `bulk_export_previewed` (entity, format, matched, cost) and `bulk_export_downloaded` (entity, format, rows, cost). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**13-case** suite: deterministic dataset + shapes, filter/sort/fields/limit planning, unknown-field warnings + fallback, cost tiers, CSV escaping, NDJSON lines, format dispatch) · isolated `next build` green (`/console/export` present) · Playwright smoke (`e2e/export.spec.ts`) · live gateway drill — preview + NDJSON/CSV/JSON pulls with filter/sort/fields. 0 console errors.

## 10. Deferred
Async/scheduled exports to object storage; pagination cursors + unbounded row counts; nested/related-object export (company→people); gzip on the export stream (the gateway's compression already applies); exporting live tenant records; a saved-export-definitions library; webhook-on-complete for large exports.
