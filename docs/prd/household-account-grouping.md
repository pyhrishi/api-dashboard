# PRD: Household & Account Grouping

> Turn a messy contact list into clean buying accounts — clustered by company, rolled up to the corporate family, with the buying committee surfaced.

**Status:** Built (prototype is the spec) · **Roadmap:** F-032 (Later → shipped) · **Page:** `/console/accounts` · **Source:** `lib/account-grouping.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A lead list is a pile of individual contacts, but sales works *accounts*. Teams manually stitch contacts into companies, miss that a subsidiary belongs to a parent account, and can't see whether they have a whole buying committee or one lonely champion. They need the list organized into accounts automatically.

## 2. Goals & Non-Goals
**Goals**
- Cluster a list of emails/domains into buying accounts by company.
- Roll subsidiaries up to their parent account (corporate-family aware).
- Surface the buying committee present in each account.
- Set aside personal/unrecognized inputs honestly.

**Non-Goals (this phase)** — CRM write-back; fuzzy person-level dedupe within an account (that's identity resolution); household (consumer) grouping by physical address; a persisted account model.

## 3. Users & Personas
- **Sales / RevOps (land + expand):** pastes a list and gets accounts with their committee — the 10-minute win.
- **Marketing ops:** de-anonymizes a domain list into named accounts for ABM.
- **RBAC:** the console is `admin | developer | billing`.

## 4. Differentiation
Most enrichment tools resolve a single contact; grouping a *list* into accounts — and being **corporate-family aware** so a subsidiary attributes to the parent — is the account-based move (Win #1, registry-backed identity + coherence with the hierarchy). Surfacing the buying committee from the roles present turns a contact list into a sales-ready account map, and personal/invalid inputs are called out rather than silently dropped.

## 5. Data Model & Logic
Single source of truth: **`lib/account-grouping.ts`** — `groupIntoAccounts(contacts[])`, deterministic (no `Math.random`).
- Each input is parsed to a domain (email → domain, or a bare domain). Personal mailboxes, unrecognized domains, and non-domain strings go to `ungrouped` with a reason.
- Contacts are clustered by normalized company domain. Each account is enriched via `resolveCompanyFromDomain` (name, industry, HQ, size) and `resolveCompanyHierarchy` (corporate-family context: ultimate parent, relationship, family size).
- A member's name is derived from the email local-part; a role hint is matched from role-ish local-parts (ceo, sales, legal, procurement, …). The `buying_committee` is the distinct set of identified roles.
- Accounts are sorted by member count; the result reports totals and the largest account.
- Invariants (unit-tested, `lib/__tests__/accountGrouping.test.ts`, 7 tests): determinism; same-domain clustering; distinct-company separation; personal/malformed → ungrouped with reasons; buying-committee inference; corporate-family context on each account; bare-domain + de-dupe + size sort.

## 6. API & Gateway
- `POST /v1/accounts/group` (catalog entry, 2 credits) — body `contacts` (an array, or a newline/comma-delimited string). Resolved in `src/lib/sandboxAPI.ts` via an `accounts-group` case (`INVALID_PARAMETERS` for an empty list). Normal pipeline — no route.ts change.

## 7. UI
- **`/console/accounts`** (`app/console/accounts/page.tsx`, `RoleGuard admin|developer|billing`): a contacts textarea → `POST /v1/accounts/group`; KPIs (accounts, grouped, set aside, largest); account cards (company, HQ, size, corporate-family rollup line, buying-committee chips, member list with role hints); a "set aside" section with reasons; a family-rollup explainer cross-linking Company Hierarchy. States: idle, loading skeletons, error (retry), populated. Semantic tokens, Framer Motion.
- **Nav:** "Account Grouping" (Users icon) beside Company Hierarchy.

## 8. Telemetry
`accounts_viewed` (on view), `accounts_grouped` (inputs, accounts, ungrouped count). Registered in `lib/telemetry.ts` (accounts group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (7 new tests) · live gateway smoke: 5 contacts → 2 accounts (Stripe 3 contacts with an Executive+Sales committee and a subsidiary family rollup; Datadog 1) + 1 set aside (gmail).

## 10. Deferred
CRM write-back; person-level dedupe within an account; consumer household grouping; a persisted account entity; confidence per grouping; merging accounts across alias domains.
