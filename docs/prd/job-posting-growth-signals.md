# PRD: Job-Posting Growth Signals

> Read a company's hiring as a growth signal — open roles, velocity, which teams are expanding — from a single domain.

**Status:** Built (prototype is the spec) · **Roadmap:** F-016 (Later → shipped) · **Studio preset:** `job-signals` · **Source:** `lib/job-signal-resolver.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A company's open roles are one of the earliest, most public signals of momentum — a surge in engineering hiring, the first APAC roles, backfilling after a raise. Sales and RevOps teams use hiring to prioritize accounts, but stitching that together from job boards is manual and stale. They want it as a resolved signal alongside firmographics and intent.

## 2. Goals & Non-Goals
**Goals**
- From a domain, return hiring/growth signals: open-role count, hiring velocity, implied headcount growth, a department breakdown, top roles, locations, seniority mix, and plain-English signals.
- Make it coherent — a recent raise should read as accelerated hiring.

**Non-Goals (this phase)** — scraping live job boards; per-posting detail / apply links; historical hiring trend lines (that's the time-series feature); a bespoke Studio panel.

## 3. Users & Personas
- **Sales / RevOps (land + expand):** prioritizes accounts by hiring momentum and sees which team is growing (who to sell to).
- **Investor / market intel:** growth-tier signal across a portfolio.
- **RBAC:** the Studio is `admin | developer`.

## 4. Differentiation
Hiring signals exist (LinkedIn, job-board aggregators), but they're rarely *resolved and coherent* with the rest of an enrichment record. Our angle is data depth + coherence: the signal reuses the shared company and funding resolvers, so a recently-funded company reads as accelerated hiring, and the growth signal never contradicts the firmographics or funding on the same account. Where a company hires (department breakdown) tells you *who* to sell to, not just *whether* to.

## 5. Data Model & Logic
Single source of truth: **`lib/job-signal-resolver.ts`** — `resolveJobGrowthSignals(domain)`, deterministic (no `Math.random`), on `resolveCompanyFromDomain` + a funding tailwind from `resolveFundingForDomain`.
- Returns `null` for personal / unrecognized domains.
- A per-company growth score (a stable base + a funding boost that scales with total raised) sets hiring velocity; open roles scale from headcount × velocity; the implied headcount-growth rate sets the growth tier.
- Open roles are distributed across departments by industry-weighted shares using a **largest-remainder allocation**, so the parts always sum to the total exactly and the leading team is marked trending up. Top roles, locations (HQ + hubs, weighted to remote), seniority mix, and human-readable signals (fastest-growing team, post-raise acceleration, remote openings) are derived deterministically.
- Invariants (unit-tested, `lib/__tests__/jobSignalResolver.test.ts`, 6 tests): determinism; personal-null; coherent profile; **department breakdown conserves the open-role total** and is sorted; location openings stay within the total; seniority mix ≈ 100%.

## 6. API & Gateway
- `GET /v1/companies/job-signals?domain=…` (catalog entry, 2 credits) → the `JobGrowthSignals` object. Resolved in `src/lib/sandboxAPI.ts` via a `companies-job-signals` case (`NO_SIGNALS` for personal/invalid). No route.ts change.

## 7. UI
- **Enrichment Studio** preset `job-signals` (`BriefcaseBusiness` icon, company category): `jobSignalsToResult` renders a company result — badges (velocity, growth tier, funding context), fields (open roles, implied growth, net-new 90d, fastest-growing team, growth score, departments hiring), and signals as chips. Dispatched on `open_roles` + `hiring_velocity` + `by_department`. Central `enrichment_run` telemetry.

## 8. Telemetry
Central `enrichment_run` (`preset: 'job-signals'`) — the platform pattern for field-based enrichments.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (6 new tests) · live gateway smoke: `stripe.com` → growing / high-growth, 18 open roles, Sales the fastest-growing team, and a funding-coherent signal ("Hiring accelerated after a Series C round", `funding_context: Series C · $148M raised`).

## 10. Deferred
Live job-board sourcing; per-posting detail; historical hiring trend lines (time-series); a bespoke Studio panel (department bar chart); batch resolution.
