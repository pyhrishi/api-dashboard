# PRD: Cross-reference ID mapping

> Map any identifier from any system to one canonical entity, and get back that entity's ID in every other system — CRM, data providers, social, registries, financial — each with a resolvable public URL, all unified under one persistent Zinbit ID.

**Status:** Built (prototype is the spec) · **Roadmap:** F-039 · **Routes:** `GET /v1/identity/xref`, `/console/xref` (the "ID Map" page), `/console/studio` (the "Cross-reference ID map" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The same company or person carries a different ID in every system a team runs — a Salesforce Account, a HubSpot Company, a Crunchbase permalink, a LinkedIn URL, a DUNS number, an Apollo/PDL id, a domain, a ticker. Joining a warehouse to a CRM to a data provider means writing brittle per-vendor matching every time. Cross-reference ID mapping turns any one of those identifiers into the whole ID graph: the canonical entity plus its identifier everywhere else, each with a public URL where one exists, all keyed to the persistent Zinbit ID (F-028). It's the ID-level companion to reverse enrichment and the join key that makes de-duping across sources a lookup instead of a project.

## 2. Goals & Non-Goals
**Goals**
- Resolve **any supported identifier** — email, domain, company name/ticker, LinkedIn/Crunchbase URL, Salesforce/HubSpot record ID, DUNS, Apollo/PDL id, a Zinbit ID — to one canonical entity.
- Return that entity's ID in **every system**, grouped by category (`internal` / `crm` / `data-provider` / `social` / `registry` / `financial`), each with a **resolvable public URL** where one exists and a confidence.
- **Navigable both directions:** forward inputs (email→person, domain/name/ticker→company) resolve directly; opaque IDs reverse-resolve to the same entity via an anchor scan, with the matched reference flagged.
- **Coherent + real-where-real:** real fields (LinkedIn/X/GitHub URLs, tickers) come from the shared resolvers; every synthetic ID is a **frozen, deterministic** function of the entity, so the map always agrees with a direct lookup.
- **Honest coverage:** systems with no ID for the entity (a private company has no ticker; a contact has no GitHub) are listed as `unresolved` with a reason, never invented.

**Non-Goals (this phase)** — a live directory of every real CRM/provider ID on earth (synthetic-but-stable IDs over a curated anchor corpus, not a global identity broker); reverse-resolving an arbitrary opaque ID outside the anchor set (returns null with guidance); write-back of the Zinbit ID into a customer CRM; OAuth into a customer's Salesforce/HubSpot to read their real instance IDs; ID history/versioning (that's the identity graph, F-035).

## 3. Users & Personas
- **Data engineer (land):** `GET /v1/identity/xref?query=001…` (a Salesforce id) → the domain, the Zinbit ID, and every other system's ID in one call — stop writing join scripts.
- **RevOps / data (expand):** keys the warehouse on the Zinbit ID and uses the map to reconcile CRM ⇄ provider ⇄ social records — a system-of-reference.
- **Sales/SDR:** pastes a LinkedIn or Crunchbase URL and gets the company's domain + everything else, with clickable public links.
- **RBAC:** the `/console/xref` page and Studio preset inherit the `admin | developer` gate; billed like a lookup (1 credit).

## 4. Differentiation
Ties to **win #1 (one API identity / one coherent product)** and builds on **F-028 Persistent Zinbit ID**, the **company/person resolvers**, and **F-031 alias resolution**. Competitors return *attributes*; few treat the **ID graph itself** — a navigable set of cross-system identifiers with public URLs — as a first-class deliverable. Bidirectional resolution (paste a bare CRM/DUNS id and get the entity back) and the honest `unresolved` list are the coherence details generic enrichment skips.

