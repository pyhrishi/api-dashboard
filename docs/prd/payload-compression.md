# PRD: Payload Compression (Gzip / Brotli)

> Negotiate `br`/`gzip` on the response, return a payload up to ~90% smaller, and report exactly how many bytes were saved — with a console tracking cumulative bandwidth savings.

**Status:** Built (prototype is the spec) · **Roadmap:** F-080 · **Routes:** every gateway response (via `Accept-Encoding`), `GET /v1/compression`, `/console/compression`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment responses are JSON — highly compressible, and often sent in volume. The gateway already gzipped responses via a streaming `CompressionStream`, but it couldn't offer Brotli (better on JSON), didn't negotiate, and reported nothing about what it saved. F-080 turns compression into a first-class, measured capability: negotiate the best encoding the client offered (Brotli > Gzip), report the byte savings on every response, and surface cumulative bandwidth saved in a console.

## 2. Goals & Non-Goals
**Goals**
- **Negotiate + compress:** `Accept-Encoding: br, gzip` → compress with the best offered (Brotli preferred); `Content-Encoding` + `Vary: Accept-Encoding` set correctly.
- **Report savings:** `X-Uncompressed-Bytes` / `X-Compressed-Bytes` / `X-Compression-Ratio` on every response.
- **Be sensible:** payloads below a threshold pass through uncompressed (framing overhead isn't worth it); clients that offer neither get identity.
- **Measure:** a cumulative savings registry + `GET /v1/compression` + a console with a live sample.

**Non-Goals (this phase)** — request-body decompression (`Content-Encoding` on inbound requests); per-endpoint compression toggles; `zstd`/`deflate`; a configurable size threshold or quality per key; streaming compression of very large bodies (responses are compressed whole, synchronously, for exact byte accounting); persisting the savings registry across restarts.

## 3. Users & Personas
- **Integrating developer (land):** gets ~90%-smaller responses for free — most HTTP clients send `Accept-Encoding` and decompress transparently — and can read the exact savings from response headers.
- **Platform / FinOps (expand):** sees cumulative bandwidth saved and the ratio by encoding, quantifying an egress-cost reduction.
- **RBAC:** the console inherits the `admin | developer` gate; compression applies to any valid key's requests.

## 4. Differentiation
Table-stakes for a high-volume API — shipped operator-grade: Brotli (not just gzip), negotiated, with per-response byte accounting and a savings dashboard. Ties to **win #5 (operator-grade)** and composes with **field selection (F-062)** — trim fields, then compress the rest — for the smallest possible payload.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/compression.ts`** (Node `zlib`, synchronous so the compressed size is known; deterministic given input; the registry is the only state).
- `negotiateEncoding(acceptEncoding)` → `br` | `gzip` | `identity` (Brotli preferred; token-boundary aware so `gzip` isn't mistaken for `br`).
- `compressPayload(json, encoding, minBytes=256)` → `{ body, encoding, originalBytes, compressedBytes, ratio, savedBytes, savedPct }`; below `MIN_COMPRESS_BYTES` returns identity.
- `recordCompression(result)` + `getCompressionStats()` — a per-encoding tally (responses, original/compressed bytes) rolled up into total saved, overall ratio, saved %, and a by-encoding breakdown. Seeded with realistic history so the console isn't empty on first load.

## 6. State / Integration
- **Gateway** (`app/api/v1/[...route]/route.ts`): the `sendResponse` helper now negotiates + compresses via the SSOT (replacing the streaming gzip), records the outcome, and sets `Content-Encoding`, `Vary`, and the `X-*-Bytes` / `X-Compression-Ratio` headers. A `GET /v1/compression` special-path returns the stats.
- **Catalog:** a `compression-stats` entry in `src/data/endpoints.ts` feeds docs / Explorer / OpenAPI / Postman / CLI.
- **No store slice** — savings are gateway-side; the console reads them live.

## 7. UI
`/console/compression` (icon `Archive`): KPI row (bandwidth saved, payload reduction %, average ratio, compressed-of-total), a **live sample** that fetches a 100-row list with `Accept-Encoding: br` and reads the byte savings straight off the response headers (honest — no faking), a per-encoding breakdown (Brotli / Gzip / uncompressed with responses, saved bytes, and a ratio bar), and an "enable compression" card with a copy-paste cURL and a cross-link to field selection. Beautiful loading (skeletons) and error (retry) states. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
`compression_viewed` (console open) via `lib/telemetry.ts`. Per-response savings accrue in the gateway registry and surface via the stats endpoint.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (9-case suite: negotiation precedence + token boundaries, br/gzip compress-and-round-trip, sub-threshold passthrough, identity, determinism, registry roll-up) · isolated build green (route `/console/compression`) · **live checks**: `GET /v1/companies/employees?limit=100` with `Accept-Encoding: br` → `Content-Encoding: br`, `X-Uncompressed-Bytes: 13083` → `X-Compressed-Bytes: 940` (ratio 0.072, ~93% smaller); with `gzip` → gzip ratio 0.083; `identity` → uncompressed, no `Content-Encoding`. Console renders KPIs + live sample, 0 console errors.

## 10. Deferred
Request-body (inbound) decompression; per-endpoint / per-key compression config; `zstd` and `deflate`; a configurable threshold and Brotli quality; streaming compression for very large bodies; persisting the savings registry.
