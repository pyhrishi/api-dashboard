# PRD: Job Title Normalization

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Normalize a title" preset — no separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-005 (Now) · **Route:** `/console/studio` (preset `title-normalize`)
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Job titles are free text and wildly inconsistent — "Sr. SWE II", "VP, Eng", "Head of Growth", "CTO" all describe roles a GTM team needs to route and score on. Without normalization, lead routing, ICP scoring, and segmentation all break on the same person written three ways. Job Title Normalization turns any raw title into a canonical title plus a normalized seniority, function, department, and management level — the building block scoring and routing sit on top of.

## 2. Goals & Non-Goals
**Goals**
- Any raw title in → a canonical title + `seniority`, `function`, `department`, `management_level`, and an `is_decision_maker` flag.
- **Transparent classification:** each output carries the lexicon token that produced it (provenance), plus a confidence.
- One **shared seniority ladder** with person resolution (`Individual Contributor → C-Suite`) so titles line up across the product.
- Pure, deterministic parsing (same title → same output), reusing `GET /v1/titles/normalize` (1 credit) and the Studio renderer — no new page, nav, or store slice.

**Non-Goals (this phase)** — bulk title normalization (that is Bulk Enrichment Jobs); multilingual titles; org-chart level inference beyond IC/manager/exec; ML classification (a deterministic lexicon is the spec); writing normalized titles back to a CRM.

## 3. Users & Personas
- **Integrating Developer (land):** normalizes a title in one call to power routing/scoring; copies JSON/cURL.
- **RevOps / Data Leader (expand):** relies on consistent seniority/function to segment and score leads.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Largely **table-stakes**, shipped clean with one point of polish tied to win #5 (operator-grade): **transparent classification** — the exact lexicon token behind every seniority/function decision, plus a confidence, instead of an opaque label. The shared seniority ladder with person resolution keeps the taxonomy coherent product-wide.

## 5. Data Model & Logic
Single source of truth: **`lib/title-normalizer.ts`** → `normalizeJobTitle(raw): TitleNormalization | null`.
- Deterministic lexicon parser (no `Math.random`, no hashing — real parsing): ordered seniority rules (VP → C-Suite → Director → Manager → Lead → Senior → IC) and function rules (Engineering, Product, Design, Data, Sales, Marketing, Customer Success, Operations, Finance, People & HR, Legal), first-match-wins, each returning the matched token.
- `TitleNormalization`: `input`, `canonical_title`, `seniority` (shared `Seniority` type), `function`, `department`, `management_level` (IC / People manager / Executive), `is_decision_maker`, `confidence`, `matched_signals[]`.
- Canonical construction expands C-suite abbreviations (CTO → Chief Technology Officer), formats "VP, X" / "Head of X" / "X Manager" / "Senior <role>" by seniority.
- Invariants (unit-tested in `src/lib/__tests__/titleNormalizer.test.ts`): deterministic; `CTO → Chief Technology Officer`; `Head of Growth → Head of Marketing` (Growth normalizes to the Marketing function — the point of the feature); `Manager`+ is a decision-maker; unrecognized titles degrade to sensible defaults with low confidence.

## 6. API & Gateway
- **Endpoint:** `GET /v1/titles/normalize` (catalog id `title-normalize`, `src/data/endpoints.ts`), param `title`, **1 credit** (a transformation, not a data lookup).
- **Mock:** `src/lib/sandboxAPI.ts` `title-normalize` case returns `{ success, ...TitleNormalization }`; empty input returns `INVALID_PARAMETERS`.
- No PII, so no masking; a new `title` `InputKind` (non-empty validation) backs the preset.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `titleToResult` branch, selected when the response carries `canonical_title` + `seniority`.
- **Result card** (existing Studio `ResultCard`): title = canonical; subtitle = 'Normalized from "<raw>"'; badges = seniority, function, and Decision-maker; fields = Seniority, Function, Department, Management level, Decision-maker, and the raw input; right rail = confidence % + the matched-signal provenance.
- **Preset:** "Normalize a title" (`Tags` icon). **States:** loading, empty (preset prompt), invalid (`INVALID_PARAMETERS`), success (the card).

## 8. Telemetry
Reuses the Studio's run event recorded in the shared `enrichments` slice. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (9 new tests + existing sandbox/enrichment suites) · Playwright smoke: Studio "Normalize a title" turns "Head of Growth" into "Head of Marketing" with badges, fields, confidence, and provenance.

## 10. Deferred
Bulk normalization; multilingual titles; finer org-level inference; ML classification; CRM write-back.
