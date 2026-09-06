# PRD: Company Alias Resolution

> Map any name a company goes by — DBA, legal name, brand, former name, ticker, abbreviation, or domain — to one canonical, enrichable entity, with the alias type and confidence.

**Status:** Built (prototype is the spec) · **Roadmap:** F-031 · **Routes:** `GET /v1/companies/resolve`, `/console/studio` (the "Resolve a company" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The same company shows up in CRMs and lists under a dozen names — "Alphabet Inc." vs "Google" vs "GOOGL", "Jaded Pixel" vs "Shopify". Enrichment keyed on a domain works only once you *have* the domain; given a messy name you're stuck. Company alias resolution maps any of those strings to one canonical company (and its domain), so a name becomes enrichable and duplicate accounts collapse to a single entity. It's the company-level sibling of name canonicalization (F-030) and a feeder for dedup (F-026) and reconciliation (F-027).

## 2. Goals & Non-Goals
**Goals**
- Resolve an input string to a **canonical company** (name + domain + legal name) via a curated alias registry.
- Recognize the **alias type**: brand / legal / DBA / former / ticker / abbreviation / domain.
- **Exact then fuzzy:** exact (normalized) match first; otherwise Jaro-Winkler above a threshold; else unresolved with candidates.
- **Coherent + enrichable:** the resolved company is the same entity `resolveCompanyFromDomain` returns, so you can enrich it immediately.
- Catch **rebrands** — real former names (Shopify←Jaded Pixel, Zomato←Foodiebay, Vercel←ZEIT).

**Non-Goals (this phase)** — resolving *any* arbitrary company on earth (a curated registry of well-known entities, plus a domain fast-path — not a global company graph); ticker→exchange disambiguation; subsidiary/parent mapping (that's F-008 hierarchy); learning new aliases from usage; person-name resolution (that's F-030); write-back of the canonical name to a CRM.

## 3. Users & Personas
- **RevOps / data (expand):** de-dupes a list where the same account appears under brand, legal, and former names.
- **Integrating developer (land):** `GET /v1/companies/resolve?name=Jaded Pixel` returns `shopify.com`, ready to enrich.
- **Sales:** pastes whatever name they have and gets the real company.
- **RBAC:** inherits the Studio's `admin | developer` gate; billed like a company lookup (1 credit).

## 4. Differentiation
Ties to **win #4 (coherent, explainable data)** and reuses **F-024 Jaro-Winkler** + the company resolver: the match is explainable (which alias, which type, what similarity) and the result is a real, enrichable entity — not just a string. Catching former names is the kind of resolution generic string-matching misses.

## 5. Data Model & Logic
Single source of truth: **`lib/company-alias-resolver.ts`** (pure, deterministic, no `Math.random`).
- A `REGISTRY` of curated aliases keyed by canonical domain; the canonical name/legal come from `resolveCompanyFromDomain` at match time (so this never drifts from enrichment).
- `resolveCompanyAlias(query)` → `{ input, normalizedInput, matchType, resolved, matchedAlias, aliasType, confidence, candidates[] }`. Order: domain fast-path → exact normalized match (confidence 0.99) → Jaro-Winkler best ≥ 0.86 (confidence = similarity) → else `none` with the closest candidates. Normalization lowercases and strips punctuation.

## 6. State / Integration
- **Gateway:** a normal-pipeline `GET /v1/companies/resolve` (catalog entry in `src/data/endpoints.ts`, param `name`) with a deterministic sandbox case returning `resolveCompanyAlias(name)`. Feeds docs / Explorer / OpenAPI / Postman / CLI.
- **View-model** (`src/data/enrichments.ts`): a `company-resolve` preset (input kind `title`/freeform), a `companyAlias?` field on `EnrichmentResult`, `companyAliasToResult`, and a shape dispatch (`matchType` + `resolved`/`candidates`).
- **No route.ts, no store slice.**

## 7. UI
The Studio "Resolve a company" preset (icon `Building2`/`SearchCheck`) renders a resolution panel: the canonical company (name, domain, legal name) with a "resolve it" cross-link to a full company enrich, the matched alias + a type badge (brand/legal/former/ticker/…), a confidence rail, and — when fuzzy or unresolved — the runner-up candidates with their similarity. The not-found state explains no match cleared the threshold and lists the closest candidates. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
`company_alias_resolved` (matchType, aliasType, confidence) via `lib/telemetry.ts`, emitted from the Studio alongside `enrichment_run`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (9-case suite: former-name/ticker/legal/DBA/abbreviation/brand/domain resolution, fuzzy typo, case+punctuation normalization, none+candidates, empty, coherence-with-enrichment, determinism) · isolated build green · live gateway + Studio walkthrough — `Jaded Pixel` → Shopify (former), `Shopfiy` → Shopify (fuzzy), an unknown → not-found with candidates. 0 console errors.

## 10. Deferred
A global company registry beyond the curated set; ticker/exchange disambiguation; parent/subsidiary mapping (F-008); learning aliases from usage; write-back; folding the resolver into fuzzy match / dedup as their company-name front-end.
