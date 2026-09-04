# PRD: Email → Person Resolution

> **Now a preset in the Enrichment Studio** (see `enrichment-studio.md`). This lookup ships at `/console/studio`; `/console/resolve` and `/console/enrich` redirect there. The data layer described below is unchanged.

**Status:** Built (prototype is the spec) · **Roadmap:** F-001 (Now) · **Route:** `/console/resolve`
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Turning a raw work email into a trustworthy person profile is the flagship job-to-be-done of a data-enrichment platform. Competitors return an opaque blob and leave the buyer guessing whether to trust it. Our Integrating Developer wants a correct, enriched record from one call in under ten minutes; the RevOps/Data Leader and Security reviewer who inherit it need to know *how confident* the result is, *where each field came from*, and that PII is handled correctly in production. Email → Person Resolution is the console surface that delivers both.

## 2. Goals & Non-Goals
**Goals**
- One email in → a full, verified person profile out, rendered in the console in seconds.
- Show a **confidence score** and **per-field provenance** (source + match signal) — our operator-grade differentiator.
- Run against the **real gateway** (`GET /v1/people`), bill like production (1 credit), and flow into Logs / Analytics / Billing.
- Deterministic results: the same email always resolves to the same person, everywhere.
- Tenant-scoped, persisted resolution **history** with re-run.
- Enterprise parity: **live keys mask PII**, sandbox returns full data.

**Non-Goals (this phase)** — bulk/CSV resolution (that is Bulk Enrichment Jobs); writing results back to a CRM; editing/curating a resolved profile; a public `/v1/resolve` alias (uses the existing `/v1/people`); real third-party data sources (synthetic, deterministic mock).

## 3. Users & Personas
- **Integrating Developer (land):** pastes an email, gets a profile, copies the cURL/JSON, sees the call in Logs. First-call activation fires here.
- **RevOps / Data Leader (expand):** reads the confidence + credits-used KPIs to gauge ROI and spend.
- **Security / Compliance (expand):** confirms live PII masking and per-field provenance before approving.
- **RBAC:** admin + developer can run resolutions (consumes credits/keys); billing role sees an explainer instead.

## 4. User Stories & Flows
1. *As a developer* I enter `jane.doe@acme.com`, click Resolve, and watch the profile assemble field-by-field with a 94% confidence meter and a provenance list.
2. *As a developer* I re-run a past resolution from history and get the identical result.
3. *As RevOps* I glance at "Avg confidence" and "Credits used" across the tenant.
4. *As Security* I switch to Live and see email/phone masked with a lock affordance.
5. *Edge:* out of credits → a dismissible upgrade prompt to Billing; invalid email → inline block; no match → a distinct empty state.

## 5. Functional Requirements
- Email input with validation, example chips, Enter-to-run, and an in-flight lockout.
- Real `fetch('/api/v1/people?email=…')` with `Authorization: Bearer <active key>` via `lib/api-config`; response logged via `logApiRequest`.
- Profile card: identity (name, seniority, title, department), verified contacts (email/phone with verified badges; masked in live), socials (LinkedIn/GitHub/X), company + domain, location + timezone.
- Confidence panel: overall score meter + per-field provenance (source, signal, confidence) + last-verified date + latency.
- Actions: Copy JSON, Copy cURL, Open in Explorer, View in Logs.
- History: tenant + environment scoped, capped at 100, newest first, re-run and remove, clear-all with confirm.
- States: idle/empty, loading (skeleton matching layout), resolved, not-found, error (with retry and, for 402, a recharge CTA).

## 6. Data Model
- `ResolvedPerson` (`lib/person-resolver.ts`): id, email, email_verified, first/last/full name, title, seniority, department, company, company_domain, phone, phone_verified, location, timezone, linkedin_url, github_url?, twitter_url?, confidence, is_personal_email, last_verified, sources[], provenance[] (`{ field, source, signal, confidence }`).
- `ResolutionRecord` (`lib/store.ts`): id, email, person|null, status (`resolved|not_found|error`), environment, confidence, creditCost, requestId, durationMs, timestamp, message?.
- Store slice `resolvedPeople: ResolutionRecord[]` in AppState / TenantState / extract / default / partialize; actions `addResolution` (cap 100), `removeResolution`, `clearResolutions`.

## 7. API Contracts
- `GET /v1/people?email=<email>` → `{ success, data: { person: ResolvedPerson, confidence } }`; 1 credit; `x-request-id` header. Live keys are masked by the gateway privacy layer; sandbox is full.
- Determinism: `resolvePersonFromEmail(email)` is pure (FNV-1a seed + mulberry32) — no `Date.now`, no `Math.random`. It backs the `people-search` and `identity-resolve` gateway cases, so Explorer, CLI, and this feature agree.
- Errors: 402 (out of credits), 429 (rate limited), non-2xx (error), 2xx without a person (not found).

## 8. Non-Functional
- tsc clean · lint 0 · no `any` · semantic tokens only (light + dark) · every state designed · Framer Motion on assemble/meter/rows · keyboard accessible · a11y labels on inputs and icon buttons.

## 9. Dependencies & Integrations
- `lib/api-config.ts` (identity), `src/data/endpoints.ts` (`people-search`), `lib/person-resolver.ts` (new SSOT), the gateway pipeline, `lib/telemetry.ts`, `components/ui/*`, `RoleGuard`.
- Cross-links: Explorer, Logs, Billing, API Keys.

## 10. Telemetry
- `person_resolved` (domain, confidence, environment, durationMs, personal) · `person_resolution_failed` (domain, environment, reason) · `upgrade_prompt_shown/clicked` on 402 · `feature_viewed` (auto) · fires `first_call_made` on first success (activation).

## 11. Success Metrics
- Time-to-first-resolution; resolve success rate; avg confidence; resolutions/active developer; % sessions that hit the upgrade prompt and convert.

## 12. Open Questions
- Should a public `/v1/resolve` alias exist, or keep `/v1/people`? · Persist full profiles in history vs. re-fetch on re-run? · Surface a batch entry point from here into Bulk Jobs?

## 13. Out of Scope
Bulk/CSV resolution, CRM write-back, profile editing, real data vendors.

## Changelog
- 2026-09-04 — Initial build: deterministic resolver, `/console/resolve`, confidence + provenance UI, tenant-scoped history, live masking, telemetry, unit + e2e tests. Shipped as changelog v4.4.
