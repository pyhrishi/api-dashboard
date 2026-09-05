# PRD: Firmographic Append

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Firmographic append" preset — no separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-010 (Now) · **Route:** `/console/studio` (preset `firmographics`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
RevOps and data teams don't segment on prose — they segment on codes. NAICS/SIC, employee band, revenue band, and ownership are the fields that drive lead routing, territory assignment, ICP scoring, and TAM. Domain → Company (F-002) returns a rich descriptive dossier; it does not return the standardized classification codes those workflows key on. Firmographic Append is the codes layer: one domain in, CRM-ready firmographic classification out.

## 2. Goals & Non-Goals
**Goals**
- One domain in → standardized firmographics: **NAICS + SIC** (with titles), employee and revenue bands, **ownership** and **entity type**, founded year, HQ country.
- **Transparent classification** — each field carries the signal that produced it (provenance) and a confidence.
- Deterministic and coherent with the company graph (same domain → same codes) across Studio, Explorer, CLI.
- Reuses `GET /v1/companies/firmographics` (1 credit — a classification append, lighter than F-002's 2-credit dossier), the generic `enrichments` slice, and the Studio renderer — no new page, nav, or store slice.

**Non-Goals (this phase)** — bulk firmographic append (that is Bulk Enrichment Jobs); real registry integration (synthetic, deterministic mock); global multi-code systems beyond NAICS/SIC (e.g. UK SIC, ANZSIC); revenue point-estimates (bands only); CRM write-back.

## 3. Users & Personas
- **Integrating Developer (land):** appends firmographic codes in one call to power routing/scoring; copies JSON/cURL.
- **RevOps / Data Leader (expand):** the economic buyer — relies on consistent NAICS/SIC + bands to segment and size TAM.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Largely **table-stakes**, shipped clean with one point of polish tied to win #5 (operator-grade): **transparent classification** — the mapping and signal behind every code, plus a confidence, rather than opaque codes. Distinct from F-002: F-002 is the descriptive dossier (tech stack, funding, description); F-010 is the standardized-codes segmentation layer built on the same company graph.

## 5. Data Model & Logic
Single source of truth: **`lib/firmographic-resolver.ts`** → `appendFirmographics(domain): FirmographicAppend | null`.
- Builds on `resolveCompanyFromDomain` for the base firmographics (industry, employee band, revenue band, founded, HQ), then maps industry → NAICS/SIC via a fixed lexicon and derives ownership/entity type from a deterministic FNV-1a hash of the domain — **no `Math.random`**.
- `FirmographicAppend`: `domain`, `company`, `naics_code`/`naics_title`, `sic_code`/`sic_title`, `industry`, `sub_industry`, `employee_count`, `employee_band`, `revenue_band`, `ownership`, `entity_type`, `founded_year`, `hq_country`, `confidence`, `last_verified`, `provenance[]`.
- Invariants (unit-tested in `src/lib/__tests__/firmographicResolver.test.ts`): deterministic per domain; domain normalized (protocol/case/path) via the company resolver; NAICS is 4–6 digits and SIC 3–4; ownership and entity type from fixed enums; provenance covers naics/employee_band/ownership.

## 6. API & Gateway
- **Endpoint:** `GET /v1/companies/firmographics` (catalog id `firmographic-append`, `src/data/endpoints.ts`), param `domain`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `firmographic-append` case returns `{ success, ...FirmographicAppend }`; an unresolvable domain returns `INVALID_DOMAIN`.
- No PII, so no masking; reuses the existing `domain` `InputKind`.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `firmographicToResult` branch, selected when the response carries `naics_code` + `sic_code`.
- **Result card** (Studio `ResultCard`, `kind: 'company'`): title = company; badges = ownership + industry; fields = NAICS, SIC, Industry, Employees, Revenue band, Ownership, Founded, HQ; right rail = confidence % + provenance.
- **Preset:** "Firmographic append" (`BarChart3` icon, company category). **States:** loading, empty (preset prompt), invalid (`INVALID_DOMAIN`), success (the card).

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events recorded in the shared `enrichments` slice. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (4 new tests + existing suites) · Playwright smoke: Studio "Firmographic append" turns `stripe.com` into NAICS/SIC codes, bands, ownership, and provenance.

## 10. Deferred
Bulk firmographic append; real registry sources; additional classification systems (UK SIC, ANZSIC); revenue point-estimates; CRM write-back.
