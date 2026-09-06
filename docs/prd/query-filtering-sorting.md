# PRD: Query Filtering & Sorting

> A universal query grammar for list endpoints: `filter=field:op:value` (rich operators, ANDed) and `sort=field,-field2` (multi-field), applied consistently by the gateway — plus a live query-builder playground.

**Status:** Built (prototype is the spec) · **Roadmap:** F-078 · **Routes:** list endpoints (e.g. `GET /v1/companies/employees`), surfaced in `/console/query`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
`GET /v1/companies/employees` could filter by exactly one field (`department`, exact match) and sort by one field — logic hand-rolled inside the endpoint. That doesn't scale: every list endpoint would reinvent it, and developers can't express "Engineering OR Sales, names containing 'smith', newest first." F-078 replaces the ad-hoc code with a **universal query grammar** — a documented set of operators and a multi-field sort — parsed and applied by one deterministic engine, so every list endpoint filters and sorts the same way.

## 2. Goals & Non-Goals
**Goals**
- **A filter grammar:** `filter=field:op:value`, clauses ANDed, with operators `eq ne gt gte lt lte contains startsWith endsWith in` (`in` takes a pipe list). Numeric when both sides are numbers, else case-insensitive strings.
- **Multi-field sort:** `sort=field,-field2` (`-` = descending), stable.
- **Universal + composable:** `filter`/`sort` are gateway-global params (like F-062 `fields`), so they compose with field selection and pagination and work on any list endpoint.
- **Honest feedback:** malformed clauses/operators are reported in the response (`query.errors`) rather than silently ignored; the response echoes the parsed filters/sorts and the unfiltered total.
- **A playground:** a console query builder to construct filters + sort visually, run live, and copy the request URL.

**Non-Goals (this phase)** — OR / nested boolean groups (clauses are ANDed); filtering the single-record enrichment endpoints (only lists); full-text search / relevance ranking; server-side field-type schemas (types are inferred per value); cursor semantics changes (pagination is unchanged, applied after filter+sort); `filter`/`sort` on write endpoints.

## 3. Users & Personas
- **Integrating developer (land):** pulls exactly the slice they need (`filter=department:in:Sales|Engineering&sort=-name`) in one call instead of over-fetching and filtering client-side.
- **Data/RevOps (expand):** explores a company's employees by department/title in the playground without writing code.
- **RBAC:** the playground inherits the `admin | developer` gate; the grammar is available to any valid key.

## 4. Differentiation
Table-stakes for a serious list API — shipped clean and universal rather than per-endpoint. Ties to **win #5 (operator-grade)**: one documented grammar, one SSOT, deterministic, with a visual builder that emits the exact URL. Composes with field selection (F-062) so you can filter, sort, *and* trim fields in a single request.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/queryEngine.ts`** (pure, deterministic, no mutation, no `Math.random`).
- `parseFilter(str)` → `{ clauses, errors }` (splits `field:op:value`, preserving values that themselves contain `:`); `parseSort(str)` → ordered `{ field, dir }`; `parseQuery({filter, sort})` → a `QuerySpec` with collected errors.
- `matchesClause(row, clause)` — numeric-vs-string aware operator evaluation; `applyQuery(rows, spec)` — filter (AND) then stable multi-key sort, returning `{ rows, matched, total, filtersApplied, sortsApplied }`.

## 6. State / Integration
- **Sandbox pipeline** (`src/lib/sandboxAPI.ts`): `filter`/`sort` join `fields` in `GLOBAL_PARAMS` (accepted on every endpoint). The `company-employees` case builds its 145-row deterministic dataset, then applies the engine (`department=X` kept as sugar for `filter=department:eq:X`), paginating the filtered+sorted result. The response gains a `query` block (parsed filters, sorts, errors, `unfiltered_total`).
- **No route.ts change** — query handling lives where the list is generated; no gateway-pipeline edit.
- **No store slice** — the playground reads the live gateway.

## 7. UI
`/console/query` (icon `Filter`): a filter builder (add/remove `field · operator · value` rows, field list derived from the live dataset, operators from the SSOT), a sort selector (field + direction), a live "Run query" against the real gateway, a copyable request URL, a results `DataTable`, a "N of M" result count, and an error panel when the grammar reports malformed clauses. Beautiful loading (skeletons), empty ("no rows match"), and error (retry) states. Semantic tokens; Framer Motion; light + dark. Cross-links to Explorer and Logs.

## 8. Telemetry
`query_viewed` (playground open) and `query_run` (filters count, sorts count, matched, environment) via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (13-case engine suite: parse/operators/`in`/errors, AND filtering, numeric+multi-key stable sort, purity, determinism) · isolated build green (route `/console/query`) · **live gateway checks**: `filter=department:eq:Engineering&sort=-name` → 29 of 145, all Engineering, names descending; `filter=name:contains:ali,department:in:Sales|Marketing` → the expected subset; a bad operator surfaces in `query.errors`. Playground builds/edits clauses and renders results, 0 console errors.

## 10. Deferred
OR / nested boolean groups; full-text search + relevance; per-endpoint field-type schemas & validation; applying the grammar to more list endpoints as they ship; a saved-query library; exporting a filtered result set.
