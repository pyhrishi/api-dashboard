# PRD: Coverage Gap Reporting

> Overlay an account's own enrichment traffic on Zinbit's regional coverage and rank the segments where its requests hit thin data — quantified by wasted credits and addressable uplift, each with a fix and a one-click expansion request.

**Status:** Built (prototype is the spec) · **Roadmap:** F-053 (Later → shipped) · **Page:** `/console/coverage-gaps` · **Source:** `lib/coverage-gaps.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Regional Coverage (F-…, `lib/region-coverage.ts`) answers the *pre-purchase* question — "do you cover my market?" — with a global, static supply map that's identical for everyone. It does not answer the *post-purchase* question every customer actually has: **"where is *my* traffic falling through, and what is it costing me?"** A customer whose book skews APAC-and-phone-heavy experiences Zinbit very differently from a US-email shop, and neither can see it. Misses are invisible — credits get spent on lookups that return nothing, and no one surfaces which segments to fix. Coverage gap reporting makes that personal and actionable.

## 2. Goals & Non-Goals
**Goals**
- Join the account's request distribution (region × data type) against the coverage ceiling and rank the gaps by impact (wasted credits, missed volume).
- Quantify each gap: match rate, missed lookups, wasted credits/mo, and addressable uplift if closed.
- Give each gap a concrete, state-aware recommendation and a one-click **expansion request** (the enterprise control + expansion hook).
- Stay coherent with Regional Coverage — reuse its snapshot as the supply ceiling, never re-hardcode coverage.

**Non-Goals (this phase)** — deriving the demand profile from live per-request logs (uses a deterministic per-account profile); per-country (vs. per-region) gap breakdown; SLA-style trends over time; automated expansion fulfillment; cross-account benchmarking.

## 3. Users & Personas
- **RevOps / Data leader (land):** opens a ranked list of "your APAC phone lookups miss 30%, burning 11.6k credits/mo — enable email-first" — the 10-minute win.
- **Enterprise buyer (expand):** submits an **expansion request** for a costly gap → routes to the data team (a measurable expansion signal).
- **Developers:** `GET /v1/coverage/gaps` to pull the account's ranked gaps + recommendations programmatically.
- **RBAC:** page visible to `admin | developer | billing`; **billing is read-only** — expansion requests are gated in the UI and the store action.
- **Multi-tenant:** the demand profile is seeded by `activeOrganizationId`, so switching orgs yields a different, coherent report.

## 4. Differentiation
No incumbent tells you where *your own spend* is hitting thin data — misses are silently swallowed. Our angle ties to **Win #4 (radical transparency)**: we quantify the miss (volume), the cost (wasted credits), and the opportunity (addressable uplift) per segment, and we recommend a concrete fix that reuses the rest of the platform (email-first fallback, re-verification, firmographic supplement) — turning an honest admission of a coverage gap into an expansion conversation rather than hiding it.

## 5. Data Model & Logic
Single source of truth: **`lib/coverage-gaps.ts`** — deterministic (FNV-1a seeded by org id, no `Math.random`, supply from the shared coverage snapshot).
- `analyzeCoverageGaps(orgId)` builds a per-account **demand profile** (total monthly requests, a home-region-weighted region mix, a data-type mix) and, for each region × data-type segment with real demand (≥200 req), joins it against `getCoverageSnapshot()`: `matched = round(requests × ceiling)`, `missed = requests − matched`, `wastedCredits = missed × creditCost[dataType]`, `addressableContacts = requests × (bestCeiling − ceiling)`. Severity is a function of shortfall × missed volume (critical/high/medium/low). Gaps rank by wasted credits.
- `recommend(...)` is rule-based and state-aware: thin phone → email-first fallback; thin technographic/social → firmographic supplement; developing region / low ceiling → request expansion; otherwise a re-verification pass or "well-covered".
- `summarize` rolls up weighted overall match rate, total missed, total wasted credits, the worst real gap, and total addressable uplift.
- `gapReportForAccount()` powers the gateway (stable demo org).
- **State (Zustand, global slice, persisted):** `coverageExpansionRequests: CoverageExpansionRequest[]` (capped 30) + `requestCoverageExpansion(segmentId, note)` — billing-blocked, audit-logged (`coverage.expansion_requested`), validates the segment exists.
- Invariants (unit-tested, `src/lib/__tests__/coverageGaps.test.ts`, 12 tests): determinism per org; matched+missed=requests; wastedCredits by data-type cost; different orgs differ; ranked by wasted credits; **ceiling equals the shared snapshot's matchRate** (SSOT); thin-supply severity ≥ core-email (which is `low`); summary roll-up + biggestGap; phone-thin → email-first recommendation; gateway report = org_1; expansion-request shape; store slice record/unknown-segment/billing-block.

## 6. API & Gateway
- `GET /v1/coverage/gaps` (catalog entry, 1 credit) → the account's ranked gaps + summary + industry. Resolved in `src/lib/sandboxAPI.ts` via a `coverage-gaps` case. No route.ts change.

## 7. UI
`/console/coverage-gaps` — composed from `components/ui`, semantic tokens only.
- **Header** + a Regional Coverage cross-link; **4 KpiTiles** (your match rate, missed lookups, wasted credits, addressable uplift) + the profiled industry.
- **Filters:** region `SegmentedControl` (All/NAMER/EMEA/APAC/LATAM) + a "Gaps only / All segments" toggle.
- **Gap cards:** region + data-type (icon), severity badge, requests, an animated **matched-vs-missed bar** (the missed slice tinted by severity), matched/missed/wasted-credit figures, the recommendation, and a **Request expansion** action (→ "Requested" once submitted).
- **Expansion requests** list; cross-links to Match Rate / Regional Coverage / Billing.
- **Expansion modal:** segment context + a note textarea + submit.
- **States:** loading skeleton mirroring the layout; a designed empty state ("no material gaps — switch to all segments"); billing read-only; toast on submit. Framer Motion on card enter/exit and bar fills.

## 8. Telemetry
`coverage_gaps_viewed` (view), `coverage_gaps_filtered {region}` (filter), `coverage_expansion_requested {region, dataType, severity}` (submit) — via `lib/telemetry.ts`. **PLG hook:** the expansion request is a measurable expansion signal into more coverage/credits.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (12 new tests) · `next build` green · Playwright smoke (`e2e/coverage-gaps.spec.ts`: report renders, filter narrows, expansion request submits) · live gateway smoke: `GET /v1/coverage/gaps` → ranked gaps with APAC/LATAM phone as the top criticals.

## 10. Deferred
Demand profile from live request logs; per-country gap breakdown; gap trend over time; expansion-request fulfillment lifecycle beyond submitted/acknowledged; cross-account (anonymized) benchmarking of coverage; export.
