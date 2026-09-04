# PRD: Domain → Company Enrichment

> **Now a preset in the Enrichment Studio** (see `enrichment-studio.md`). This lookup ships at `/console/studio`; `/console/resolve` and `/console/enrich` redirect there. The data layer described below is unchanged.

**Status:** Built (prototype is the spec) · **Roadmap:** F-002 (Now) · **Route:** `/console/enrich`
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A domain is the atomic B2B identifier. Turning it into a trustworthy company profile — firmographics, headcount, tech stack, funding — powers lead scoring, TAM sizing, routing, and personalization. Competitors return firmographics as an opaque blob with no trust signal. Our developer wants the profile from one call; RevOps needs depth for scoring; Security needs to know how confident each field is and where it came from. Domain → Company Enrichment is the console surface that delivers all three.

## 2. Goals & Non-Goals
**Goals**
- One domain in → a full company dossier out, in the console in seconds.
- **Confidence + per-field provenance** (source + signal) — the operator-grade differentiator.
- Depth beyond name/industry: **tech stack** and **funding** panels; a bridge to the **people** at the company.
- Real gateway (`GET /v1/companies/enrich`), production billing (2 credits), flows into Logs / Analytics / Billing.
- Deterministic: same domain → same dossier, everywhere.
- Tenant-scoped, persisted **history** with re-run.

**Non-Goals (this phase)** — bulk/CSV company enrichment (Bulk Jobs covers that); company-change monitoring/webhooks (linked, not built here); CRM write-back; editing a dossier; real third-party data (synthetic, deterministic).

## 3. Users & Personas
- **Integrating Developer (land):** enters a domain, gets a dossier, copies the snippet, sees the call in Logs; first-call activation fires here.
- **RevOps / Data Leader (expand):** reads industry mix, headcount, revenue band, and credits-used to score and size.
- **Security / Compliance (expand):** confirms confidence + provenance + freshness.
- **RBAC:** admin + developer run enrichments; billing role sees an explainer.

## 4. User Stories & Flows
1. Enter `stripe.com` → the dossier assembles: firmographics grid, tech-stack chips, funding, a 78% confidence meter, and provenance.
2. Click "People at this company" → Explorer's `company-employees`.
3. Re-run a past enrichment from history → identical result.
4. Edge: invalid domain → inline block; freemail domain → flagged personal, lower confidence; out of credits → upgrade prompt.

## 5. Functional Requirements
- Domain input with normalization (strips protocol/www/path) + validation; example chips; Enter-to-run; in-flight lockout.
- Real `fetch('/api/v1/companies/enrich?domain=…')` with `Authorization: Bearer <active key>`; logged via `logApiRequest`.
- Dossier card: identity (logo initials, name, legal name, type, domain, description, socials); firmographics grid (headcount + band, revenue band, founded, HQ, industry + sub-industry, funding stage + raised); tech-stack chips.
- Confidence panel: overall meter + per-field provenance + last-verified + latency.
- Actions: Copy JSON, Copy cURL, People at this company, View in Logs.
- History: tenant + environment scoped, cap 100, re-run/remove, clear-all with confirm.
- States: idle/empty, loading skeleton, enriched, not-found, error (retry; 402 → recharge CTA).

## 6. Data Model
- `EnrichedCompany` (`lib/company-resolver.ts`): id, domain, name, legal_name, description, industry, sub_industry, type, employee_count, employee_band, revenue_band, founded_year, hq_city, hq_country, timezone, tech_stack[], funding_stage, total_raised_usd, linkedin_url, twitter_url?, logo_initials, confidence, is_personal_domain, last_verified, sources[], provenance[] (`{ field, source, signal, confidence }`).
- `CompanyEnrichmentRecord` (`lib/store.ts`): id, domain, company|null, status (`enriched|not_found|error`), environment, confidence, creditCost, requestId, durationMs, timestamp, message?.
- Store slice `enrichedCompanies` in AppState / TenantState / extract / default / partialize; actions `addCompanyEnrichment` (cap 100), `removeCompanyEnrichment`, `clearCompanyEnrichments`.

## 7. API Contracts
- `GET /v1/companies/enrich?domain=<domain>` → `{ success, data: { company: EnrichedCompany, confidence } }`; 2 credits; `x-request-id`.
- Determinism: `resolveCompanyFromDomain(domain)` is pure (FNV-1a + mulberry32; no `Date.now`/`Math.random`). It backs the `company-enrich` and `identity-resolve` (domain) gateway cases, so Explorer, CLI, and this feature agree.
- Errors: 402 (out of credits), 429 (rate limited), non-2xx (error), invalid domain (not found / INVALID_DOMAIN).

## 8. Non-Functional
tsc clean · lint 0 · no `any` · semantic tokens (light + dark) · every state designed · Framer Motion assemble/meter/rows · a11y labels; keyboard accessible.

## 9. Dependencies & Integrations
`lib/api-config.ts`, `src/data/endpoints.ts` (new `company-enrich`), `lib/company-resolver.ts` (new SSOT), the gateway, `lib/telemetry.ts`, `components/ui/*`, `RoleGuard`. Cross-links: Explorer (company-employees), Logs, Billing, API Keys.

## 10. Telemetry
`company_enriched` (domain, industry, employees, confidence, environment, durationMs) · `company_enrichment_failed` (domain, environment, reason) · `upgrade_prompt_shown/clicked` on 402 · `feature_viewed` (auto) · `first_call_made` on first success.

## 11. Success Metrics
Time-to-first-enrichment; enrichment success rate; avg confidence; enrichments/active developer; click-through to People; upgrade-prompt conversion.

## 12. Open Questions
Public `/v1/companies/enrich` naming vs `/v1/companies?domain=`? · Persist full dossiers in history vs re-fetch on re-run? · Add a company-change webhook trigger from here?

## 13. Out of Scope
Bulk/CSV enrichment, change monitoring, CRM write-back, dossier editing, real data vendors.

## Changelog
- 2026-09-04 — Initial build: deterministic resolver, `company-enrich` endpoint, `/console/enrich`, confidence + provenance, tech stack + funding, tenant-scoped history, telemetry, unit + e2e tests. Shipped as changelog v4.5.
