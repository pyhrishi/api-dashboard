# PRD: Streaming Inline Enrichment

> **A real streaming gateway endpoint** (`POST /v1/enrich/stream`) plus a live console page. Ships at `/console/stream` and as a catalog endpoint surfaced in docs / Explorer / OpenAPI / CLI.

**Status:** Built (prototype is the spec) · **Roadmap:** F-020 · **Route:** `/console/stream` (+ `POST /v1/enrich/stream`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriching a list synchronously makes you wait for the slowest row before you see any result; async jobs make you poll. For real-time pipelines — a form submit, a lead router, a live dashboard — neither is ideal. Streaming Inline Enrichment opens one low-latency connection and flushes each row's result the moment it resolves, so a consumer starts processing row 1 while row N is still enriching. It sits between the synchronous Batch endpoint (small lists, one response) and Async Jobs (huge batches, poll later).

## 2. Goals & Non-Goals
**Goals**
- `POST /v1/enrich/stream` returns **NDJSON**: a `start` frame, one `row` per input flushed as it resolves (`status` matched / missed / error, with the result and per-row latency), then an `end` summary.
- Per-row **error isolation** — an invalid row is a per-row error object; the stream keeps going.
- A console page that **runs the same endpoint live** — rows materialize one by one, with match counts, throughput, and a Stop (abort) button.
- Deterministic results (a streamed row equals its single-call equivalent); one credit per input.

**Non-Goals (this phase)** — Server-Sent Events / WebSocket transports (NDJSON over HTTP for now); gRPC high-throughput channel (F-077); resumable streams / cursors; ordering guarantees beyond input order; true upstream concurrency (rows resolve in order with a paced flush); backpressure tuning beyond the platform default.

## 3. Users & Personas
- **Integrating Developer (land):** streams a list and processes results as they arrive, no polling, no batch wait.
- **Platform Engineer (expand):** wires the stream into a real-time enrichment pipeline.
- **RBAC:** `admin | developer` (streaming consumes credits and a key); the page is `RoleGuard`-gated.

## 4. Differentiation
Ties to win #5 (operator-grade): a **real streaming transport** with a **live console** that shows rows arriving and per-row latency — not just a docs page. Most enrichment APIs force a batch wait or a poll loop; this is the low-latency inline path with visible progress.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/streamEnrich.ts`**.
- `resolveStreamRow(kind, input, index): StreamRow` — reuses `resolvePersonFromEmail` / `resolveCompanyFromDomain`; a non-email people row or empty input is a per-row `error`, a resolver miss is `missed`. Deterministic latency per input (35-89ms band). **No `Math.random`.**
- `normalizeStreamInputs(raw)` accepts a JSON array or a comma/newline-delimited string; `kindForEndpoint(endpoint)` picks people vs companies; `MAX_STREAM_INPUTS = 500`.
- Invariants (unit-tested, `src/lib/__tests__/streamEnrich.test.ts`): matched/missed/error classification; deterministic rows; input normalization from array/string/JSON; bounded latency.

## 6. API & Gateway
- **Route:** a `/v1/enrich/stream` block in `app/api/v1/[...route]/route.ts`, *before* the generic catalog dispatch. `POST` only (else 405). Validates + charges one credit per input (400 empty, 413 over 500, 402 out of credits), then returns a `ReadableStream` of NDJSON with `Content-Type: application/x-ndjson`, `Cache-Control: no-transform`, `X-Accel-Buffering: no`. Each row is enqueued and the loop yields (`STREAM_ROW_DELAY_MS`) so the flush is visibly progressive.
- **Catalog:** `enrich-stream` (POST /v1/enrich/stream) drives docs / Explorer / OpenAPI / CLI.

## 7. UI
- **`/console/stream`** (new page): a kind selector (people/companies), an inputs textarea, and Start / Stop. On Start it `fetch`es the endpoint and reads the body stream, parsing NDJSON line-by-line and appending each row as it arrives. Live KPI tiles (streamed N/total, matched, missed+errors, throughput/s + elapsed) and a row list (index, status badge, input, resolved label, latency). Stop aborts via `AbortController`.
- **States:** idle (empty with how-to), streaming (rows arriving + spinner), done, error (retry). Semantic tokens only; light + dark; Framer Motion row-enter.
- **Nav:** "Streaming" (Radio icon) after Async Jobs, roles `admin | developer`. Cross-links to Async Jobs, Explorer, Logs.

## 8. Telemetry
`stream_started` (kind + size) and `stream_completed` (kind, matched, missed, errors, durationMs) via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (7 stream cases; 255 total) · isolated `NEXT_DIST_DIR=.next-verify next build` green · NDJSON verified via `curl -N` (start/rows/end, invalid row → per-row error) and a live console walkthrough (8 inputs streaming one by one, 7 matched / 1 error, throughput + per-row latency).

## 10. Deferred
SSE / WebSocket transports; gRPC channel (F-077); resumable streams; true upstream concurrency; backpressure tuning; ordering guarantees beyond input order.
