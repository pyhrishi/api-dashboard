---
name: prd
description: Create, update, or reverse-engineer a Product Requirements Document (PRD) for the Zinbit platform, for handing the prototype to engineering to build at scale. Use whenever the user asks to write/update a PRD, spec a feature, or turn a built prototype feature into an engineering spec. The prototype is the source of truth, so most PRDs are reverse-engineered from what's built.
---

# Writing PRDs for Zinbit

The Zinbit prototype **is** the specification. A PRD's job is to make what the prototype
demonstrates precise, complete, and buildable-at-scale for an engineering team — and to
be explicit about what the prototype *simulates* vs what production *requires*.

PRDs live in **`docs/prd/<area>-<feature>.md`** (e.g. `docs/prd/partners-revenue-share.md`).
Keep the index at `docs/prd/README.md` updated when you add one.

## Three modes

### 1. Reverse-engineer (most common)
The feature exists in the prototype. Produce a faithful spec of it.
1. Identify the artifacts: the console route(s) (`app/console/<area>/page.tsx`), the store slice(s) in `lib/store.ts` it reads/writes, any gateway backend (`src/lib/gateway/*`) and the `/api/v1/...` routes it calls, and related tests.
2. Read them and derive each PRD section from real code — see `references/prd-from-prototype.md` for the artifact→section mapping.
3. For every requirement, note how the **prototype simulates** it and what **production must add** (in-memory store → real DB + migrations; unverified JWT → verified signature; client-side RBAC → server-enforced; per-isolate Maps → durable storage; seeded mock data → real pipelines).

### 2. Author (new feature)
No prototype yet. Fill the template from the user's intent, marking assumptions and open questions clearly. Prefer to prototype first when feasible, then reverse-engineer.

### 3. Update
A PRD exists. Revise only the affected sections, update the `Status` and `Last updated` fields, and append a dated entry to the **Changelog** at the bottom (what changed + why).

## How to write it

- Start from `references/prd-template.md`. Keep every section; write "N/A" rather than deleting one.
- **Functional requirements are numbered and testable** (FR-1, FR-2…): each is a single, verifiable statement an engineer can build and QA can check.
- **Data model** comes from the real TS interfaces (`lib/store.ts`, `src/lib/gateway/*`). Include entities, key fields, types, and relationships.
- **API contracts** come from `src/data/endpoints.ts` and the route handlers: method, path, params (with validation), auth, response envelope, error codes.
- **Non-functionals** are concrete: rate limits, billing/credits, RBAC matrix, multi-tenancy isolation, compliance (DPDP/GDPR/CCPA masking, residency), performance targets, observability.
- Be scannable: tables for the data model / API / RBAC matrix; short prose elsewhere. Flag unknowns as **Open Questions** — never invent answers.

## Verify a PRD before handing off
- Every UI behavior in the prototype maps to a numbered FR.
- Every entity the feature touches is in the Data Model.
- Every endpoint it calls is in API Contracts.
- The "prototype vs production" gaps are called out.
- Status, owner, related routes, and Changelog are filled in.
