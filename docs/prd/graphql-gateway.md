# PRD: GraphQL Gateway

> Query exactly the enrichment graph you need in one call — walk person → employer, select only the fields you want, and pay for exactly that. Same keys, billing, and live-key masking as REST.

**Status:** Built (prototype is the spec) · **Roadmap:** F-065 (Later → shipped) · **Endpoint:** `POST /api/graphql` · **Console:** `/console/graphql` · **Source:** `lib/graphql/`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Zinbit's enrichment is REST: one endpoint per lookup, a full payload back. Developers who want a person *and* their employer make two calls and over-fetch fields they discard. Modern data APIs increasingly expose GraphQL so a client can request exactly the shape it needs in one round-trip. Offering a real GraphQL gateway — not a thin proxy, but a typed schema over the same resolvers with the same auth, billing, and compliance — is a differentiated DX move against REST-only incumbents (Clearbit, PDL).

## 2. Goals & Non-Goals
**Goals**
- A real, executable GraphQL endpoint over the existing enrichment resolvers — parse, validate, execute, project.
- One-call graph traversal: `person → employer`.
- Field selection (pay/return only what's asked), per-query credit cost.
- First-class parity: same key auth, billing (lazy provisioning), and **live-key PII masking** as REST.
- An in-console Explorer: schema browser, editor, run against the real endpoint, response + cost.

**Non-Goals (this phase)** — mutations, fragments, directives, unions/interfaces, subscriptions, full introspection (`__schema`); persisted queries; a saved-query store; batching/`@defer`. Unsupported syntax returns a clear error, never a wrong answer.

## 3. Users & Personas
- **Developers (land):** the 10-minute win — paste a query, get exactly the fields, see the cost. `POST /api/graphql`.
- **Platform/enterprise:** the same governance as REST (billing, masking, compliance) — GraphQL isn't a bypass.
- **RBAC:** Explorer is `admin | developer`.

## 4. Differentiation
Ties to **Win #5 (operator-grade DX)** and **Win #4 (transparency)**. It's a *real* executor (hand-written, dependency-free), not a mock: it tokenizes, parses, validates, and projects like GraphQL, and it dispatches to the **same deterministic resolvers REST uses**, so GraphQL and REST never disagree (field names are identical snake_case — one data shape, two query languages). Every response carries its exact credit cost in `extensions.cost`, and live keys are masked the same way REST masks them — the GraphQL surface is governed, not a side door.

## 5. Data Model & Logic
`lib/graphql/` — three modules, deterministic, no `Math.random`, no external dependency:
- **`schema.ts`** (client-safe SSOT) — `TYPES` (Person, Company; fields mirror the resolver output) + `QUERIES` (`person`/`company`/`companyByIp`, with args + `creditCost` + `resolverKey`) + `buildSDL()` + `EXAMPLE_QUERY`. No resolver imports, so the Explorer bundles only the shape.
- **`resolvers.ts`** (server) — maps each query to the existing lib resolvers (`resolvePersonFromEmail`, `resolveCompanyFromDomain`, `resolveCompanyFromIp`); `person` attaches `employer = resolveCompanyFromDomain(company_domain)` — the graph join.
- **`executor.ts`** — a real tokenizer → parser (operations, fields, args, aliases, `$variables`, nested selection sets) → validator (unknown field/query, missing required arg, selection-on-scalar, missing-selection-on-object) → executor with **recursive projection** of the selection set → `{ data, errors, cost }`. GraphQL partial-data semantics: a bad subfield errors that field but returns the rest. `estimateCost` sums query costs without executing.
- Invariants (unit-tested, `src/lib/__tests__/graphqlExecutor.test.ts`, 17 tests): SDL covers all queries/types; person projection returns only selected fields; the person→employer join; multiple top-level queries sum cost; aliases; variables; determinism; unknown query/subfield/missing-arg/selection errors (no throw); mutation rejection; syntax error; null (not error) for unresolvable input; estimateCost.

## 6. API & Gateway
- **`POST /api/graphql`** (`app/api/graphql/route.ts`) — middleware covers only `/api/v1`, so the route does its own **auth** (bearer, any well-formed `sk_test_`/`sk_live_`, billing lazily provisions), **billing** (`deductCredits(key, cost)`, `402` on insufficient), **live-key masking** (`applyPrivacyMasking` with `detectPrivacyFramework(x-country-code)`; sandbox keys unmasked), and returns `{ data, errors?, extensions:{ cost, remaining, masked, environment, requestId } }` with `X-GraphQL-Cost`. `401` for a bad key, `400` for a bad body, `402` on credits.
- **`GET /api/graphql`** — serves the SDL for introspection.
- Credit cost per query: `person` 2, `company` 1, `companyByIp` 2 (summed across a multi-query document).

## 7. UI
`/console/graphql` — composed from `components/ui`, semantic tokens only.
- **Schema browser** (left): clickable queries (name · args · return type · cost) that load a runnable template; expandable types with their fields; a "View schema" SDL panel.
- **Editor**: a monospace query editor seeded with the example, a Run button, environment label.
- **Response**: pretty-printed `data`, an errors list (message + path), a status badge, the credit cost, and a "masked (live)" badge; Copy. Each run **logs to `apiLogs`** (method POST, path `/graphql`) so it flows into Logs / Analytics — the same seam as the REST Explorer.
- **States:** no-key empty state (→ create a key); running spinner + skeleton; network-error card; pre-run hint. Framer Motion on the SDL panel + response.

## 8. Telemetry
`graphql_explorer_viewed` (view), `graphql_query_run {cost, status}` (success), `graphql_query_failed {status, errors}` (GraphQL errors present) — via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (17 new tests) · `next build` green (new `/console/graphql` route + `/api/graphql`) · Playwright smoke (`e2e/graphql.spec.ts`) · live gateway smoke: `GET` → SDL; `POST person→employer` → projected data + cost 2 + billed; unknown subfield → partial data + GraphQL error with path; no key → 401.

## 10. Deferred
Mutations; fragments/directives/variables-with-defaults; unions/interfaces; full `__schema` introspection; persisted & saved queries (a store slice); query batching / `@defer` / `@stream`; a schema-aware autocomplete in the editor; more root queries (email verification, phone, technographics) — the schema + resolver map extend trivially.
