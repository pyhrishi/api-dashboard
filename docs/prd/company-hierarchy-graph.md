# PRD: Company Hierarchy Graph

> Resolve a company's whole corporate family from a single domain — ultimate parent to subsidiaries and branches — each anchored to registry-backed identity, and visualize it as an org tree.

**Status:** Built (prototype is the spec) · **Roadmap:** F-008 (Later → shipped) · **Page:** `/console/hierarchy` · **Source:** `lib/company-hierarchy.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A company is rarely a single legal entity — it's a parent with regional subsidiaries, acquired startups, branches, and divisions. Sales, compliance, and data teams need the corporate family to route accounts, roll up spend, run KYC/KYB, and avoid treating a subsidiary as a separate prospect. Enrichment APIs return the one entity behind a domain and stop there; the family structure is invisible.

## 2. Goals & Non-Goals
**Goals**
- From a domain, resolve the corporate family tree: ultimate parent, intermediate parents, subsidiaries, branches, divisions.
- Give each entity real attributes — ownership stake, entity type, HQ, headcount, and a **registry id** (CIN-style) — so the structure is registry-anchored, not inferred.
- Visualize the tree as an interactive org graph with per-entity detail.
- Keep it deterministic and coherent with a direct company lookup.

**Non-Goals (this phase)** — user-editable hierarchies; ownership-percentage roll-ups / beneficial-ownership computation; ingesting a customer's own org chart; time-travel (historical structure).

## 3. Users & Personas
- **Developer (land):** one call returns the whole family tree — the 10-minute win over stitching lookups together.
- **RevOps / sales (expand):** routes and de-dupes accounts across a corporate family.
- **Compliance / KYB (expand):** sees registry-identified entities and ownership — ties to registry-backed identity (Win #1).
- **RBAC:** the console is `admin | developer | billing` (a read surface).

## 4. Differentiation
D&B family trees are the incumbent, and they're expensive and opaque. Our angle is **Win #1 (dual-engine truth)**: every node carries a registry id (CIN-style for Indian entities) and an ownership stake, so the hierarchy is anchored to registry identity rather than scraped from a website — and it's **India-strong** (Win #3), where corporate-structure data is underserved. Because it's built on the same company resolver as the rest of the product, the family tree and a direct enrichment never disagree.

## 5. Data Model & Logic
Single source of truth: **`lib/company-hierarchy.ts`** — `resolveCompanyHierarchy(domain)`, deterministic (seeded from the domain; no `Math.random`), built on `resolveCompanyFromDomain`.
- Returns `null` for personal / unrecognized domains.
- Picks one of three archetypes from the domain hash — **standalone** (just the subject), **subsidiary** (an ultimate-parent holding company above the subject, plus sibling subsidiaries), or **parent** (the subject is the ultimate parent with 2–5 children — regional subsidiaries, a branch, divisions, some with their own sub-divisions at depth 2).
- Each node: `relation` (ultimate_parent / parent / subsidiary / branch / division), `parent_id`, `ownership_pct` (51–100 for children), `entity_type`, HQ (full country names, matching the base resolver), headcount (scaled from the subject), `registry_id`, and `is_subject` / `is_ultimate_parent` flags.
- `CompanyHierarchy`: `role`, `ultimate_parent_id`, `subject_id`, `total_entities`, `max_depth`, `countries`, `nodes` (flat, root-first), `confidence`, `as_of`.
- Invariants (unit-tested, `lib/__tests__/companyHierarchy.test.ts`, 7 tests): determinism; null for personal domains; a connected tree with exactly one root; exactly one subject node matching the queried domain; every child 51–100% owned with a registry id; role consistent with the tree shape; multiple archetypes across a sample.

## 6. API & Gateway
- `GET /v1/companies/hierarchy?domain=…` (catalog entry, 3 credits) → the `CompanyHierarchy`. Resolved in `src/lib/sandboxAPI.ts` via a new `company-hierarchy` case (returns `NO_HIERARCHY` for personal/invalid domains). No route.ts change — a normal catalog endpoint through the standard pipeline (billing, masking, compression, CORS all apply).

## 7. UI
- **`/console/hierarchy`** (`app/console/hierarchy/page.tsx`, `RoleGuard admin|developer|billing`): enter a domain → an interactive **recursive org tree** (the ultimate parent crowned, the queried company badged, children nested with connectors and ownership); KPIs (entities, structure, depth, countries); a **detail panel** per selected node (legal name, entity type, domain, registry id, ownership, headcount, HQ, industry) with an "Enrich this entity" link to the Studio; a registry-backed explainer. States: idle (empty prompt), loading skeletons, error, ready. Semantic tokens, Framer Motion.
- **Nav:** "Company Hierarchy" (Network icon) beside Identity Resolution. Cross-links to Explorer / Studio.

## 8. Telemetry
`hierarchy_viewed` (on view), `hierarchy_resolved` (domain, role, entity count). Registered in `lib/telemetry.ts` (firmographics group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (7 new tests) · isolated build ok (`/console/hierarchy` emitted) · live gateway smoke: `stripe.com` → a subsidiary tree (Stripe Group ⊃ Stripe + regional subsidiaries) with consistent full country names and a valid CIN (`U45536MH2005PTC823147`).

## 10. Deferred
Editable / user-supplied hierarchies; beneficial-ownership roll-ups; a graph (node-link) layout in addition to the tree; batch hierarchy resolution; historical structure; linking hierarchy nodes to identity-resolution clusters.
