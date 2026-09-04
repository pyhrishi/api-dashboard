<!-- Copy this into docs/prd/<area>-<feature>.md and fill it in. Keep every section (use "N/A" if truly not applicable). -->

# PRD: <Feature Name>

| | |
|---|---|
| **Status** | Draft · In Review · Approved · In Build |
| **Owner** | <name> |
| **Last updated** | <YYYY-MM-DD> |
| **Prototype route(s)** | `/console/<area>`, `/api/v1/<...>` |
| **Source artifacts** | `app/console/<area>/page.tsx`, `lib/store.ts` (<slice>), `src/lib/gateway/<module>.ts` |

## 1. Context & Problem
What need does this address, who is asking, and what happens if we don't build it. 2–4 sentences.

## 2. Goals & Non-Goals
- **Goals:** the outcomes this must achieve.
- **Non-Goals:** explicitly out of scope for this version.

## 3. Users & Personas
Which roles use this (`admin` / `developer` / `billing` / partner / end-customer) and what each needs from it.

## 4. User Stories & Flows
Key journeys as "As a <role>, I want <capability> so that <outcome>." Include the primary happy path and important edge/error flows.

## 5. Functional Requirements
Numbered, testable, one statement each.
- **FR-1** — …
- **FR-2** — …
- **FR-3** — …

## 6. Data Model
Entities, key fields (name, type, notes), and relationships. Table form.

| Entity | Field | Type | Notes |
|---|---|---|---|
| | | | |

**Prototype vs production:** how it's stored now (e.g. Zustand/localStorage or an in-memory gateway Map) → what production needs (DB tables, indexes, migrations, retention).

## 7. API Contracts
For each endpoint: method, path, auth, params (with validation), response envelope, error codes.

| Method | Path | Auth | Params | Success | Errors |
|---|---|---|---|---|---|
| | | | | | |

## 8. Non-Functional Requirements
- **Security & Auth:** key format, verification, session model, secrets.
- **RBAC matrix:** capability × role.
- **Multi-tenancy:** how data/actions are isolated per organization.
- **Compliance:** DPDP/GDPR/CCPA (masking, opt-out, residency) as applicable.
- **Performance:** latency/throughput targets, rate limits, quotas.
- **Reliability & Observability:** retries, idempotency, circuit-breaking, logging/metrics/alerts.

## 9. Dependencies & Integrations
Upstream data sources, third-party services, internal services, feature flags.

## 10. Milestones / Phasing
Phase 1 (MVP) → Phase 2 → … with the rough cut of scope in each.

## 11. Success Metrics
How we'll know it worked (adoption, latency, revenue, error-rate, etc.).

## 12. Open Questions
Unresolved decisions — owner and needed-by where known.

## 13. Out of Scope
Explicitly not being built here.

---

## Changelog
- **<YYYY-MM-DD>** — <what changed and why> (<author>)
