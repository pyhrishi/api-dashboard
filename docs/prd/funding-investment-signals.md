# PRD: Funding & Investment Signals

> **A preset in the Enrichment Studio.** Ships at `/console/studio` as "Funding signals" (`funding` preset), backed by a real endpoint. No separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-009 · **Route:** `/console/studio` (preset `funding`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A company's funding is one of the strongest B2B buying and prioritization signals: a fresh raise means new budget, hiring, and tooling decisions. The company dossier already carries a coarse `funding_stage` and `total_raised`, but sales, VC, and RevOps teams want the *story* — every round with its date, amount, and lead investor, the investor roster, and the latest valuation. Funding & Investment Signals turns a domain into that full history, anchored to the same company graph so it never contradicts the firmographics.

## 2. Goals & Non-Goals
**Goals**
- One domain in → the company's **round-by-round history** (Seed → Series E), each with date, amount, lead investor, participating investors, and post-money valuation.
- The **deduplicated investor roster**, **total raised**, **last round**, and **latest valuation**.
- A clean **no-funding** result for bootstrapped / public-only / acquired / personal-domain companies (a designed empty state, not an error).
- Deterministic and **consistent with firmographics** — the resolved `funding_stage` caps the round ladder; `total_raised` is the sum of the rounds.

**Non-Goals (this phase)** — real-time funding news alerts (a Signals feature); cap-table / ownership breakdown; secondary-market pricing; per-investor portfolios; funding-change webhooks (F-072-style); debt / grant financing.

## 3. Users & Personas
- **Sales / RevOps (expand):** a fresh Series B is a prioritization signal; the investor roster warms an intro path.
- **VC / Corp-dev (expand):** the round and valuation history sizes a company at a glance.
- **Integrating Developer (land):** one call appends the funding timeline to a CRM record.
- **RBAC:** the Studio's `admin | developer` gate; read-only, no mutation.

## 4. Differentiation
**Table-stakes for the category, shipped clean**, with the point of care that funding is **anchored to the company graph**: the same domain's firmographic stage, total raised, rounds, and valuation are one coherent story across the product — never the contradictory numbers you get when funding is a bolted-on dataset.

## 5. Data Model & Logic
Single source of truth: **`lib/funding-resolver.ts`** → `resolveFundingForDomain(domain): FundingProfile | null` (null only when the base company can't resolve).
- Builds on `resolveCompanyFromDomain`: the resolved `funding_stage` maps to the top round on the ladder (Bootstrapped → none; Series A → through A; Series D+/Public → through Series E; Acquired → mid-stage). A seeded RNG (`hash("funding:"+domain)`) fills amounts, investors, dates, and valuations — **no `Math.random`**.
- `FundingProfile`: `has_funding`, `no_funding_reason`, `funding_stage`, `total_raised_usd`, `last_round`, `latest_valuation_usd`, `rounds: FundingRound[]`, `investors`, `investor_count`, `confidence`, `last_verified`, `provenance[]`.
- `FundingRound`: `stage`, `date`, `amount_usd`, `lead_investor`, `investors`, `valuation_usd`.
- Invariants (unit-tested, `src/lib/__tests__/fundingResolver.test.ts`): deterministic per normalized domain; rounds ascend the ladder with increasing dates; `total_raised` equals the sum of rounds; `last_round`/`latest_valuation` consistent; investor roster deduped and always contains each round lead; personal/bootstrapped → no history.

## 6. API & Gateway
- **Endpoint:** `GET /v1/companies/funding` (catalog id `funding-signals`), param `domain`, **2 credits**.
- **Mock:** `src/lib/sandboxAPI.ts` `funding-signals` case returns `{ success, ...FundingProfile }`; an unresolvable domain → `NOT_FOUND`.
- **Masking:** funding data is public/firmographic, returned in full for both sandbox and live keys.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `fundingToResult` branch (keyed on a `rounds` array + `funding_stage`), emitting a structured `funding` section.
- **`FundingPanel`** (in `app/console/studio/page.tsx`): a headline row (total raised · stage · latest valuation), a vertical **round timeline** (stage, date, amount, lead, valuation per rung), and the investor roster as chips. A designed **no-funding** state for bootstrapped/public/personal domains. Renders only when `result.funding` is present.
- **Preset:** "Funding signals" (`TrendingUp`/`Banknote` icon, company category); examples cover a venture-backed company, a public one, and a bootstrapped/personal case. **States:** loading / empty / error (unresolvable) / success. Semantic tokens only; light + dark; Framer Motion timeline.

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No dedicated event.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (6 funding-resolver cases + a view-model dispatch test + suite) · isolated build green · live Studio walkthrough (venture-backed timeline; bootstrapped/personal no-funding state).

## 10. Deferred
Funding-news alerts (Signals); cap table / ownership; secondary-market valuation; per-investor portfolios; funding-change webhooks; debt & grant financing.
