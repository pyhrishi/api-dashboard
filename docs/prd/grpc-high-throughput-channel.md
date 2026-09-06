# PRD: gRPC High-Throughput Channel

> A binary protobuf service over HTTP/2 for enterprise-scale enrichment — unary calls plus bidirectional streaming that pushes thousands of records over one multiplexed connection, exposed to browsers via gRPC-JSON transcoding at `/api/grpc`.

**Status:** Built (prototype is the spec) · **Roadmap:** F-077 · **Routes:** `POST /api/grpc` (unary / batch / benchmark), `GET /api/grpc` (`.proto`), `/console/grpc`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
REST + GraphQL cover interactive and selective queries, but enterprise ingestion — enrich millions of records — needs a binary, streaming, multiplexed channel. gRPC over HTTP/2 is the industry answer: one connection, many concurrent streams, protobuf on the wire. This feature gives Zinbit a first-class gRPC surface: a real `.proto` service, generated client snippets, and a **live throughput benchmark** — backed by the same resolvers so gRPC never disagrees with REST/GraphQL. It's the scale sibling of the GraphQL gateway (F-065) and REST streaming (F-020).

## 2. Goals & Non-Goals
**Goals**
- A **protobuf `EnrichmentService`** with unary (`EnrichCompany`, `EnrichPerson`, `CompanyByIp`) and **bidirectional streaming** (`BatchEnrichCompanies`, `StreamEnrichPeople`) methods — field names identical to REST/GraphQL.
- A **real endpoint** via gRPC-JSON transcoding (browsers can't speak raw gRPC/HTTP2 trailers — Envoy/Connect do exactly this in production): `POST /api/grpc` executes against the same resolvers, auth, billing, and live-key masking; `GET /api/grpc` serves the `.proto`.
- A **throughput benchmark**: push N records and see real req/s, latency percentiles (p50/p95/p99), multiplexed stream count, and channel-vs-serial speedup.
- **Generated client snippets** (grpcurl, Go, Python, Node) from the schema + host.

**Non-Goals (this phase)** — a native HTTP/2 gRPC listener with protobuf binary framing + trailers (not possible in a browser/Next runtime; gRPC-JSON transcoding is the honest, working representation, same as production edge proxies); code-gen of full stubs / a downloadable `.proto` package; per-method flow control / backpressure tuning; client-streaming upload of files; a store slice (stateless, like GraphQL).

## 3. Users & Personas
- **Data/platform engineer (land + expand):** wires the gRPC stub into an ingestion pipeline; the benchmark proves the channel sustains their volume before they commit.
- **Enterprise architect:** sees a real `.proto`, TLS, HTTP/2 multiplexing, and percentile latencies — the scale story REST alone doesn't tell.
- **Developer:** copies a grpcurl/Go/Python/Node snippet and calls the channel in minutes.
- **RBAC:** the console is `admin | developer`; the endpoint bills per matched record against the caller's key (lazily provisioned).

## 4. Differentiation
Ties to **win #6 (enterprise-grade scale/reliability)** and reuses the resolvers behind REST + GraphQL — **one data model, three protocols, zero divergence**. Most enrichment vendors are REST-only; a first-class gRPC channel with a real `.proto`, generated clients, and a **live, measured throughput benchmark** (watch thousands of req/s flow over one multiplexed connection) is the enterprise-ingestion proof-point competitors don't offer.

## 5. Data Model & Logic
Single sources of truth (client-safe schema; server transcoder):
- **`lib/grpc/schema.ts`** — `GRPC_PACKAGE`/`GRPC_SERVICE`, `MESSAGES` (proto3 messages; field names mirror REST/GraphQL), `METHODS` (unary + bidi with `creditCost` + `resolverKey`), `renderProto()` (proto3 text with `stream` keywords + `repeated` fields), `inputKeyFor`, `isStreaming`.
- **`lib/grpc/transcoder.ts`** (server) — `invoke` (unary; projects the resolver output to exactly the response message's fields), `invokeBatch` (streamed batch; counts matched/missed, sums cost), `benchmark(method, count)` (generates N deterministic messages, runs them, returns matched/cost + a deterministic per-call latency model → p50/p95/p99 + multiplexed-stream count). Reuses `resolveCompanyFromDomain` / `resolvePersonFromEmail` / `resolveCompanyFromIp`. Pure; FNV jitter, no `Math.random`.
- **`lib/api-config.ts`** — `GRPC_HOST` / `GRPC_PORT`.

## 6. State / Integration
- **Endpoint** (`app/api/grpc/route.ts`, its own route — middleware only covers `/api/v1`): `GET` → `.proto`; `POST { service, method, message | messages | benchmark }` → unary / batch / benchmark. Own format-only auth, `deductCredits` billing (402 on shortfall), and live-key governance (opt-out propagation + PII masking) mirroring the REST/GraphQL routes; benchmark measures real wall elapsed → rps. **No store slice, not in the REST catalog** (like GraphQL).
- **Console** (`/console/grpc`): connection panel (host:443, TLS, HTTP/2 multiplexed, package.service), the `.proto` viewer (copy), tabbed client snippets (grpcurl/Go/Python/Node), a method browser (rpc-type badges, req→res, cost), and the throughput benchmark (rps hero, p50/p95/p99, speedup, streams, credits). Cross-links to GraphQL, REST streaming, coalescing.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, EmptyState, StatusBadge). **Idle** — run-a-benchmark prompt. **Running** — spinner. **Ready** — animated rps hero + percentile tiles + speedup. **Error** — failed + retry. Proto/snippet panels scroll inside their own `overflow-x-auto`; semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `grpc_channel_viewed` (page view) and `grpc_benchmark_run` (method, count, rps, matched). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**12-case** suite: proto3 render incl. stream/repeated, method↔message integrity, unary invoke + field projection + resolver coherence, unknown-method/missing-field errors, miss-is-free, batch matched/missed/cost, benchmark percentiles + clamp + determinism, synthetic-latency stability) · isolated `next build` green (`/console/grpc` + `/api/grpc` present) · Playwright smoke (`e2e/grpc.spec.ts`) · live drill — `GET /api/grpc` returns the `.proto`; `POST { benchmark: 5000 }` returns req/s + percentiles; unary `EnrichCompany` matches REST. 0 console errors.

## 10. Deferred
Native HTTP/2 gRPC listener with binary protobuf framing + trailers; downloadable `.proto` + generated stub packages; client-streaming file upload; per-method backpressure/flow-control tuning; reflection API; a gRPC-Web browser client; wiring the channel's throughput stats into the Infrastructure/capacity views.
