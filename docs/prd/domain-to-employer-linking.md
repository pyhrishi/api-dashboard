# PRD: Domain-to-Employer Linking

> Classify any domain and link it to the real employer — rolling a subsidiary or brand domain up to its parent, and honestly flagging free/disposable domains that have no employer.

**Status:** Built (prototype is the spec) · **Roadmap:** F-037 (Later → shipped) · **Studio preset:** `domain-employer` · **Source:** `lib/domain-employer-linker.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Contact and lead data is full of email domains, but a domain isn't always the employer: it might be a free mailbox, a disposable address, a subsidiary or brand domain that belongs to a bigger parent, or a university/government address. Attributing a contact to the wrong company (or inventing one for a gmail address) pollutes accounts and routing. Teams need a reliable classifier that says what a domain *is* and links it to the actual employer.

## 2. Goals & Non-Goals
**Goals**
- Classify a domain/email: corporate, personal ESP, disposable, subsidiary/brand, educational, government, parked.
- Link an employer domain to the employing company, rolling a subsidiary/brand up to its parent employer.
- Be honest — free and disposable domains get no employer and clear guidance.

**Non-Goals (this phase)** — inferring a personal-email contact's employer from external signals (returns guidance to supply a work email); multi-signal probabilistic attribution; per-contact employer confidence beyond the company confidence.

## 3. Users & Personas
- **Data / RevOps (land + expand):** cleans a contact list and attributes each to the right account — the 10-minute win.
- **Deliverability / security:** filters disposable and free domains out of a CRM.
- **RBAC:** the Studio is `admin | developer`.

## 4. Differentiation
Generic domain-to-company lookups don't distinguish a *free mailbox* or a *subsidiary domain* from a primary corporate domain, and many will invent a company for gmail.com. Our angle is **honesty + coherence**: the classifier is explicit about non-employer domains (no guessing), and it rolls a subsidiary/brand domain up to the parent employer via the company hierarchy (Win #1, registry-backed identity), so a contact at a regional entity attributes to the right account.

## 5. Data Model & Logic
Single source of truth: **`lib/domain-employer-linker.ts`** — `linkDomainToEmployer(domain|email)`, deterministic (no `Math.random`), on `resolveCompanyFromDomain` + `resolveCompanyHierarchy` + `detectDisposable`.
- Returns `null` for an unparseable input; otherwise a classification + optional employer link + confidence + signals + guidance.
- Order of classification: disposable → educational/government TLDs → unresolved (parked) → personal mailbox provider → corporate. A corporate domain whose hierarchy role is `subsidiary` links to the ultimate-parent employer (`relationship: 'subsidiary'`); otherwise it links to itself (`primary`).
- Free mailboxes and disposable addresses return `is_employer_domain: false`, `employer: null`, and guidance.
- Invariants (unit-tested, `lib/__tests__/domainEmployerLinker.test.ts`, 7 tests): determinism + email/domain input; null on unparseable; corporate → primary employer; personal-ESP no-employer + guidance; disposable refusal; edu/gov classification; signals + confidence range + type↔employer consistency.

## 6. API & Gateway
- `GET /v1/domains/employer?domain=…` (catalog entry, 1 credit; accepts a domain or an email) → the `DomainEmployerResult`. Resolved in `src/lib/sandboxAPI.ts` via a `domain-employer` case (`INVALID_DOMAIN` for unparseable). No route.ts change.

## 7. UI
- **Enrichment Studio** preset `domain-employer` (`Building2` icon, company category): `domainEmployerToResult` renders a company result — badges (classification, employer/not, relationship), fields (domain, classification, employer, canonical domain, industry, size, guidance), and signals as chips. Dispatched on `domain_type` + `is_employer_domain` + `guidance`. Central `enrichment_run` telemetry.

## 8. Telemetry
Central `enrichment_run` (`preset: 'domain-employer'`) — the platform pattern for field-based enrichments.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (7 new tests) · live gateway smoke: `jane@stripe.com` → subsidiary linked to the parent employer (Stripe Group); `gmail.com` → personal ESP, no employer; `mailinator.com` → disposable, no employer; `mit.edu` → educational.

## 10. Deferred
Personal-email employer inference from external signals; multi-signal probabilistic attribution; alias-domain merging (via company alias resolution); explicit parked/redirect detection; batch classification.
