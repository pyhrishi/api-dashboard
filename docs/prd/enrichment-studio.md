# PRD: Enrichment Studio

**Status:** Built (prototype is the spec) · **Roadmap:** consolidates F-001, F-002 + the enrichment lookup family · **Route:** `/console/studio`
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The catalog has ~14 single-input "identifier → enriched record" endpoints, and the roadmap's enrichment areas (Data Enrichment Coverage, Identity Resolution, Data Quality, Search) hold a large share of the 590 features — nearly all the same interaction. Building a bespoke console page per endpoint does not scale. The Enrichment Studio is **one catalog-driven workspace** that renders every lookup, so new endpoints become presets, not pages.

## 2. Goals & Non-Goals
**Goals**
- One workspace for every single-input lookup, selected by **preset** (backed by a real catalog endpoint).
- **Input auto-detection** for the identity preset; per-kind validation for the rest.
- **One generic result renderer** (identity header + field grid + chips + confidence + provenance) that adapts to any endpoint response via a normalizer.
- **One tenant-scoped history** across all lookups.
- Real gateway calls, production billing, and the spine (Logs/Analytics/Billing).
- Backward compatibility: `/console/resolve` and `/console/enrich` redirect to Studio presets.

**Non-Goals (this phase)** — multi-field lookups (e.g. name+company); bulk/CSV (Bulk Jobs); saving results to a CRM; per-preset bespoke layouts beyond the generic renderer.

## 3. Architecture
- **Registry** (`src/data/enrichments.ts`): `PRESET_CONFIG` maps preset → endpoint id + single param + input kind + icon + category + examples. `getEnrichmentPresets()` merges each with its catalog endpoint (name, path, credit cost, placeholder) — the endpoint stays the single source of truth. Orphaned presets (retired endpoint) drop silently.
- **Input model:** `detectInputKind()` (email/domain/phone/linkedin/cin/auto) + `validateInput(kind, value)`.
- **Normalizer:** `toEnrichmentResult(data)` → one `EnrichmentResult` VM. Rich adapters for `person` and `company`; identity-resolve `profile` mapping; a generic flattener for any flat response. One renderer covers all.
- **State:** `EnrichmentRecord` + a single tenant-scoped, persisted `enrichments` slice (cap 100) with `addEnrichment`/`removeEnrichment`/`clearEnrichments`. Replaced the per-feature `resolvedPeople` and `enrichedCompanies` slices (persist version bumped to 3).

## 4. UI & States
Preset picker (pills with credit cost) · adaptive input with examples and live kind-detection · KPI row (enrichments, avg confidence, lookups used of N, credits) · generic result card (identity, fields with verified/masked, tech-stack-style chips, confidence meter + provenance, links, copy JSON/cURL, Explorer/Logs cross-links) · unified history with re-run. States: idle/empty, loading skeleton, ok, not-found, error (retry; 402 → recharge). Framer Motion throughout; RBAC admin+developer.

## 5. API
Each preset calls its endpoint (`GET /v1/people`, `/v1/companies/enrich`, `/v1/people/phone`, `/v1/identity/resolve`, …) with `Authorization: Bearer <active key>`; logged via `logApiRequest`. Deterministic data via `lib/person-resolver.ts` and `lib/company-resolver.ts`.

## 6. Telemetry
`enrichment_run` (preset, endpoint, confidence, environment, durationMs) · `enrichment_failed` (preset, environment, reason) · `upgrade_prompt_shown/clicked` on 402 · `feature_viewed` (per preset) · `first_call_made` on first success.

## 7. Extending it (the payoff)
To add a lookup: add the endpoint to `src/data/endpoints.ts` (already required), then one entry to `PRESET_CONFIG`. If it returns a novel rich shape, add an adapter branch in `toEnrichmentResult`; otherwise the generic flattener renders it. **No new page.**

## 8. Verified
tsc 0 · lint 0 · no `any` · unit (registry + resolvers) + e2e (person + company + redirect) · build green.

## Superseded PRDs
`email-to-person-resolution.md` (F-001) and `domain-to-company-enrichment.md` (F-002) describe the two flagship lookups; both now ship as Studio presets. Their data layers (resolvers, endpoints) are unchanged.

## Changelog
- 2026-09-04 — Consolidated Resolve + Enrich into the Studio; catalog-driven presets, generic renderer, unified history. Shipped as changelog v4.6.
