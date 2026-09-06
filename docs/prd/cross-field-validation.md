# PRD: Cross-Field Validation

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Validate a record" preset.

**Status:** Built (prototype is the spec) · **Roadmap:** F-047 (Now) · **Route:** `/console/studio` (preset `record-validate`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A record can pass every single-field check and still be wrong *as a whole*: a title that says "VP" on a record whose seniority says "Junior," an email whose domain doesn't match its company, a phone registered on a different continent than the HQ. These impossible or improbable *combinations* are what corrupt lead routing and scoring, and single-field validation never catches them. Cross-Field Validation runs consistency rules across a resolved record and returns a decisive integrity verdict with the reason for each check.

## 2. Goals & Non-Goals
**Goals**
- One email in → a cross-field consistency report: **email ↔ company domain**, **title ↔ seniority**, **phone ↔ HQ geography**, **name ↔ email local-part**.
- A **0-100 integrity score**, a decisive **consistent / minor-issues / inconsistent** verdict, and a **per-rule breakdown** (pass/warn/fail + the specific reason).
- Deterministic; reuses `GET /v1/records/validate` (1 credit), the generic `enrichments` slice, and the Studio renderer — no new page, nav, or store slice.
- Reuses the person, company, phone, and title resolvers so every rule reflects the **real resolved record** — this is genuine cross-checking, not a static pass.

**Non-Goals (this phase)** — validating a user-supplied JSON record (input is an email that resolves the record); configurable/custom rules; auto-correction; bulk validation (that is Bulk Jobs); blocking the gateway response on a fail.

## 3. Users & Personas
- **Integrating Developer (land):** gates enrichment output on internal consistency before writing it to their system.
- **RevOps / Data Leader (expand):** trusts routing/scoring only on records that pass cross-field checks.
- **Security / Compliance (expand):** the per-rule reasons make data-quality decisions auditable.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Tied to win #5 (operator-grade): most vendors validate fields in isolation; this validates the *relationships between* fields and explains each verdict. The ladder-distance title↔seniority rule (0 = pass, 1 rung = warn, 2+ = fail) is exactly the "impossible combination" the register calls out.

## 5. Data Model & Logic
Single source of truth: **`lib/record-validator.ts`** → `validateRecord(email): RecordValidation | null`.
- Resolves the person, then cross-checks against the company, phone, and title resolvers. Deterministic — **no `Math.random`**.
- `RecordValidation`: `email`, `subject`, `verdict`, `integrity_score`, `consistent`, `rules[]` (`{rule, label, status, detail}`), `confidence`, `last_verified`, `provenance[]`.
- Rules: email↔company (personal ⇒ warn, mismatch ⇒ fail); title↔seniority by ladder distance; phone-country (ISO) mapped to name and compared to HQ country (mismatch ⇒ warn); name↔email local-part. Score = weighted mean (pass 1 / warn 0.6 / fail 0). Verdict = any fail ⇒ inconsistent, any warn ⇒ minor-issues, else consistent.
- Invariants (unit-tested in `src/lib/__tests__/recordValidator.test.ts`): deterministic; null when no person resolves; valid statuses/ranges; verdict and `consistent` track rule outcomes; corporate domain-matched email passes email↔company.

## 6. API & Gateway
- **Endpoint:** `GET /v1/records/validate` (catalog id `record-validate`, `src/data/endpoints.ts`), param `email`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `record-validate` case returns `{ success, ...RecordValidation }`; no resolvable person returns `INVALID_PARAMETERS`.

## 7. UI
- **Surface:** `buildEnrichmentResult` gains a `validationToResult` branch, selected when the response carries a `rules` array + numeric `integrity_score` (distinct from deliverability's `checks`/`score` and domain-auth's `spoofable`/`dmarc`).
- **Result card** (Studio `ResultCard`, `kind: 'person'`): title = subject; badges = verdict + No-conflicts/Conflicts-found; a leading Verdict field then one field per rule (`✓/!/✕ STATUS — reason`, green check on pass); right rail = confidence + provenance. Per-field freshness chips (F-040) apply automatically.
- **Preset:** "Validate a record" (`BadgeCheck` icon, person category). **States:** loading, empty (preset prompt), invalid (`INVALID_PARAMETERS`), success (the card).

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (6 new tests + existing suites) · Playwright smoke: Studio "Validate a record" scores `jane.doe@acme.com` 100/100 Consistent with all four rules passing and their reasons.

## 10. Deferred
User-supplied record input; configurable rules; auto-correction; bulk validation; a gateway-level reject mode.
