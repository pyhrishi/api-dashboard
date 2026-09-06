# PRD: Ecommerce Merchant Enrichment

> Detect whether a company runs an online store, and enrich it — platform, GMV band, product categories, and commerce stack — from a single domain.

**Status:** Built (prototype is the spec) · **Roadmap:** F-017 (Later → shipped) · **Studio preset:** `merchant` · **Source:** `lib/ecommerce-merchant-resolver.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
For agencies, payment providers, and ecommerce-tooling vendors, the first qualifying question about an account is "are they a merchant, on what platform, and how big?" That's a distinct enrichment from generic firmographics — it's platform, GMV, catalog, categories, and commerce stack. There's no single call that returns it, and tools that guess often invent store data for companies that aren't merchants at all.

## 2. Goals & Non-Goals
**Goals**
- From a domain, detect merchant status and enrich the store: platform, business model, GMV / revenue bands, product-count band, categories, AOV, payments, shipping regions, currencies, storefront tech, traffic band.
- Be honest about non-merchants — return `is_merchant: false` with an explanation, not fabricated store data.

**Non-Goals (this phase)** — live storefront crawling / real GMV; per-product data; conversion or ad-spend estimates; a bespoke Studio panel.

## 3. Users & Personas
- **Ecommerce-tooling / payments sales (land + expand):** qualifies and sizes merchant accounts by platform and GMV — the 10-minute win.
- **Agencies:** filters a domain list to real stores on a target platform.
- **RBAC:** the Studio is `admin | developer`.

## 4. Differentiation
Generic firmographics don't answer commerce-specific questions, and merchant-intelligence tools are a separate, pricey purchase. Our angle is data depth + **honesty**: merchant likelihood is weighted by the company's real (resolved) industry, and a non-store comes back `is_merchant: false` with a reason instead of invented GMV — a trust signal for a category where fabricated store data is common. Built on the shared company resolver, so the merchant profile agrees with a direct lookup.

## 5. Data Model & Logic
Single source of truth: **`lib/ecommerce-merchant-resolver.ts`** — `enrichMerchant(domain)`, deterministic (no `Math.random`), on `resolveCompanyFromDomain`.
- Returns `null` for personal / unrecognized domains.
- `merchantLikelihood(industry)` tracks the resolved industry closely (retail/ecommerce ≈ 0.97; software/finance/media ≈ 0.03), so detection is sensible and stable; the hash decides the coin-flip within that likelihood.
- Non-merchants get an explicit empty profile (`platform: 'n/a'`, `categories: []`, a "no storefront detected" signal).
- Merchants get GMV scaled from headcount (→ GMV / monthly-revenue bands), a product-count band, AOV, a platform (payment providers align — Shopify → Shopify Payments), business model, categories, shipping regions, currencies (always includes USD, de-duplicated), storefront tech, a monthly-visits band, and signals.
- Invariants (unit-tested, `lib/__tests__/ecommerceMerchantResolver.test.ts`, 5 tests): determinism; personal-null; non-merchants get an honest empty profile; merchants get a coherent profile (platform set, ≥1 category/payment, USD present, no dup payments/currencies); at least one merchant resolves in a representative sample.

## 6. API & Gateway
- `GET /v1/companies/merchant?domain=…` (catalog entry, 2 credits) → the `MerchantEnrichment` object. Resolved in `src/lib/sandboxAPI.ts` via a `companies-merchant` case (`NO_PROFILE` for personal/invalid). No route.ts change.

## 7. UI
- **Enrichment Studio** preset `merchant` (`Store` icon, company category): `merchantToResult` renders a company result — for a merchant, badges (Merchant, platform, model, GMV) + fields (platform, model, GMV / revenue, products, AOV, visits, payments, ships-to, storefront tech) + categories as chips; for a non-merchant, a compact "no storefront detected" card. Dispatched on `is_merchant` + `platform` + `merchant_confidence`. Central `enrichment_run` telemetry.

## 8. Telemetry
Central `enrichment_run` (`preset: 'merchant'`) — the platform pattern for field-based enrichments.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (5 new tests) · live gateway smoke: `allbirds.com` / `chewy.com` → merchants (platform + GMV band + categories); `stripe.com` → `is_merchant: false` with no fabricated store data.

## 10. Deferred
Live storefront detection / real GMV; per-product catalog; conversion & ad-spend estimates; a bespoke Studio panel (platform badge + category treemap); batch merchant scoring.
