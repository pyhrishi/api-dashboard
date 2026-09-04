# Reverse-engineering a PRD from the prototype — artifact → section map

For a given feature/area, gather these artifacts and map them to PRD sections.

## Where to look

| Artifact | Path | Feeds PRD section(s) |
|---|---|---|
| Console page(s) | `app/console/<area>/page.tsx` (+ drawers/modals) | User Stories & Flows, Functional Requirements, RBAC |
| Store slice(s) | `lib/store.ts` (interfaces + actions + `partialize`) | Data Model, Functional Requirements |
| Gateway backend | `src/lib/gateway/<module>.ts` (+ interfaces) | Data Model, API Contracts, Non-Functional |
| API routes | `app/api/v1/[...route]/route.ts` sub-routers, `src/data/endpoints.ts` | API Contracts |
| RBAC | `<RoleGuard allowedRoles>`, `ProtectedRoute`, role checks in store | Users & Personas, RBAC matrix |
| Tests | `src/**/__tests__/*` | Functional Requirements (as acceptance criteria) |
| Config | `lib/api-config.ts`, `next.config.mjs`, `middleware.ts` | Non-Functional (auth, residency, rate limits) |

## Deriving each section

- **User Stories & Flows** — every interactive path in the page (buttons, forms, tabs, drawers, empty/error states) is a flow. The happy path + each guarded/error branch.
- **Functional Requirements (FR-n)** — turn each observable behavior into a numbered, testable statement. Example: a "Process Month-End Payouts" button → *FR-n: An admin can trigger a month-end payout batch; the system returns the count and total amount and marks included events paid.*
- **Data Model** — copy the real TS interfaces (entity + fields + types). Note relationships (foreign keys / references). State the current storage (Zustand/localStorage or in-memory Map) and the production target (DB + migrations).
- **API Contracts** — for each `/api/v1/...` route the feature calls: method, path, auth header, params (+ validation from `endpoints.ts`), the success envelope (`{ success, data, metadata }`), and error codes (`401/402/403/406/429/451/…`).
- **Non-Functional** — pull concrete numbers from the gateway: token-bucket rate limit, credit costs (`endpoints.ts`), masking rules (live-only), residency (`x-country-code`→region), tenant isolation (`TenantState`).

## Always call out prototype → production gaps

The prototype simulates; production must implement. Standard gaps to flag in the PRD:
- In-memory Zustand store / per-isolate Maps → **durable database** (schema, indexes, migrations, backups, retention).
- Unverified JWT / format-only key check → **verified signatures**, key hashing with salt, rotation.
- Client-side RBAC (self-elevatable "View As") → **server-enforced** authorization.
- Seeded/mock responses (`sandboxAPI.ts`, `lib/mock-data.ts`) → **real enrichment pipelines / data sources**.
- Simulated billing ledger → **real metering + invoicing (Stripe/ACH)**.
- Deterministic "AI" (`lib/insight-engine.ts`) → **real models** if/where desired (note latency/cost/failure trade-offs).
