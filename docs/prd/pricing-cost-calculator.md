# PRD: Pricing & Cost Calculator

| | |
|---|---|
| **Status** | Built (prototype) · reverse-engineered |
| **Owner** | Product (Zintlr) |
| **Last updated** | 2026-09-08 |
| **Prototype route(s)** | `/console/pricing` · cross-linked from `/console/billing` |
| **Source artifacts** | `lib/pricing.ts` (SSOT), `lib/pricing-calc.ts` (scenario store), `app/console/pricing/page.tsx`, `app/console/billing/page.tsx` (consumes SSOT), `src/lib/gateway/billing.ts` (consumes SSOT), `lib/telemetry.ts`, `lib/__tests__/pricing.test.ts`, `e2e/pricing.spec.ts` |
| **Roadmap** | Pricing & Cost Calculator (Land/Monetize block) |

## 1. Context & Problem

Developers hate opaque pricing and buyers hate surprise overages — cost transparency is one of Zinbit's six competitive wins ("radical usage transparency: credit cost per call, live billing headers, per-endpoint cost, forecasts and budgets"). Yet a prospect or RevOps owner could not answer the first question they ask: *what will this actually cost me each month?*

Worse, pricing was **fragmented across three places that disagreed**: the marketing slider (`components/PricingSliderModal.tsx`, `$19/10k` + 10/15/25% tiers), the gateway's volume discount (`src/lib/gateway/billing.ts`, 10/25/50% at 20k/100k/500k), and the console billing page (hardcoded `$99 / $499 / $2,999` tiers). Three answers to one question breaks the "one believable product" bar.

## 2. Goals & Non-Goals

**Goals**
- A developer models a real call-mix and sees the **exact** monthly cost — the same number the gateway bills (the seam is closed).
- One pricing **source of truth** (`lib/pricing.ts`) that the billing page and the gateway both import, so the numbers can never drift.
- The economic buyer gets the enterprise controls: cheapest-plan recommendation with savings, overage projection (hard cap vs soft), and a 12-month spend forecast.
- State-aware: pre-fill the mix from the account's real recent usage; never a blank screen.

**Non-goals**
- Changing what anything costs — the tiers and discount bands are exactly today's numbers, now centralized; the gateway's billing behavior is byte-for-byte preserved.
- Rewiring the marketing slider (`PricingSliderModal`) — it keeps its gamified marketing numbers; the console + gateway are the reconciled surface.
- Real invoicing/payment — "Apply … in Billing" hands off to the existing billing flow.

## 3. Users & Personas

- **Integrating Developer** (land) — "what will this cost before I ship?" Picks endpoints, sees $/call and monthly total.
- **RevOps / Data Leader** (expand, economic buyer) — cheapest plan for the mix, overage risk, forecast; exports the case to Billing.
- RBAC: the page is `admin | developer | billing` (read-only estimator; no gated mutations).

## 4. User Stories & Flows

1. As a developer I open the calculator and it is pre-filled from my recent live call-mix (projected to a representative month), labelled "Projected from your usage".
2. As a developer I add endpoints from the live catalogue (grouped People / Company / Identity), set calls/month per line, and watch credits, effective $/call and the monthly total update live.
3. As a buyer I see the volume-discount band I've reached and how many more credits unlock the next band.
4. As a buyer I compare this exact mix priced on all three plans, with a "Best fit" badge and the savings vs my current selection.
5. As a buyer I switch between monthly and yearly (two months free) and between soft overage and a hard cap; a hard cap that would refuse calls (402) is warned, never silently mis-priced.
6. As a buyer I set a monthly growth rate and read the projected spend at months 3 / 6 / 12 with a sparkline that re-prices as volume crosses discount and plan boundaries.
7. As a buyer I click "Apply <tier> in Billing" to act on the recommendation.

## 5. Functional Requirements