## 5. Data Model & Logic
Single source of truth: **`lib/xref-resolver.ts`** (pure, deterministic — FNV-1a, no `Math.random`, no wall-clock).
- `detectIdSystem(raw)` → sniffs the input format (zid / email / linkedin·crunchbase·github·x URL / sha256 / Salesforce 00[13]… / DUNS 9-digit / HubSpot numeric / Apollo 24-hex / PDL / domain / ticker), else `unknown`.
- `resolveCrossReference(query)` → `{ input, input_system, entity_type, zinbit_id, canonical, display, resolution_path, references[], unresolved[], confidence }`.
  - **Forward:** email→`resolvePersonFromEmail`; domain→`resolveCompanyFromDomain`; ticker→known-ticker map; Crunchbase permalink→slug match; free text→`resolveCompanyAlias`.
  - **Reverse:** opaque IDs scan a curated **anchor corpus** (the alias-registry domains + example people); the entity whose computed reference set contains the input wins, `resolution_path='reverse'`, matched reference flagged.
- `CrossReference` = `{ system, label, category, id, url|null, canonical, matched, confidence }`. Synthetic IDs: Salesforce `001…`/`003…` (15-char base62), HubSpot numeric, DUNS 9-digit, Apollo 24-hex, PDL `…_0000`, Crunchbase slug — all frozen functions of the entity key. Real: LinkedIn/X/GitHub URLs and tickers from the resolvers.

## 6. State / Integration
- **Gateway:** a normal-pipeline `GET /v1/identity/xref` (catalog entry in `src/data/endpoints.ts`, param `query`, 1 credit) with a deterministic sandbox case returning `resolveCrossReference`. Mirrors `identity-zid`; feeds docs / Explorer / OpenAPI / Postman / CLI. **Seam verified live both directions.**
- **View-model** (`src/data/enrichments.ts`): an `xref` preset (input kind `auto`), an `xref?` field on `EnrichmentResult`, `xrefToResult`, and a shape dispatch (`zinbit_id` + `references[]` + `input_system`) placed **before** the Zinbit-ID check (both carry `zinbit_id`).
- **No store slice** (stateless resolver, like zid/alias/canonicalize). **No route.ts special-path** (normal pipeline).

## 7. UI
- **`/console/xref` — "ID Map":** an input resolves live via `fetch('/api/v1/identity/xref')`; renders an entity header (canonical, Zinbit ID, matched-on, forward/reverse badge, **Copy map as JSON**), KPI tiles (references · public URLs · systems · confidence), and the ID graph grouped by category — each row with the label, the id (mono), a matched chip, a confidence badge, a copy button, and an external-link when a public URL exists — plus a "Not found in" list. Loading (skeleton), empty (examples), error (retry), and not-found states all designed.
- **Studio "Cross-reference ID map" preset** (icon `Waypoints`): the same graph as an `XrefPanel` in the enrichment result. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `cross_reference_viewed` (page view), `cross_reference_resolved` (query, input_system, entity_type, reference_count, resolution_path, confidence), `cross_reference_exported` (copy-as-JSON — the PLG/expansion hook toward keying records on the Zinbit ID). Emitted from both the console page and the Studio.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**12-case** suite: input detection; forward domain/email/ticker/alias; reverse Salesforce/DUNS/Zinbit-ID → same entity + matched flag; determinism; null on empty/unresolvable; unresolved-systems; URL-scheme validity) · isolated `next build` green (73 routes, `/console/xref` present) · full suite **581/581** · **live gateway drill both directions** — `stripe.com` → 12 references across 6 categories, its Salesforce id → same Zinbit ID with `path=reverse`, `SHOP` → Shopify, garbage → INVALID_PARAMETERS. 0 console errors.

## 10. Deferred
OAuth into a customer's CRM to read/write their real instance IDs; a global identity-broker registry beyond the anchor corpus; reverse-resolution of opaque IDs outside the anchor set; ID history/versioning (F-035 identity graph); bulk xref (map a whole file of IDs in one job); write-back of the Zinbit ID as the customer's canonical join key.
