# PRD: Multi-Region Coverage

> A dataset-coverage transparency surface: the `/console/regions` "Regional Coverage" dashboard, reading one deterministic source (`lib/region-coverage.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-018 (Next → shipped) · **Page:** `/console/regions` · **Source:** `lib/region-coverage.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment coverage is never uniform across the world, but buyers evaluating a data vendor need to know — *before they commit* — whether their market is covered. The existing Match Rate page (`/console/coverage`, F-029) reports the honesty of the customer's *own* traffic; it says nothing about the shape of the dataset itself. Multi-region coverage fills that gap: an honest map of where Zinbit is deep (North America) and where it's developing (LATAM), per region, per data type, and per country.

## 2. Goals & Non-Goals
**Goals**
- A Regional Coverage dashboard showing coverage % and match rate across NAMER, EMEA, APAC, LATAM — by data type (email, direct phone, firmographics, technographics, social) and by top country.
- Surface dataset size (contacts/companies), median freshness, a maturity tier, and honest thin-coverage notes per region.
- A region × data-type coverage matrix (heat-mapped) plus a per-region detail view.
- Deterministic and stable — the same region always reports the same figures.

**Non-Goals (this phase)** — a `GET /v1/coverage/regions` API endpoint (deferred — the model is endpoint-ready); a live map/choropleth render; per-industry coverage (that's F-053 Coverage gap reporting); a pre-purchase per-entity "is this in the dataset" check (that's F-220 Coverage lookup); coverage computed from real customer traffic (that's the Match Rate page).

## 3. Users & Personas
- **Evaluating buyer / enterprise (expand):** answers "do you cover my market?" before signing — reads the matrix and the per-country match rates.
- **RevOps / territory planning:** uses per-region freshness and phone coverage to set expectations by geography.
- **Developer (land):** sees which attributes are reliable where, so pipelines can degrade gracefully (email-first in LATAM).
- **RBAC:** `admin | developer | billing` — coverage transparency is visible to the whole workspace.

## 4. Differentiation
Most vendors publish a single headline "X billion records" and hide the distribution. The differentiated angle is **honesty as a feature**: an explicit heat-mapped matrix that admits where coverage is thin, with named gaps ("direct dials thin outside Brazil & Mexico"), tied to the six-wins "operator-grade transparency" theme. Coverage is contact-weighted so the global number can't be gamed by a small, dense region, and it links straight to the Studio to prove the claim with a live lookup.

## 5. Data Model & Logic
Single source of truth: **`lib/region-coverage.ts`** → `getCoverageSnapshot(): CoverageSnapshot`.
- Four regions (NAMER core, EMEA/APAC strong, LATAM developing), each from a curated realistic base: contacts, companies, freshness, per-data-type coverage, and top countries with their own contact share + match rate.
- Per data-type match rate tracks coverage (discounted, with a stable FNV-1a per-cell jitter) — **no `Math.random`, no wall-clock read**. Region overall match rate = mean of its per-type rates; global rollups (match rate, per-type coverage) are **contact-weighted**; countries are summed; strongest/developing regions are derived, not hardcoded.
- `coverageBand()` maps a value to high/good/fair/low for consistent heat coloring across the UI.
- Invariants (unit-tested, `src/lib/__tests__/regionCoverage.test.ts`, 5 tests): deterministic; four canonical regions with coherent per-type data; totals reconcile with the region rollup; NAMER strongest / LATAM developing; five banded global data types.

## 6. API & Gateway
None this phase — the dashboard renders entirely from the deterministic module (no credits, no gateway call). The model is deliberately shaped to back a future `GET /v1/coverage/regions` without change.

## 7. UI
- **`/console/regions`** (`app/console/regions/page.tsx`, client component, `RoleGuard`):
  - **KPI row:** total contacts, companies, countries covered, global match rate.
  - **Coverage matrix:** regions × data types, each cell heat-colored by band with a coverage-and-match-rate tooltip; a legend maps bands to thresholds; region rows are clickable to focus.
  - **Region detail:** a `SegmentedControl` selects a region; a per-data-type bar list, coverage notes, top-countries panel (with match-rate bars and freshness), and a Studio cross-link.
  - **Methodology** note explaining coverage vs. match rate and the contact-weighting.
- Semantic tokens only; Framer Motion on bars, rows, and region switches. **States:** a loading skeleton, a guarded empty state, and the populated ready state — no layout shift.
- **Nav:** a role-filtered "Regional Coverage" entry (Globe icon) in `app/console/layout.tsx`, right after Match Rate.

## 8. Telemetry
Typed events (`lib/telemetry.ts`): **`region_coverage_viewed`** (`{ regions, contacts }`) on mount and **`region_selected`** (`{ region }`) when a region is focused — so coverage-page engagement and which markets buyers probe land in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (5 new tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green (`/console/regions` route emitted). Browser walkthrough: matrix renders, region switch updates the detail + top countries, empty/loading states verified.

## 10. Deferred
A `GET /v1/coverage/regions` endpoint; a live map/choropleth; per-industry coverage (F-053); a per-entity coverage lookup (F-220); traffic-derived regional coverage; historical coverage trends.
