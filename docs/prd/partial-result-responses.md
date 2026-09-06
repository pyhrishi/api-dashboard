# PRD: Partial-Result Responses

> When a secondary upstream is degraded, return what resolved (HTTP 206) with a `partial` block naming what was withheld and why — and bill only for what came back — instead of failing the whole request.

**Status:** Built (prototype is the spec) · **Roadmap:** F-071 · **Routes:** the gateway pipeline (any endpoint with secondary upstreams), surfaced in `/console/studio`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
An enrichment draws on several upstreams (F-066): a person's core identity from the professional graph, their direct phone from a carrier HLR, their socials from the social graph. If one *secondary* source is down, failing the entire call throws away the fields that *did* resolve — the caller gets nothing when they could have had almost everything. Partial-result responses return what resolved, mark what didn't (and why), and bill proportionally. It's the graceful-degradation half of the circuit-breaker story.

## 2. Goals & Non-Goals
**Goals**
- **Return what resolved:** drop only the fields supplied by a degraded secondary upstream; keep the rest. Respond **206 Partial Content**.
- **Explain the gap:** a `partial` metadata block lists each missing field group, its upstream, and the reason; `X-Partial-Result` / `X-Partial-Missing` / `X-Partial-Completeness` headers make it machine-readable.
- **Bill fairly:** charge in proportion to the upstreams that answered (a degraded source never costs full price).
- **Surface it:** the Studio shows a "Partial result — N% complete" banner naming each unavailable field + degraded provider, linking to the Circuit Breakers console.

**Non-Goals (this phase)** — retrying/failing over a degraded upstream (that's the breaker's job); partial results from a degraded *primary* upstream (still 503 — there's no useful record without it); per-field timeouts independent of the circuit breaker; partial results for structured single-source endpoints (normalize, canonicalize) which have no secondary sources; surfacing partials outside the Studio (Logs/Analytics enrichment deferred).

## 3. Users & Personas
- **Integrating developer (land):** a 206 with `partial.missing` lets them use the fields that came back and handle the gap explicitly, instead of catching a hard failure and getting nothing.
- **Data/RevOps (expand):** sees, per lookup, that (say) phone was withheld because the carrier HLR was degraded — and that they weren't charged full price.
- **SRE (expand):** confirms graceful degradation is working end-to-end with the per-upstream breakers.
- **RBAC:** inherits the Studio's `admin | developer` gate; the behavior is available to any valid key.

## 4. Differentiation
Ties to **win #5 (operator-grade)** and completes **F-066**: the same upstream registry that isolates a failing provider now also decides which fields can still be served — reliability, provenance (F-043), and billing tell one coherent story. Fair partial billing (pay for what resolved) is a genuine trust differentiator; most APIs fail the whole call and still make you retry.

## 5. Data Model & Logic
- **`src/lib/gateway/upstreams.ts`** — a `CONTRIBUTIONS` map: per endpoint, the *secondary* upstreams and the dotted field paths each supplies (e.g. people-search → carrier-hlr: `person.phone`/`person.phone_verified`; social-graph: the social URLs; smtp-verification: `person.email_verified`). `secondaryContributions(endpointId)`.
- **`src/lib/gateway/partialResult.ts`** (SSOT, pure/deterministic, no mutation of input): `planPartial(endpointId, isOpen)` → `{ partial, degraded, completeness }` (a cheap pre-billing read of circuit state, completeness counts the primary + secondaries); `computePartial(endpointId, data, isOpen)` → deep-clones the payload, deletes the degraded upstreams' field paths, and returns `{ data, meta }` where `meta` = `{ partial, missing[], degraded_upstreams, completeness }`.

## 6. State / Integration
- **Gateway pipeline** (`app/api/v1/[...route]/route.ts`): in the billing block, `planPartial` scales the charge by completeness (composes with the F-062 sparse discount, floored at 1 credit). After the response payload is extracted (before masking, so withheld fields never leak), `computePartial` strips the degraded fields, attaches `metadata.partial`, sets the status to **206**, and adds the `X-Partial-*` headers. A degraded *primary* upstream still returns the F-066 503.
- **View-model** (`src/data/enrichments.ts`): `EnrichmentResult.partial?: PartialView`. The Studio reads `metadata.partial` from the response and attaches it (a passive display; the withheld fields are simply absent from the record).
- **No new endpoint, no store slice** — partial is a property of an existing response.

## 7. UI
The Studio `ResultCard` renders a `PartialBanner` (icon `Unplug`, warning tone) when `result.partial.partial`: a "Partial result — N% complete" header, a list of each unavailable field group with its degraded provider ("Direct phone — unavailable (Carrier HLR degraded)"), a note that billing was scaled to what resolved, and a link to `/console/circuits`. The rest of the record renders normally with the resolved fields. Semantic tokens; light + dark. (Loading/empty/error remain the Studio's.)

## 8. Telemetry
`partial_result_received` (preset, endpoint, completeness, degraded upstreams) via `lib/telemetry.ts`, emitted from the Studio alongside `enrichment_run` when a partial arrives.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (8-case partialResult suite: plan completeness, strip-per-upstream, multi-degraded, purity/no-mutation, no-op paths, determinism) · isolated build green · **live drill**: force-open `carrier-hlr` → `GET /v1/people` returns **206** with `X-Partial-Result: true`, `X-Partial-Completeness: 0.75`, `X-Partial-Missing: Direct phone`, phone withheld but name/company/socials present, `partial` metadata block populated; reset → 200 with phone back. Studio renders the partial banner (Carrier HLR named, "Direct phone unavailable"), 0 console errors.

## 10. Deferred
Partial results from timeouts independent of the circuit breaker; automatic failover; surfacing partials in Logs/Analytics; a partial-rate metric on the Circuit Breakers or Quality SLA console; configurable per-endpoint required-vs-optional upstream policy.
