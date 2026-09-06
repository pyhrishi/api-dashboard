# PRD: Quality SLA Dashboard

> An enterprise trust surface: the `/console/quality-sla` dashboard, deriving data-quality metrics vs committed targets from one source (`lib/quality-sla.ts`, over the coverage + health models).

**Status:** Built (prototype is the spec) · **Roadmap:** F-055 (Next → shipped) · **Page:** `/console/quality-sla` · **Source:** `lib/quality-sla.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enterprise buyers don't just want good data — they want a *number they can hold you to*. Match rate, accuracy, coverage, freshness, uptime, and latency each carry an implicit or contractual SLA, and there's no single place that shows current performance against those commitments or flags a breach. The Quality SLA dashboard is that single pane: every quality metric against its target, with a trend and a breach log.

## 2. Goals & Non-Goals
**Goals**
- Show the core data-quality + platform metrics against **committed targets**, each with a met / at-risk / breached status and a 30-day trend.
- Roll up to an overall SLA-compliance figure and an overall status.
- Keep a breach log (open + resolved) so a dip is visible and accountable.
- Derive from real signals — reuse the coverage and health models — so the dashboard can't diverge from them.

**Non-Goals (this phase)** — per-customer contractual SLA configuration (targets are the platform's committed defaults); alerting/webhooks on breach (that's a follow-up); credit/refund automation on breach; editing targets from the UI; historical SLA reports beyond the 30-day trend.

## 3. Users & Personas
- **Enterprise buyer / procurement (expand):** verifies Zinbit is hitting its committed numbers before and during a contract.
- **Customer success / account team:** points to the dashboard in a QBR.
- **Platform/ops:** sees which metric is at risk and why, with links to the underlying signals.
- **RBAC:** `admin | developer | billing` — a trust surface visible to the whole workspace (read-only; nothing to mutate).

## 4. Differentiation
Most vendors publish a static "99.9%" and a marketing accuracy claim; the operator-grade move is a **live, honest scorecard** that shows the real numbers against targets, admits when one is at risk, and keeps a breach log with resolved history — the same transparency theme as the Match Audit Trail and the Status page. Crucially it's **single-sourced**: match rate and coverage come from the regional coverage model, uptime from the health model, so the SLA figures can never contradict those pages.

## 5. Data Model & Logic
Single source of truth: **`lib/quality-sla.ts`** → `getQualitySLAReport(opts?)`.
- Six metrics: match rate + accuracy + coverage + uptime (higher-is-better) and freshness + p95 latency (lower-is-better). Match rate and coverage are derived from `getCoverageSnapshot()`; uptime from `getHealthSnapshot()`; accuracy and latency are deterministic (FNV-1a-seeded). A supplied `matchRate` (0–1) overrides the derived value.
- Each metric gets a status (`met` if it meets the target, `at_risk` within a small margin, else `breached`), a 30-day trend that lands on the current value, and a description. Overall status = the worst metric; compliance % = share of metrics met. **No `Math.random`, no wall-clock in the values.**
- Breach log: an open breach for every metric not currently met, plus curated resolved history.
- Invariants (unit-tested, `src/lib/__tests__/qualitySla.test.ts`, 5 tests): deterministic; six metrics with coherent status + 30-point trend; compliance + overall status derived from the metrics; an open breach for each not-met metric (+ resolved history); a supplied match rate is honored (0.5 → breached).

## 6. API & Gateway
None — the dashboard renders from the deterministic report; no credits, no gateway call.

## 7. UI
- **`/console/quality-sla`** (`app/console/quality-sla/page.tsx`, client component, `RoleGuard`):
  - An **overall compliance banner** (compliance %, a plain-language overall status) and a KPI row (compliance, targets met, open breaches, period).
  - A **metric grid** — one card per metric with the current value vs target, a status badge, a 30-day `Sparkline`, a higher/lower-is-better arrow, and a description.
  - A **breach log** (open first, then resolved) with severity and date.
  - A methodology note linking to Regional Coverage and Status for the underlying signals.
- Semantic tokens only; Framer Motion on cards. **States:** loading skeleton and the populated dashboard — no layout shift.
- **Nav:** a role-filtered "Quality SLA" entry (Gauge icon) beside Match Rate / Match Audit.

## 8. Telemetry
Reuses the console layout's central `feature_viewed` event (fired for every route) — no bespoke event this phase.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (5 new tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green (`/console/quality-sla` route emitted). Browser walkthrough: metrics render against targets, at-risk/breached metrics open breaches, the trend sparklines land on the current value.

## 10. Deferred
Per-customer contractual SLA targets; breach alerting/webhooks; refund/credit automation on breach; editable targets; longer historical SLA reporting; live traffic-derived match rate (currently coverage-derived).
