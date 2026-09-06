# PRD: Historical Time-Series Attributes

> Chart how a company's attributes changed month over month — headcount, estimated revenue, tech footprint, open roles — each with trailing-12-month growth, average MoM growth, and a trend, anchored to today's firmographics.

**Status:** Built (prototype is the spec) · **Roadmap:** F-022 · **Routes:** `GET /v1/companies/timeseries`, `/console/studio` (the "Growth history" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A snapshot of a company's headcount tells you its size; the *trajectory* tells you whether it's a rising account worth pursuing. Firmographic enrichment already returns the current values — F-022 adds the history behind them: a monthly time-series of the attributes that matter for GTM (headcount, revenue, tech footprint, hiring), with growth rates and trends, so a rep or a scoring model can act on momentum, not just size.

## 2. Goals & Non-Goals
**Goals**
- A **monthly time-series** (default 24 months, 6–36 configurable) for headcount, estimated revenue, technologies detected, and open roles.
- Per attribute: **trailing-12-month growth %**, **average MoM growth %**, and a **trend** (accelerating / growing / flat / declining).
- A headline **momentum** for the company (from its headcount trajectory).
- **Coherence:** the newest point of every series equals what a live company lookup returns — history back-projects from current firmographics.

**Non-Goals (this phase)** — real historical data capture (the series is a deterministic model anchored to current values, not observed snapshots over time); person-level attribute history (that's F-035 historical identity graph); arbitrary custom attributes; per-attribute alerting on a threshold crossing; sub-monthly granularity; a full charting console page (the trajectory renders inline in the Studio; a dashboard is deferred).

## 3. Users & Personas
- **Sales / RevOps (expand):** spots fast-growing accounts (headcount up 30%+ YoY) to prioritize, and stalling ones to deprioritize.
- **Data science / scoring (land):** pulls growth features (`growth_12mo_pct`, `avg_mom_pct`, `trend`) to feed a lead/account score.
- **Investor / market intel (expand):** reads the revenue and headcount trajectory for diligence.
- **RBAC:** inherits the Studio's `admin | developer` gate; billed like a company enrichment (2 credits).

## 4. Differentiation
Ties to **win #1 (enrichment breadth)** and **win #4 (coherent, explainable data)**: the trajectory is anchored to the same firmographics the platform already returns, so history and the current snapshot can never disagree, and it's deterministic (state-aware, never random) — the same domain always charts the same history. Most enrichment APIs return only the current value; a coherent, growth-annotated time-series is a genuine step up.

## 5. Data Model & Logic
Single source of truth: **`lib/company-timeseries-resolver.ts`** (pure, deterministic, no `Math.random`, no wall-clock — the window ends on a fixed reference month).
- `resolveCompanyTimeseries(domain, months=24): CompanyTimeseries | null` — null for personal/unrecognized domains.
- Anchored back-projection: the newest month = the current firmographic value; each earlier month = the next month ÷ a seeded growth factor (mean MoM rate + deterministic wobble), so the series ends exactly at current. Growth character is seeded from company age (younger companies grow faster).
- Revenue tracks headcount (a per-employee revenue derived from the revenue band); tech and open-roles have their own seeded rates. Each `AttributeSeries` carries `points[]` (oldest→newest), `current`, `year_ago`, `growth_12mo_pct`, `avg_mom_pct`, and `trend`.

## 6. State / Integration
- **Gateway:** a normal-pipeline endpoint (`company-timeseries` in `src/data/endpoints.ts`, with an optional `months` param) and a deterministic sandbox case (`src/lib/sandboxAPI.ts`). Feeds docs / Explorer / OpenAPI / Postman / CLI.
- **View-model** (`src/data/enrichments.ts`): a `timeseries` preset, `timeseries?: CompanyTimeseries` on `EnrichmentResult`, `timeseriesToResult`, and a shape-based dispatch (`attributes[]` + `momentum` + `months`).
- **No store slice** — a stateless lookup surfaced in the Studio.

## 7. UI
The Studio "Growth history" preset (icon `LineChart`) renders a `TimeseriesPanel`: a momentum header (badge + the window range), then a card per attribute with the current value, a trailing-12-month growth pill (tone-coded up/down), an average-MoM figure, and an inline sparkline of the monthly series (Sparkline primitive) with the trend. Semantic tokens; Framer Motion; light + dark. The Studio's loading/empty/error/not-found states apply (personal domains → not-found).

## 8. Telemetry
`timeseries_resolved` (domain, months, momentum) via `lib/telemetry.ts`, emitted from the Studio alongside `enrichment_run`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (7-case resolver suite: null on personal, anchored newest=current, revenue tracks headcount, consecutive months ending on the reference month, growth+trend consistency, window clamping, determinism + normalization) · isolated build green · live gateway checks — `stripe.com` → 24 months, headcount 224 → 292 (+30.4% 12mo), momentum growing; `datadoghq.com` → flat; `gmail.com` → NOT_FOUND. Studio panel renders sparklines + growth pills, 0 console errors.

## 10. Deferred
Real captured history (observed snapshots); person-level history (F-035); custom attributes; growth-threshold alerts; a dedicated charting console; sub-monthly granularity; exporting the series as CSV.
