# PRD: Data Decay Alerts

> Score every enriched record for *impending* decay — before its email bounces, its phone disconnects, or the person changes jobs — and raise an explainable, severity-tiered alert so teams re-verify the riskiest records first.

**Status:** Built (prototype is the spec) · **Roadmap:** F-042 (Later → shipped) · **Page:** `/console/data-decay` · **Source:** `lib/data-decay.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriched data has a half-life: people change jobs, corporate email migrates after M&A, direct dials disconnect. Automated re-verification (F-041) already re-checks fields once they pass a cadence and reports what *changed* — but that's reactive: it tells you a record decayed only after the re-check runs. Teams that route leads, sync CRMs, and page on-call want the opposite: a **forward-looking** signal — *which records are about to rot, how urgently, and why* — so they can prioritize the riskiest before a campaign goes out on stale data.

## 2. Goals & Non-Goals
**Goals**
- Score each monitored record's decay risk (0–1 probability + severity) from explainable factors, *before* it's due.
- Raise severity-tiered alerts with a configurable threshold, and a per-record triage lifecycle (snooze / resolve / reopen) that survives reload.
- Stay coherent with F-041: same record pool, same ages; each alert's primary CTA routes into re-verification.
- Expose the score programmatically: `GET /v1/records/decay-score`.

**Non-Goals (this phase)** — actually mutating records or performing the re-check (that's F-041); routing alerts to email/Slack/webhooks; a full model retrained on outcome feedback; per-record confidence intervals; batch scoring an uploaded list.

## 3. Users & Personas
- **RevOps / Data (land):** opens an inbox of "these records are about to go stale, here's why," and re-verifies the criticals first — the 10-minute win.
- **Deliverability / Sales-ops (expand):** sets the **severity threshold** that decides what's worth surfacing, keeping noise down.
- **Developers:** call the endpoint to gate a send ("skip contacts scoring ≥ high").
- **RBAC:** page visible to `admin | developer | billing`; **billing is read-only** — triage and threshold are disabled (guarded in the UI and the store actions).

## 4. Differentiation
Clearbit/ZoomInfo tell you data *is* stale after a re-check; none score *impending* decay with a transparent factor breakdown tied to the same monitored pool. Our angle ties to **Win #1 (coherence)**: the decay score, the alert inbox, and the re-verification run all speak about the *same* records with the *same* ages and numbers — the alert says a VP's email will likely bounce in ~11 days, and one click re-verifies exactly that record. The score is **explainable, not a black box**: every alert lists the factors (age vs. window, field volatility, role mobility, company events) that produced it.

## 5. Data Model & Logic
Single source of truth: **`lib/data-decay.ts`** — deterministic (FNV-1a seeded, no `Math.random`, fixed reference date `2026-09-06`), built on the re-verification record pool (`generateReverifiableRecords`) so the population is shared.
- `scoreDecay(record, cadence)` → `{ probability, severity, factors[], projectedDecayDate, daysToDecay, companyEvent, ageDays }`. The **age term** (`1 − e^(−0.7·ageRatio)`) is the dominant driver; a **volatility** blend of field type (employment > email > phone), **role mobility** (senior titles churn more), and a deterministic **company event** (acquisition / layoffs / rapid_growth / stable) amplifies it. Probability → severity: `≥0.75 critical`, `≥0.55 high`, `≥0.35 medium`, else `low`.
- `computeDecayAlerts(cadence, threshold, states)` scores all, filters at/above the severity floor, joins the store's lifecycle overlay, and sorts by risk. `effectiveStatus` makes an **expired snooze silently revert to open**, so stale snoozes never hide risk.
- `summarize(alerts, monitored)` → KPI roll-up (monitored, open at-risk, critical, median horizon).
- `decayScoreForEmail(email)` powers the gateway (email/entity match against the pool; `null` when unresolvable).
- **State (Zustand, global slice, persisted):** `decayAlertThreshold: DecaySeverity` + `decayAlertStates: Record<string, DecayAlertState>` (`open|snoozed|resolved`, `snoozedUntil`, `updatedAt`). Actions `snoozeDecayAlert` / `resolveDecayAlert` / `reopenDecayAlert` / `setDecayAlertThreshold` are billing-role-blocked and audit-safe. Alerts are *derived*, not stored (mirrors F-041's due-records).
- Invariants (unit-tested, `src/lib/__tests__/dataDecay.test.ts`, 13 tests): determinism + bounded probability + valid severity; older record scores higher; pool ranked by risk descending; deterministic company events; higher threshold ⇒ fewer/equal alerts (all meet the floor); expired vs. active snooze; resolved overlay carried onto the alert; summary counts open-only; email match + null; store slice resolve/reopen/snooze/threshold + billing block.

## 6. API & Gateway
- `GET /v1/records/decay-score?email=…` (catalog entry, 1 credit) → the `DecayScore` (probability, severity, projected decay date, factors, company event). Resolved in `src/lib/sandboxAPI.ts` via a `records-decay` case (`INVALID_INPUT` when unresolvable). No route.ts change — flows the normal enrichment pipeline (billing, masking, envelope).

## 7. UI
`/console/data-decay` — composed from `components/ui` primitives, semantic tokens only.
- **Header** + a Re-verification cross-link; **4 KpiTiles** (monitored, at-risk ≥ threshold, critical, median horizon).
- **Left column:** the severity-threshold `SegmentedControl` with a live per-severity count, and a "how decay is scored" explainer linking to re-verification.
- **Alert inbox:** Open / Snoozed / Resolved tabs (counts); each alert row is a `GlassCard` with a severity stripe, entity·company, field + value, a company-event chip, an animated **probability bar**, the top factor chips (hover for detail), the projected-decay horizon, and actions (**Re-verify** primary CTA → F-041, Snooze 7/14/30d popover, Resolve, Reopen).
- **States:** loading skeleton matching the final layout; a designed empty state per tab (all-healthy / nothing snoozed / nothing resolved); toast confirmations on every triage; billing read-only banner. Framer Motion row enter/exit (`AnimatePresence` + `layout`) and bar fill.

## 8. Telemetry
`decay_alerts_viewed` (on view), `decay_alert_actioned {action, severity}` (snooze/resolve/reopen), `decay_threshold_changed {severity}` — via `lib/telemetry.ts`, landing in the events slice / Growth dashboard. **PLG hook:** the at-risk / critical counts nudge toward running re-verification (expansion into more verified calls).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (13 new tests) · `next build` green · Playwright smoke (`e2e/data-decay.spec.ts`: renders, snooze moves a record off Open, Critical threshold narrows the inbox) · live gateway smoke: a monitored email → decay score + factors; unknown email → `INVALID_INPUT`.

## 10. Deferred
Alert routing to email/Slack/webhooks; outcome-feedback model retraining; per-record confidence intervals; batch scoring of an uploaded list; a "decayed since last seen" diff against prior scores; auto-snooze policies.
