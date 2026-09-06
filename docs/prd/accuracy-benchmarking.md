# PRD: Accuracy Benchmarking

> Publish sampled precision and recall for every data category — measured against ground truth, with sample sizes, 95% confidence intervals, and a like-for-like comparison to the incumbents. The defensible proof behind the accuracy number, not a vanity figure.

**Status:** Built (prototype is the spec) · **Roadmap:** F-044 (Later → shipped) · **Page:** `/console/benchmarks` · **Source:** `lib/accuracy-benchmark.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enterprise data teams don't buy a marketing "99% accurate" claim — they run their own bake-offs and demand method. The Quality SLA dashboard (F-055) shows whether Zinbit is *hitting its committed targets today*; it does not show *how those numbers were measured or how they compare to alternatives*. Buyers evaluating Zinbit against Clearbit / PDL / ZoomInfo need per-category precision **and** recall, the sample size behind each figure, a confidence interval, and a transparent methodology. Publishing that — rather than a single opaque accuracy number — is both a trust surface and a competitive weapon.

## 2. Goals & Non-Goals
**Goals**
- Publish precision, recall, F1, sample size, and a 95% confidence interval for each data category.
- Show a like-for-like comparison to the named incumbents per category, with Zinbit's lead.
- Make the method explicit (how the QA set is sampled and labeled).
- Let admins re-sample the benchmark and keep a run history; expose one category via API.

**Non-Goals (this phase)** — a live continuously-updating benchmark (this is a periodic re-sample); customer-uploaded ground-truth sets; per-region benchmark breakdowns; vendor-published (vs. estimated) competitor figures; downloadable signed attestation PDFs.

## 3. Users & Personas
- **Enterprise data/eval team (expand):** runs the vendor bake-off — reads per-category precision/recall + CI + method to justify the purchase. The trust win.
- **Developers (land):** `GET /v1/quality/benchmark?category=email` to fetch the proof programmatically and cite it.
- **Sales/leadership:** the competitor-comparison view as a talk track.
- **RBAC:** page visible to `admin | developer | billing`; re-sampling is blocked for **billing** (guarded in the UI and the store action).

## 4. Differentiation
Incumbents publish a single vanity "accuracy" number with no method, no recall, and no interval. Our angle ties to **Win #4 (radical transparency)** — we publish the confusion-matrix-derived precision *and* recall, the sample size, and a Wilson confidence interval per category — and to **Win #1 (dual-engine truth)**: registry-backed categories (the IDS engine — CIN/DIN/GST-anchored identity) score near-perfect precision, so Zinbit's lead is widest exactly where no incumbent can compete (registry identity), and honest/competitive on US firmographics where the field is close.

## 5. Data Model & Logic
Single source of truth: **`lib/accuracy-benchmark.ts`** — deterministic (FNV-1a seeded by `(category, cycle)`, no `Math.random`, fixed reference date `2026-09-06`).
- `benchmarkCategory(category, cycle)` → a `CategoryBenchmark`: draws a sampled QA set, realizes an **integer confusion matrix** (TP/FP/FN) from the category's engine-driven targets, then **computes precision/recall/F1 back out of the counts** so the figures are exactly what the sample yields. `wilsonInterval(p, n)` gives the 95% CI on precision.
- Engines set the precision ceiling: `ids` (registry) ≈ 0.995, `hybrid` lifts scraped data with registry anchoring, `lookup` bounded by source volatility.
- `getBenchmarkReport(cycle)` rolls all 8 categories into an overall precision/recall/F1 (pooled over the matrices) + per-category competitor comparisons. `comparisonFor` places the best incumbent ~`ENGINE_GAP` below Zinbit (widest on `ids`), with the four vendors spread below.
- `benchmarkForCategory(name)` powers the gateway (name/label match; `null` for unknown).
- **State (Zustand, global slice, persisted):** `accuracyBenchmarkRuns: AccuracyBenchmarkRun[]` (capped 12) + `runAccuracyBenchmark()` — billing-blocked, audit-logged (`data.benchmarked`), advancing the re-sample `cycle`. The published report is derived from `cycle = runs.length` (mirrors F-041's run pattern).
- Invariants (unit-tested, `src/lib/__tests__/accuracyBenchmark.test.ts`, 12 tests): determinism; precision/recall equal the matrix; sampleSize = TP+FN; registry out-precisions lookup; Wilson interval brackets the estimate and narrows with n; overall roll-up coherent; comparisons name all four incumbents and compute lead; registry lead widest; a re-sample shifts totals; name match + null; store slice run/cap/billing-block.

## 6. API & Gateway
- `GET /v1/quality/benchmark?category=…` (catalog entry, 1 credit) → the `CategoryBenchmark` (precision, recall, F1, CI, sample size, method). Resolved in `src/lib/sandboxAPI.ts` via a `quality-benchmark` case (`INVALID_INPUT` for an unknown category). No route.ts change.

## 7. UI
`/console/benchmarks` — composed from `components/ui`, semantic tokens only.
- **Header** + a **Re-sample** action (admin/dev); **4 KpiTiles** (overall precision, recall, F1, samples scored, with grade).
- **Two views** (`SegmentedControl`): **By category** — one card per category with an engine badge, grade badge, an animated precision bar with a **CI band** overlaid, and Precision/Recall/F1 metrics + sample size + last-benchmarked date; **vs. competitors** — a category selector and horizontal precision bars for Zinbit (highlighted) vs. the four incumbents, sorted, with a "Leads by X pts" badge.
- **Methodology** card (sampling + labeling + Wilson-interval note; competitor-figures disclaimer) cross-linking to Quality SLA.
- **Re-sample history** list when runs exist.
- **States:** loading skeleton matching the layout; the report is always present (deterministic) so no blank state; billing read-only (no re-sample button); toast confirmation on re-sample. Framer Motion on row entrances and bar fills.

## 8. Telemetry
`accuracy_benchmark_viewed` (on view), `accuracy_benchmark_run {precision, samples}` (re-sample) — via `lib/telemetry.ts`, landing in the events slice / Growth dashboard. **PLG hook:** the competitor-comparison view is a natural share/expansion artifact for the buying team.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (12 new tests) · `next build` green · Playwright smoke (`e2e/benchmarks.spec.ts`: report renders, re-sample records a run, competitor view renders bars) · live gateway smoke: `?category=registry_id` → near-perfect precision + CI; `?category=phone` → lower recall as expected; unknown category → `INVALID_INPUT`.

## 10. Deferred
Live continuously-updating benchmark; per-region breakdowns; customer-uploaded ground-truth sets; vendor-published competitor figures; signed attestation export; a benchmark-over-time trend from the run history.
