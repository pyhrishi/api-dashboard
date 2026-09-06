# PRD: Entity De-duplication

> A list-in, golden-records-out enrichment: `GET /v1/records/dedupe` and its Enrichment Studio preset, clustering with the same similarity engine as fuzzy matching (`lib/entity-dedup.ts` → `lib/fuzzy-matcher.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-026 (Next → shipped) · **Endpoint:** `GET /v1/records/dedupe` · **Preset:** Studio → "De-duplicate records"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Every CRM accumulates duplicates — the same person entered three times with a typo, a nickname, and a company written as a domain. Before you enrich (and pay per record), you want to collapse those into one golden record. Entity de-duplication takes a messy record list and clusters near-duplicates into golden records, so downstream enrichment runs once per real entity, not once per row.

## 2. Goals & Non-Goals
**Goals**
- `GET /v1/records/dedupe?records=<list>` clusters a delimited "Name, Company" list into golden records.
- Each cluster returns its golden record, the merged members with per-member similarity, and a merge confidence; plus a dedup summary (input/unique/duplicate/rate).
- Reuse the **same Jaro-Winkler engine** as Probabilistic Fuzzy Matching, so dedup and fuzzy match score variants identically.
- Deterministic — the same list always dedupes the same way.

**Non-Goals (this phase)** — persisting or writing merges back to a store; interactive merge review/override UI; dedup across data types beyond person+company (e.g. addresses); a bulk/async dedup job (the sync path covers demo-scale lists ≤ 50); ML-learned blocking keys.

## 3. Users & Personas
- **RevOps / data engineer (land):** dedupes an import before enriching to save credits and avoid double-outreach.
- **Enterprise data steward (expand):** produces golden records with an auditable per-member similarity and confidence.
- **Developer:** one call turns a raw list into clustered golden records.
- **RBAC:** standard authenticated key; billed one credit.

## 4. Differentiation
The angle is a **golden record with its receipts**: every merge shows which variants collapsed and each one's similarity to the golden, plus a cluster confidence — not an opaque "N duplicates found." Coherence is the moat: dedup reuses the exact Jaro-Winkler function behind Fuzzy Matching (`lib/fuzzy-matcher.ts`), so the two features can never disagree about whether two records are the same entity.

## 5. Data Model & Logic
Single source of truth: **`lib/entity-dedup.ts`** → `deduplicateRecords(raw): DedupResult | null`.
- `parseRecords` splits a `;`- or newline-delimited list into `{name, company}` rows (capped at 50).
- Blended similarity = `0.65·JW(name) + 0.35·JW(company)` over normalized fields (company TLDs and legal suffixes stripped), using the shared `jaroWinkler`. Greedy single-link clustering in input order merges records at/above a 0.86 threshold — **no `Math.random`, no wall-clock**.
- Golden record = the most *complete* member (token count, no abbreviations, has a company), ties broken by input order; confidence = mean pairwise similarity across the cluster (1 for a singleton).
- Returns `null` for fewer than two parseable records (nothing to dedupe).
- Invariants (unit-tested, `src/lib/__tests__/entityDedup.test.ts`, 7 tests): parses the list; null under two records; collapses typo/company variants into one cluster with the full name as golden; keeps distinct entities apart; the summary reconciles with the clusters (members sum to input, one golden per cluster); elects the most complete golden; deterministic.

## 6. API & Gateway
- **Endpoint:** `GET /v1/records/dedupe` (catalog entry in `src/data/endpoints.ts`; mock case in `src/lib/sandboxAPI.ts`), 1 credit, param `records`. Fewer than two records → `400 INVALID_PARAMETERS`. Runs the full gateway pipeline like every `/v1` route.

## 7. UI
- **Enrichment Studio preset** "De-duplicate records" (`src/data/enrichments.ts` — preset + `dedupToResult` + dispatch keyed on a `clusters` array + numeric `dedup_rate`). Rendered by a `DedupPanel` in the Studio `ResultCard`:
  - A **summary strip** — input count, unique (golden) count, duplicates removed, dedup rate.
  - A **cluster list**, largest first: each shows the golden record (name · company) with a confidence badge, and its members as rows with a similarity bar and a "golden" marker.
- KPI fields (input, unique, duplicates, rate) render in the standard field grid. Semantic tokens only; motion on rows. **States:** loading spinner; the standard error state for a single/empty list; inherited 402/429 handling.

## 8. Telemetry
Reuses the generic `enrichment_run` event (preset `dedupe`) — no bespoke event; adoption still lands in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (7 new tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green. Live curl is IP-gated (`::1`, SOC 2 policy); the browser same-origin Studio path is the live surface.

## 10. Deferred
Write-back / persisted golden records; interactive merge review and override; dedup across addresses/other entity types; a bulk/async dedup job; learned blocking keys; a "dedupe-before-enrich" pipeline step (F-273).
