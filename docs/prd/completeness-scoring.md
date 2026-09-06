# PRD: Completeness Scoring

> **A per-result quality signal in the Enrichment Studio.** Rendered as a "record completeness" meter on every field-bearing result. No new page, nav, endpoint, or store slice.

**Status:** Built (prototype is the spec) · **Roadmap:** F-048 (Now) · **Route:** `/console/studio` (every field-bearing result)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A lookup can "succeed" and still hand back a half-empty record — a person with an email but no phone or location, a company missing revenue and funding. Success (a 200) says the entity was found; it says nothing about how much of the entity you actually got. Completeness scoring measures exactly that: what share of a record's expected attributes came back populated, so a user knows how much of the record they're working with before they act on it.

## 2. Goals & Non-Goals
**Goals**
- A **0-100 completeness score** per resolved record = populated ÷ expected fields.
- A **tier** (complete / partial / sparse) and the **named missing fields**, so the gap is actionable.
- Works across **every field-bearing lookup** (person, company, identity/generic) with one kind-agnostic scorer.
- Deterministic and computed from the resolved record itself — placeholders ("—", "N/A") count as empty.

**Non-Goals (this phase)** — a configurable per-plan "required fields" schema; completeness as a billable gate; completeness trends over time (belongs with Data-quality scorecards, F-528); scoring the structured-only results (social footprint, deliverability, domain auth) that have no flat record to rate.

## 3. Users & Personas
- **Integrating Developer (land):** sees instantly whether to enrich further or accept the record; the named gaps say which identifier to try next.
- **Data / RevOps Leader (expand):** uses completeness alongside confidence and freshness to decide if a record clears the bar for a campaign or CRM sync.
- **RBAC:** inherits the Studio's `admin | developer` gate; it is a passive display attribute with no mutation.

## 4. Differentiation
**Table-stakes for the category, shipped clean and honest.** The point of care is that completeness is measured on the *resolved record* with real placeholder detection — not "did the call return 200" — and it sits beside the confidence score (how sure) and F-040 freshness (how current) to form a three-part record-quality read (how sure · how current · how complete) that most enrichment APIs never surface at all.

## 5. Data Model & Logic
Single source of truth: **`lib/completeness-scorer.ts`** → `scoreCompleteness(fields): CompletenessScore | null`.
- `CompletenessScore`: `{ score (0-100), populated, total, missing: string[], tier: 'complete' | 'partial' | 'sparse' }`.
- `isFieldPopulated(value)`: a value is empty if, after stripping separators and dashes, nothing meaningful remains, or it reduces to a placeholder token (`na`, `null`, `undefined`, `unknown`, `none`, …). So "—", "— · —", and "N/A" all count as empty; "Acme · acme.com" and "$1.2B raised" count as populated.
- **Tiers:** ≥80 complete, ≥50 partial, else sparse.
- Returns **null when there are no fields**, so structured-only results (social, deliverability) simply omit the meter.
- Invariants (unit-tested in `src/lib/__tests__/completenessScorer.test.ts`): deterministic; `total === fields.length`; placeholders never count; `score ∈ [0,100]`; missing[] names exactly the empty fields.

## 6. State / Integration
- **No new store slice, endpoint, or nav.** Applied as a post-processor in `src/data/enrichments.ts`: `toEnrichmentResult = buildEnrichmentResult → withFieldFreshness (F-040) → withCompleteness (F-048)`, adding an optional `completeness?: CompletenessScore` to `EnrichmentResult`.
- Because it composes over the generic view-model, it covers every current and future field-bearing preset automatically — one scorer, all records.

## 7. UI
- **`CompletenessMeter`** (in `app/console/studio/page.tsx`): a compact card under the field grid showing the tier label, the score, "N/M fields", a tone-coded animated bar (green / amber / red), and, when incomplete, a "Missing: …" line with a nudge to try another identifier. Semantic tokens only; correct in light + dark; Framer Motion fill.
- Renders only when `result.completeness` is present (field-bearing records), so social/deliverability panels are unaffected.
- **States:** it is itself a success-state adornment; loading/empty/error are the Studio's existing result states.

## 8. Telemetry
No new event — completeness is a passive display attribute, and forcing an interaction event on it would be a dark pattern. The enclosing `enrichment_run` event already records that a result (and thus a completeness score) was produced.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (completeness-scorer suite + two view-model dispatch tests; 187 total) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live Studio walkthrough (person record → "Complete record · 100% · 4/4 fields", coexisting with F-040 freshness chips and the confidence rail).

## 10. Deferred
Per-plan required-field schemas; completeness trends / scorecards (F-528); completeness on structured-only results; export of a completeness column in Bulk Jobs results.
