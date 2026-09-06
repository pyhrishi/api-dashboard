# PRD: Match Threshold Tuning

> **A console page.** Ships at `/console/thresholds` ("Match Thresholds"). No API endpoint — it tunes a persisted setting that governs the matching features.

**Status:** Built (prototype is the spec) · **Roadmap:** F-034 · **Route:** `/console/thresholds`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
"How confident is confident enough?" is a business decision, not a data-science one — and it differs per workflow. Contact matching should favor precision (a wrong merge is expensive); lead routing should favor recall (a missed match loses the lead). Match Threshold Tuning lets a team set the confidence floor for each use case and *see* what it accepts and rejects on a labeled sample, scored by the same engine that governs real matches — so the number they pick is grounded, not guessed.

## 2. Goals & Non-Goals
**Goals**
- A **confidence floor per use case** (contact matching, company de-dup, lead routing), persisted and applied.
- An **interactive tuner**: drag the floor and watch a labeled sample split into accepted/rejected with live **precision / recall / F1** and a per-pair breakdown.
- A **suggested** floor (F1-maximizing over the sample) and a per-use-case recommended default.
- **RBAC**: admin/developer tune; billing role is read-only.
- **Faithful**: the sample is scored with the exact production engine (Jaro-Winkler + name canonicalization), so the floor tuned here is the floor that applies.

**Non-Goals (this phase)** — applying the floor inside the live `/v1/match` responses (this phase persists the setting and proves it on a sample; wiring it into the endpoints is a follow-on); per-field threshold weighting; A/B-testing thresholds; uploading a custom labeled set; auto-tuning on real traffic.

## 3. Users & Personas
- **RevOps / Data leader (land + expand):** governs match strictness per workflow with a precision/recall view, not a blind number.
- **Integrating Developer:** reads the persisted floor and thresholds their own pipeline on it.
- **RBAC:** `admin | developer` tune; `billing` views read-only (the store actions throw for billing, and the UI disables the controls).

## 4. Differentiation
**Operator-grade (win #5):** an interactive precision/recall tuner over the *actual* scoring engine, with a labeled sample and a per-decision breakdown — not a bare number field. The faithfulness guarantee (same Jaro-Winkler + canonicalization as Fuzzy Matching and De-dup) is the coherence detail that makes the tuned floor trustworthy.

## 5. State & Data
- **Store slice** (`lib/store.ts`): `matchThresholds: Record<MatchUseCase, number>` (persisted in `partialize`), actions `setMatchThreshold(useCase, value)` (clamped 0.5–0.99) and `resetMatchThresholds()` — both **throw for the billing role**. Defaults from `DEFAULT_THRESHOLDS`.
- **Engine** (`lib/threshold-tuning.ts`, SSOT): `getSamplePairs(useCase)` returns labeled record pairs **scored live** — contacts via `canonicalNameString` + `jaroWinkler`, companies via a legal-suffix-stripping normalize + `jaroWinkler` (mirroring each matcher). `evaluateThreshold(pairs, t)` → a confusion matrix + precision / recall / F1 / accuracy. `suggestThreshold` picks the F1-max floor. Deterministic; **no `Math.random`**.
- Invariants (unit-tested, `src/lib/__tests__/thresholdTuning.test.ts`): every pair scored in range and labeled; each sample has both matches and non-matches; deterministic; **raising the floor never increases recall or accept-count**; the confusion matrix sums to the total; the suggested floor beats both extremes on F1.

## 6. UI
- **`/console/thresholds`** (new page): a use-case `SegmentedControl`; live KPI tiles (precision, recall, F1, accepted/total); a styled range slider with a "suggested" marker and the recommended default; **Use suggested / Reset all / Save floor** (Save disabled unless dirty; all disabled for billing); and a **labeled-sample table** — each pair's two records, its score, the ground-truth label, and its accept/reject decision at the current floor, with correctly-classified rows normal and misclassified rows tinted. Cross-links to the Fuzzy match and De-dup presets.
- **States:** loading skeleton; a read-only banner for billing; success (the tuner); no error/empty state (the sample is always present).
- Semantic tokens only; light + dark; Framer Motion; a toast on save/reset.

## 7. Integration
- **Nav:** "Match Thresholds" (SlidersHorizontal icon) after Match Rate, roles `admin | developer | billing`.
- **SSOT reuse:** the tuner imports `jaroWinkler` (F-024) and `canonicalNameString` (F-030) — the same primitives Fuzzy Matching and Entity De-dup use.

## 8. Telemetry
`thresholds_viewed` (on load), `threshold_changed` (on slider move, with the value), `threshold_saved` (with the value + resulting precision/recall).

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (6 tuning cases + the unchanged fuzzy/canonical suites; 316 total) · isolated build green · live walkthrough (KPI tiles + labeled sample; dragging the floor moves precision/recall in real time — 85%→72% took precision 60→58%, recall 86→100%, accepted 10→12).

## 10. Deferred
Apply the floor inside live `/v1/match` responses; per-field weighting; threshold A/B testing; custom labeled-set upload; auto-tuning on real traffic.
