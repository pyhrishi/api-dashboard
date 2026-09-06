# PRD: Suppression List Honoring

> A gateway-enforced do-not-contact list: `src/lib/gateway/suppressionList.ts` + `POST` / `GET` / `DELETE /v1/suppression`, with an enforcement gate in the live pipeline that withholds suppressed contacts.

**Status:** Built (prototype is the spec) · **Roadmap:** F-052 (Next → shipped) · **Endpoints:** `POST` / `GET` / `DELETE /v1/suppression` · **Module:** `src/lib/gateway/suppressionList.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A customer's suppression list — unsubscribes, GDPR erasures, do-not-contact requests, competitor blocks — is a hard compliance obligation: those contacts must never be returned, no matter how they're looked up. Without gateway enforcement, a suppressed person can slip back in through any enrichment call. Suppression list honoring makes the obligation a gateway control: add an identifier and every lookup for it is withheld.

## 2. Goals & Non-Goals
**Goals**
- Manage a suppression list of emails and domains (`POST` / `DELETE /v1/suppression`, `GET` to read it).
- **Enforce** it at the gateway: a lookup whose identifier is suppressed returns a "suppressed, details withheld" result — never the contact — at zero credits.
- Domain-level suppression covers every mailbox on the domain.
- Deterministic and unit-tested; the enforcement is real, in the live pipeline.

**Non-Goals (this phase)** — response-body filtering of suppressed contacts inside a multi-record result (e.g. a company's employee list) — this phase gates on the request identifier; per-customer/per-key scoping (the registry is global this phase); opt-out propagation across cached data (F-343); a console management page (managed via the API this phase); CSV bulk import of a suppression list.

## 3. Users & Personas
- **Compliance / privacy (expand):** loads erasure and do-not-contact identifiers and trusts they're never returned.
- **Email/growth ops (land):** suppresses unsubscribes so they're excluded from every future enrichment.
- **Developer:** one `POST` adds an identifier; lookups honor it immediately.
- **RBAC:** the endpoints need a valid key (via middleware); management is billed 0.

## 4. Differentiation
The differentiated move is **enforcement at the choke point**, not a client-side filter: the gateway itself refuses to resolve a suppressed identifier and says so (an `X-Suppressed` header + a `suppressed: true` payload) at zero credits — you can't accidentally pay for or receive a suppressed contact. It complements the bounce feedback loop (F-045, system-detected suppression) with a customer-declared do-not-contact list, and lays the groundwork for opt-out propagation (F-343).

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/suppressionList.ts`**.
- An in-memory `Map<normalizedIdentifier, SuppressionEntry{ identifier, kind: 'email'|'domain', reason, added_at, added_by }>`, with a small deterministic seed.
- `classifyIdentifier` (email vs domain, normalized), `addSuppression`, `removeSuppression`, `checkSuppression` (an email is suppressed if the exact address is listed **or** its domain is — email match wins), `getSuppressionStats`. **No `Math.random`**; timestamps are the only wall-clock, for freshly-added entries.
- Invariants (unit-tested, `src/lib/gateway/__tests__/suppressionList.test.ts`, 6 tests): classification; exact-email suppression; domain suppression covers all its mailboxes; exact match beats domain match; removal; a coherent seeded stats snapshot.

## 6. API & Gateway
Wired into the live pipeline (`app/api/v1/[...route]/route.ts`):
- **Management** (free special-path handlers, before route resolution + billing): `POST /v1/suppression` (`{ identifier, reason? }` → add), `DELETE /v1/suppression` (`{ identifier }` → remove), `GET /v1/suppression` (the list + stats).
- **Enforcement gate** (after param-parse, before billing): for a GET lookup whose `email` or `domain` parameter is suppressed, the request short-circuits to `{ success: true, data: { suppressed: true, identifier, kind, reason, message } }` with an `X-Suppressed: true` header and **zero credits** — the contact is never resolved or billed.
- Both management endpoints are in the catalog (`suppression-add`, `suppression-list`, `suppression-remove`) for docs/OpenAPI/Postman/CLI/Explorer.

## 7. UI
No new page this phase — the behavior surfaces where lookups happen: the Endpoint Explorer manages the list and shows a suppressed lookup returning `suppressed: true`; the Studio renders a suppressed result via the generic result view. Management is API-first.

## 8. Telemetry
No new client event — this is server-side gateway behavior; suppression activity is visible via the stats endpoint and the `X-Suppressed` response header.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (6 new module tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live: `POST /v1/suppression` adds an identifier, a subsequent lookup on it returns `suppressed: true` with `X-Suppressed`, and `GET /v1/suppression` reflects the entry (curl to `/v1` lookups is IP-gated; the browser same-origin path is the live surface).

## 10. Deferred
Per-customer/per-key scoping; response-body filtering within multi-record results; CSV bulk import; a console management page; opt-out propagation across cached data (F-343); global do-not-contact enforcement across all outputs (F-327).
