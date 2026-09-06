# PRD: Probabilistic Fuzzy Matching

> **A preset in the Enrichment Studio.** Ships at `/console/studio` as "Fuzzy match" (`fuzzy` preset), backed by a real endpoint. No separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-024 · **Route:** `/console/studio` (preset `fuzzy`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Real CRM data is dirty: "Jhon Smith" at "Stipe", "Bob Johnson" (really Robert), a company typed six different ways. Exact-match lookups miss all of it. Probabilistic Fuzzy Matching takes a messy (name, company) and scores the people it most likely refers to — each with a match probability and the per-field similarity behind it — so you can dedup, reconcile, and resolve records that an exact match would drop.

## 2. Goals & Non-Goals
**Goals**
- One messy (name, company) in → **ranked candidate people** out, each with a `match_probability`, `name_similarity`, `company_similarity`, and what it `matched_on`.
- A canonical **interpretation** of the query (typo- and nickname-corrected), a decisive **verdict** (strong / likely / weak / no_match), and a **best match**.
- **Honest** confidence: a name it can't verify against a real, reconciled company drops to weak / no_match rather than a false positive.
- Deterministic — the same query always scores the same.

**Non-Goals (this phase)** — ML/embedding similarity (real Jaro-Winkler string metric here — see F-290 for vector look-alikes); multi-record bulk dedup (that's a Bulk Jobs pattern on top of this); address/phone fuzzy matching (name + company only this phase); a learned nickname model (a curated dictionary for now).

## 3. Users & Personas
- **RevOps / Data (land):** reconciles a dirty inbound record to a canonical contact before it hits the CRM.
- **Integrating Developer (expand):** thresholds on `match_probability` in a dedup pipeline.
- **Sales (expand):** finds "who did I mean" from a half-remembered name.
- **RBAC:** the Studio's `admin | developer` gate; read-only.

## 4. Differentiation
**Table-stakes matching, shipped transparent** (win #5): a real **Jaro-Winkler** metric with a **per-field breakdown** (name vs company similarity), a canonical interpretation of the messy input, and a calibrated verdict you can threshold — not an opaque black-box score. The honest-confidence behavior (an unverifiable company tanks the score) is the operator-grade detail cheaper matchers skip.

## 5. Data Model & Logic
Single source of truth: **`lib/fuzzy-matcher.ts`** → `fuzzyMatch(name, company): FuzzyMatchResult | null` (null only when the name is empty).
- `jaroWinkler(a, b)` — a real Jaro similarity with a common-prefix bonus (good for typos/transpositions). Exported and unit-tested against known pairs.
- **Normalization:** a curated nickname map (Bob→Robert, Bill→William…) and common name-typo fixes (Jhon→John, Micheal→Michael…) canonicalize the query name; the company is reconciled by best Jaro-Winkler match against a known-company set.
- **Scoring:** `match_probability = 0.62·name_similarity + 0.38·company_similarity`; an unverifiable company contributes only 0.3, so it can't manufacture a strong match. `verdict`: ≥0.9 strong, ≥0.75 likely, ≥0.55 weak, else no_match.
- **Candidates:** the canonical reading of the query plus deterministic decoys at the same company, all scored and ranked.
- Invariants (unit-tested, `src/lib/__tests__/fuzzyMatcher.test.ts`): deterministic; typo+nickname correction; company reconciliation; unknown company → weak/no_match; candidates ranked best-first; `best_match` null on no_match.

## 6. API & Gateway
- **Endpoint:** `GET /v1/match/fuzzy` (catalog id `fuzzy-match`), params `name` (required) + `company` (optional), **2 credits**.
- **Mock:** `src/lib/sandboxAPI.ts` `fuzzy-match` case returns `{ success, ...FuzzyMatchResult }`; empty name → `INVALID_PARAMETERS`.
- **Masking:** candidate emails are treated like other resolved contacts (live-key masking applies).

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `fuzzyToResult` branch (keyed on a `candidates` array + a `verdict` string — distinct from every other shape), emitting a structured `fuzzy` section.
- **`FuzzyMatchPanel`** (in `app/console/studio/page.tsx`): the interpreted query + verdict badge, then a ranked candidate list — each row a probability bar, the name/company similarity, the resolved email/title, and a "best match" highlight on the top row. Renders only when `result.fuzzy` is present.
- **Preset:** "Fuzzy match" (`GitCompareArrows`/`Search` icon, identity category); a two-field input (name + company) — the first Studio preset with two inputs, so the run composes both into the query. **States:** loading / empty / no-match (designed low-confidence state) / success. Semantic tokens only; light + dark; Framer Motion.

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No dedicated event.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (9 fuzzy-matcher cases + a view-model dispatch test + suite) · isolated build green · live Studio walkthrough ("Jhon Smith / Stipe" → strong "John Smith / Stripe"; gibberish → weak/no_match).

## 10. Deferred
Embedding/ML similarity (F-290 look-alikes); bulk dedup; address/phone fuzzy fields; a learned nickname model; cross-field weighting controls.
