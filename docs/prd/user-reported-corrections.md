# PRD: User-Reported Corrections

> A governed correction feedback loop: customers flag a wrong field value inline on a result; a reviewer triages and accepts; the accepted value overlays future results, attributed to "Customer Correction".

**Status:** Built (prototype is the spec) · **Roadmap:** F-046 · **Routes:** `/console/studio` (report inline), `/console/corrections` (review queue), `POST/GET /v1/feedback/correction` (programmatic)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment data drifts — people change titles, phones, and cities; companies rebrand. The customer using the data is often the first to notice a wrong value, but there's usually no way to feed that knowledge back. F-046 turns that observation into a governed loop: flag the field, propose the right value, and — once a reviewer accepts — the corrected value comes back on the next lookup, cited to the customer who reported it. It is deliberately **not** a silent overwrite: every correction is triaged and human-reviewed, so a bad or malicious report can't poison the data.

## 2. Goals & Non-Goals
**Goals**
- **Report inline:** flag any field on a Studio result and propose the correct value in two clicks.
- **Triage:** every correction gets a deterministic AI verdict (likely-valid / needs-review / suspect) so reviewers act on the strong ones first.
- **Govern:** a review queue where admin/developer accept, reject, or revert; every decision is audit-logged.
- **Close the loop:** an accepted correction overlays the field on future results, badged "corrected" and re-attributed to the first-party "Customer Correction" provider in the Sources panel (F-043).
- **Programmatic path:** report corrections from a pipeline via `POST /v1/feedback/correction`.

**Non-Goals (this phase)** — auto-accepting corrections without review; editing the underlying resolver data (this is a governed overlay); correcting structured-only panels (deliverability/funding/etc. — only flat fields); per-field reputation/weighting of reporters over time; bulk correction import; correcting masked values in live (the flag is hidden for masked live fields).

## 3. Users & Personas
- **Integrating developer (land):** spots a stale value mid-integration and flags it in seconds, or reports from their pipeline via the API.
- **Data-ops / admin (expand):** works the review queue, triaging with the AI verdict; owns data quality.
- **Security / compliance (expand):** the governed loop + audit trail shows corrections are reviewed, not silently applied.
- **RBAC:** `/console/corrections` is admin + developer; reviewing (accept/reject/revert) is blocked for billing in the store action. Reporting is open to any authenticated role.

## 4. Differentiation
Ties to **win #2 (compliance-native)** and **win #5 (operator-grade)**: most enrichment APIs offer no correction path, and those that do overwrite silently. Zinbit makes the loop **governed and cited** — triaged, human-reviewed, audit-logged, and surfaced as a first-party source alongside every other provider — so a corrected value is as traceable as any other field.

## 5. Data Model & Logic
Single source of truth: **`lib/corrections.ts`**.
- `Correction` — `{ id, entityKey, presetId, presetLabel, input, field, fieldKind, oldValue, newValue, reason, status, reportedBy, reportedAt, reviewedBy?, reviewedAt?, environment, triage }`.
- `correctionEntityKey(presetId, input)` keys a correction to the exact lookup it corrects; `inferFieldKind(label)` + `validateFieldValue(kind, value)` drive validation; `summarizeCorrections`, `acceptedCorrectionsFor`, `makeCorrectionId`, and a deterministic `generateSeedCorrections` round it out. No `Math.random`.
- **AI triage** lives in `lib/insight-engine.ts` (`triageCorrection`, mirroring `suggestTriage`): a deterministic 0..1 plausibility from format validity, materiality of the change, numeric plausibility, reason specificity, and reporter-domain trust → `likely_valid | needs_review | suspect` with human-readable reasons. Same input → same verdict.
- **Overlay** lives in `src/data/enrichments.ts` (`applyCorrections`): pure; replaces matching fields' values, flags them `corrected`, re-writes their provenance `source` to `User-reported correction`, and re-runs source attribution. `lib/source-catalog.ts` maps that source to the first-party **Customer Correction** provider.

## 6. State / Integration
- **Store slice** (`lib/store.ts`): `corrections: Correction[]` is tenant-scoped (in `TenantState`, `extractTenantState`, `defaultTenantState`) and persisted (`partialize`). Actions: `seedCorrections` (idempotent), `reportCorrection` (any role; snapshots triage via the insight engine; audit-logged), `reviewCorrection` (accept/reject; billing blocked; audit-logged), `revertCorrectionReview` (undo; billing blocked).
- **Studio** computes the display result as `applyCorrections(result, acceptedCorrectionsFor(corrections, entityKey))`, so accepted corrections show immediately; the inline flag calls `reportCorrection`.
- **Gateway** (`src/lib/gateway/corrections.ts`): an in-memory registry behind `POST/GET /v1/feedback/correction`, reusing the same `triageCorrection`. Reports land `pending`. Catalog entries `correction-report` / `correction-stats` feed docs/Explorer/OpenAPI/Postman.

## 7. UI
- **Inline (Studio):** each field cell gets a hover flag; clicking opens a Modal (current value struck through, a required "correct value", an optional reason). On submit → toast + the correction is pending in the queue. A corrected field shows a teal `PencilLine`, a "corrected" tag, and the "Corrected from …" note.
- **Review queue (`/console/corrections`):** KPIs (total, pending, accepted & applied, accept rate), an "act now" banner when likely-valid corrections are pending, a status SegmentedControl (Pending/Accepted/Rejected/All with counts), and a DataTable (field + context, proposed change old→new, AI-triage badge + top reason, reporter + time, accept/reject or status + revert). Beautiful loading (skeletons), empty (per-filter copy + Studio CTA), and success/error (toasts) states. Semantic tokens; Framer Motion; light + dark.
- **Nav:** "Corrections" (icon `MessageSquareWarning`), admin + developer.

## 8. Telemetry
`corrections_viewed` (queue open), `correction_reported` (inline or API-driven inline), `correction_reviewed` (decision + verdict). Emitted via `lib/telemetry.ts` into the growth slice.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (corrections SSOT + triage suite, gateway registry suite, an `applyCorrections` view-model test) · isolated build green (route `/console/corrections`) · live walkthrough: queue renders with seeded corrections (50% accept rate, 3 pending), running `jane.doe@acme.com` shows the accepted Phone correction overlaid + "Customer Correction" in Sources, and the inline flag → submit lands a new pending correction (3 → 4). 0 console errors.

## 10. Deferred
Auto-accept policies; reporter reputation/weighting; correcting structured panels and masked-live values; bulk correction import; editing underlying resolver data; a consent/lawful-basis register for corrections.