- **FR-1 Pricing SSOT (`lib/pricing.ts`).** `PRICING_TIERS` (Starter 10k/$99, Growth 100k/$499, Enterprise 5M/$2,999), `YEARLY_MONTHS_FREE = 2`, `OVERAGE_MULTIPLIER = 1.3`, `VOLUME_BANDS` (0 / 10% >20k / 25% >100k / 50% >500k). Pure, deterministic, no `Math.random`.
- **FR-2 Gateway parity.** `estimateCost` charges each call `Math.max(1, Math.ceil(baseCredits * (1 − discount)))` — identical to the gateway. `src/lib/gateway/billing.ts` `calculateVolumeDiscount` imports `volumeDiscountPct` + `discountedCallCredits` from the SSOT; behavior is unchanged (verified by the full suite).
- **FR-3 Estimate.** For a mix + tier + cycle + overage mode: raw credits, effective credits (post-discount), volume-discount %, included credits, overage credits, plan cost (monthly-equivalent), overage cost (soft only), total monthly, blended $/call, per-line breakdown. `blocked = true` when a hard cap is exceeded.
- **FR-4 Recommendation.** `recommendTier` prices the mix on every tier and returns the cheapest **unblocked** tier (falling back to cheapest overall only if all are blocked), plus the per-tier totals for the comparison card.
- **FR-5 Forecast.** `forecast` projects `months` (default 12) at a monthly growth rate, re-pricing each month so crossing a band or plan boundary is visible.
- **FR-6 Usage pre-fill.** On first view (until the user edits), derive a mix from the account's live `apiLogs`: count calls per path, map path → endpoint id (exact then prefix), keep those with a credit cost, project the busiest endpoint to ≈50k/mo and the rest proportionally (top 8). A manual "Prefill from my usage" repeats it; disabled when there is no live usage.
- **FR-7 Scenario persistence.** `lib/pricing-calc.ts` (dedicated persisted store, own localStorage key `zinbit-pricing-calc`) holds line items, tier, cycle, overage mode, growth %, and a `customized` flag so a pre-fill is never overwritten after the user edits.
- **FR-8 Billing coherence.** `app/console/billing/page.tsx` derives its tier cards from `PRICING_TIERS` and links to the calculator ("Model your exact cost").

## 6. UI / States

Composed from `components/ui` (PageHeader, GlassCard, KpiTile, SegmentedControl, EmptyState, Skeleton, Button, Sparkline); semantic tokens only; Framer Motion for line add/remove, the recommendation banner, and the discount-progress bar.

- **Loading** — skeletons matching the KPI row + panels while the persisted store rehydrates (guards against a hydration mismatch).
- **Empty** — no mix: a designed `EmptyState` with "Load a sample mix".
- **Populated** — KPI row, recommendation/savings banner, call-mix builder with per-line credits/cost and a volume-discount progress bar, plan panel with cost breakdown, plan-comparison card, forecast.
- **Edge** — hard cap exceeded: a `semantic-error` warning ("calls would be refused (402)") and an "Over cap" badge; the estimate stays honest ($0 overage billed, not a wrong number).

## 7. Telemetry

`pricing_calculator_viewed`, `pricing_mix_edited`, `pricing_prefilled_from_usage`, `pricing_tier_compared`, `pricing_cycle_changed`, `pricing_forecast_run`, `pricing_plan_applied` (all typed in `lib/telemetry.ts`).

## 8. PLG hook

When the modeled mix exceeds the current plan or a cheaper plan fits, an honest, dismissible recommendation nudges to the right tier with the savings named — an expansion moment that routes to Billing. Never a dark pattern: it also tells you when you're already on the best plan.

## 9. Verification

`npx tsc --noEmit` clean · `next lint` 0/0 · `lib/__tests__/pricing.test.ts` (17 cases: tiers, bands, gateway-parity rounding, estimate, overage hard/soft, recommendation, forecast, formatting) green as part of the full suite · `e2e/pricing.spec.ts` (empty → sample → recommendation; hard-cap warning) · live walkthrough of empty / populated / recommendation / forecast / hard-cap with 0 console errors.

## 10. Deferred / Production notes

- The marketing `PricingSliderModal` still carries its own gamified numbers and hardcoded hex colors; a follow-up could point it at `lib/pricing.ts` and semantic tokens.
- Overage pricing (`OVERAGE_MULTIPLIER`) and the yearly discount (`YEARLY_MONTHS_FREE`) are product conventions encoded in the SSOT; finance owns the final numbers.
- Usage pre-fill projects from the last ~200 live logs the console retains; production would read a real usage aggregate.
