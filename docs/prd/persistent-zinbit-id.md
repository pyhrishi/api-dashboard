# PRD: Persistent Zinbit ID

> A stable canonical entity identifier: `GET /v1/identity/zid` plus a Zinbit ID on every person/company result, all from one frozen-normalization source (`lib/zinbit-id.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-028 (Next → shipped) · **Endpoint:** `GET /v1/identity/zid` · **Preset:** Studio → "Persistent Zinbit ID"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Customers key their CRM on whatever identifier they happened to capture — an email here, a LinkedIn URL there — and then can't join or dedupe across sources when those identifiers differ or change. A persistent, provider-assigned entity ID solves this: one stable `zid` per real entity that every identifier resolves to. Persistent Zinbit ID assigns that ID and exposes it everywhere.

## 2. Goals & Non-Goals
**Goals**
- Assign every person and company a stable canonical ID (`zid_p_…` / `zid_c_…`).
- The ID is the **same across identifiers** (email, LinkedIn, hashed email, phone) and **survives an email change**, because it's derived from *who the entity is*, not the query.
- `GET /v1/identity/zid` resolves any email or domain to its Zinbit ID, entity type, first-seen, and unifying aliases.
- Surface the Zinbit ID on **every** person/company enrichment result.

**Non-Goals (this phase)** — an ID→entity reverse lookup endpoint; merge/split lifecycle events when the graph changes; customer-supplied external-ID mapping; resolving LinkedIn/phone directly to a zid (email + domain this phase); cross-tenant identity sharing.

## 3. Users & Personas
- **Data engineer (land):** stamps every record with a `zid` so joins and dedupe key on one stable column.
- **RevOps / enterprise (expand):** relies on the ID surviving email changes to keep a single customer view.
- **Developer:** one call maps any identifier to the canonical ID and its aliases.
- **RBAC:** standard authenticated key; billed one credit.

## 4. Differentiation
The angle is a **frozen, honest identity key**: the ID is derived from a deliberately minimal, never-changing normalization (lowercase, strip accents, drop punctuation, sort name tokens) — explicitly *not* the growing nickname dictionary that powers Name Canonicalization/Fuzzy Matching — because a persistent ID that could change isn't persistent. Coherence: the hashed-email alias is produced by the same `lib/sha256` as Hashed-email lookups (F-021), so a Zinbit ID and a hashed lookup agree on the same person; and the ID is derived from the same person/company graph every other feature uses.

## 5. Data Model & Logic
Single source of truth: **`lib/zinbit-id.ts`**.
- `zidForPerson(p)` / `zidForCompany(c)` derive a 12-char base36 ID from a **frozen key** — person: `normalize(name) @ domain` (or `name | email` for personal mailboxes); company: `domain` — via two FNV-1a passes. **No `Math.random`, no wall-clock**, so an ID never changes once assigned.
- `resolveZinbitId(query)` detects an email (→ person) or domain (→ company), resolves through the shared resolvers, and returns the ID plus aliases: email, `sha256:`-prefixed hashed email (via `lib/sha256`), LinkedIn, phone (person) / domain, website, LinkedIn (company), and a deterministic `first_seen`.
- `isZinbitId` validates the `zid_[pc]_…` shape.
- Invariants (unit-tested, `src/lib/__tests__/zinbitId.test.ts`, 8 tests): deterministic + well-formed; equals the standalone `zidForPerson`/`zidForCompany`; person vs company namespaces are distinct; the hashed-email alias equals `hashEmail()` from the hashed-email resolver (coherence); a domain yields a company zid with domain+website aliases; unresolvable input → `null`; the format validator; and the full Studio dispatch into a zid view-model.

## 6. API & Gateway
- **Endpoint:** `GET /v1/identity/zid` (catalog entry in `src/data/endpoints.ts`; mock case in `src/lib/sandboxAPI.ts`), 1 credit, param `query`. Neither a resolvable email nor a valid domain → `400 INVALID_PARAMETERS`. Runs the full gateway pipeline.

## 7. UI
- **Enrichment Studio preset** "Persistent Zinbit ID" (`src/data/enrichments.ts` — preset + `zidToResult` + dispatch keyed on a `zinbit_id` string + an `aliases` array). Renders through the generic result card: the canonical entity as the title, the Zinbit ID as a verified mono field, entity type / derived-from / first-seen fields, and the unifying aliases as chips (`Unifies N identifiers`).
- **Everywhere else:** `personToResult` and `companyToResult` now include a "Zinbit ID" mono field, so the same stable ID shows on every person/company enrichment (including hashed-email matches, which spread the person fields).
- Semantic tokens only; inherited loading / error / not-found states from the Studio.

## 8. Telemetry
Reuses the generic `enrichment_run` event (preset `zid`) — no bespoke event; adoption lands in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (8 new tests, incl. the cross-feature hashed-email coherence check + the dispatch chain) · isolated `NEXT_DIST_DIR=.next-verify next build` green. Live curl is IP-gated (`::1`, SOC 2 policy); the browser same-origin Studio path is the live surface.

## 10. Deferred
An ID→entity reverse lookup; merge/split lifecycle webhooks; customer external-ID mapping; direct LinkedIn/phone → zid resolution; a persisted identity graph with history.
