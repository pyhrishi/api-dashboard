# PRD: Field Selection / Sparse Responses

> A universal `fields` query parameter that projects any enrichment response down to just the attributes you asked for — smaller payload, less PII, lower cost.

**Status:** Built (prototype is the spec) · **Roadmap:** F-062 (Next → shipped) · **Page:** `/console/field-selection` · **Source:** `src/lib/gateway/fieldSelection.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment endpoints return wide records — a phone lookup alone carries ~15 fields (line type, carrier, DNC, reachability, provenance…). Most integrations map only a handful. Sending the whole record every time wastes bandwidth and parse time, charges full price for data the caller discards, and — on live keys — pulls more PII than the caller needs, which is a data-minimization liability. There is no way to say "just give me the phone and carrier."

## 2. Goals & Non-Goals
**Goals**
- A universal `?fields=` parameter on every GET enrichment endpoint that projects the response to exactly the named fields (top-level and one level of `a.b` nesting).
- Make a sparse request **cost less** — pay for what you pull — surfaced in headers and billing metadata.
- Project **after masking**, so field selection also minimizes PII (a compliance win).
- A console playground that makes the payload- and cost-savings tangible against the real gateway.

**Non-Goals (this phase)** — per-field access control / entitlements (who may request which field); GraphQL-style deep nested selection beyond one level; field selection on POST bodies; server-side field *expansion* (the inverse). See Deferred.

## 3. Users & Personas
- **Developer (land):** trims a response to the 3 fields their pipeline maps; the 10-minute win is a visibly smaller, cheaper call.
- **Cost owner / platform (expand):** sparse requests lower the bill on high-volume jobs — pay for what you pull (Win #4, usage transparency).
- **Security/compliance (expand):** field selection is data-minimization by default — pull only the PII you need (Win #2, compliance-native).
- **RBAC:** the playground is `admin | developer` (a developer tool); the `fields` param itself is available to any valid key.

## 4. Differentiation
Incumbents (Clearbit, PDL, Apollo) return full records and bill per record regardless of what you use. Our differentiated angle ties to two of the six wins: **radical usage transparency** — a sparse request is *discounted*, and the response reports bytes-before/after and the discount applied — and **compliance-native** — because projection runs *after* masking, asking for fewer fields provably returns less PII. "Sparse and cheaper and more compliant" is a combination no incumbent offers.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/fieldSelection.ts`** (pure, deterministic, no I/O).
- `parseFields(raw)` — comma-split, trim, drop malformed/empty, de-dupe, cap at `MAX_SELECTED_FIELDS` (50).
- `projectFields(data, fields)` → `{ data, available, selected, omitted, applied }`. Projects a single object or an array of objects; supports one level of dotted nesting (`company.domain`); requested fields not present are simply absent; non-projectable input (primitive/null) passes through with `applied: false`.
- `sparseDiscountPct(count)` / `applySparseDiscount(baseCost, count)` — fewer fields → bigger discount, linear against `SPARSE_NOMINAL_FIELDS` (8), capped at `SPARSE_MAX_DISCOUNT_PCT` (50); a request at/above nominal width is never discounted; charged cost floors at 1 credit.
- `payloadBytes(data)` — UTF-8 byte length of the JSON (TextEncoder-free, so it runs identically in the gateway and in jest).
- Invariants (unit-tested, `src/lib/gateway/__tests__/fieldSelection.test.ts`, 12 tests): parsing (trim/dedupe/cap), object + array + nested + missing-field projection, no-op on empty list, discount curve + floor, and byte reduction.

## 6. API & Gateway
`?fields=` is a **universal gateway parameter**, not per-endpoint — the strict parameter validator (`src/lib/sandboxAPI.ts`) allows it on every endpoint via `GLOBAL_PARAMS`. In `app/api/v1/[...route]/route.ts`:
- **Billing stage:** the requested field count discounts the (already volume-discounted) cost via `applySparseDiscount`; header `X-Sparse-Discount-Pct`.
- **Response stage (after masking):** the masked payload is projected via `projectFields`; headers `X-Fields-Selected`, `X-Fields-Omitted`, `X-Sparse-Response: true`; a `sparse{ requested, returned, omitted, bytes_before, bytes_after, discount_pct }` metadata block and a `billing.sparse_discount_pct`.
- Ordering: mask → minimize, so the projection operates on the compliant payload; deterministic, so re-projecting an idempotent (F-061) replay is harmless.
- Example: `GET /v1/people/phone?email=ceo@example.com&fields=phone,carrier,dnc` → `{phone, carrier, dnc}`, `X-Sparse-Response: true`, `X-Fields-Omitted: 12`, `688 → 69` bytes, `2 → 1` credits.

## 7. UI
- **`/console/field-selection`** (`app/console/field-selection/page.tsx`, client component, `RoleGuard admin|developer`):
  - A curated endpoint picker (Phone by Email, Firmographics, Social Profiles, Company Enrich).
  - **Analyze fields** → a real full call discovers every field; the picker lists them (a lean subset pre-selected). **Run sparse request** → a real `?fields=` call.
  - A KPI row (fields selected, payload reduction %, sparse discount %, PII fields dropped) fed by the gateway's own `sparse{}` metadata; a field checklist (All/None); a JSON response preview badged with the % reduction; a copyable request URL; a methodology card.
  - **States:** idle (explainer), discovering (skeletons), ready/running (results), error (gateway message). Semantic tokens, Framer Motion.
- **Nav:** a role-filtered "Field Selection" entry (ListFilter icon) beside the other efficiency tools (Idempotency, Streaming). Every call flows into Logs / Analytics / Billing via `logApiRequest`.

## 8. Telemetry
`field_selection_analyzed` (endpoint, fields_available) on discovery; `field_selection_run` (endpoint, fields_selected, fields_available, bytes_saved_pct, discount_pct) on a sparse run. Registered in `lib/telemetry.ts` (efficiency group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (12 new tests) · live gateway smoke (688→69 bytes, 50% discount, headers + `sparse` metadata) · browser walkthrough (analyze → toggle → run → 88% payload reduction, 2→1 credits, no console errors).

## 10. Deferred
Per-field entitlements / ACLs; deep (multi-level) nested selection; field selection on POST request bodies; `expand`/`include` (the inverse); documenting `fields` in per-endpoint OpenAPI (currently a universal, cross-cutting param).
