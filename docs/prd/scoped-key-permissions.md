# PRD: Scoped Key Permissions

> Restrict an API key to the exact scopes it needs; the gateway enforces least privilege, rejecting any out-of-scope call with 403 INSUFFICIENT_SCOPE — from one catalog the console shows and the gateway checks.

**Status:** Built (prototype is the spec) · **Roadmap:** F-113 · **Routes:** `GET/POST/DELETE /v1/keys/scopes`, enforcement on all `/v1/*`, `/console/scopes`, `/console/keys`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Keys could already be *labelled* with scopes in the console, but nothing enforced them — a "read-only" key could still call anything, so the control was cosmetic (a dead affordance). Scoped key permissions close that seam: a key is bound to a scope set, and the gateway rejects any call the key isn't scoped for with `403 INSUFFICIENT_SCOPE`. This is table-stakes security hygiene for an enterprise API — least privilege, per key — and it makes every existing scope selector actually do something.

## 2. Goals & Non-Goals
**Goals**
- A **shared scope catalog** (Identity / Corporate / Search / Enrichment utilities / Write) that both the console and the gateway consume — no divergence between what's shown and what's enforced.
- **Real enforcement** in the gateway pipeline: resolve each endpoint's required scope, check the key, and 403 before billing on a shortfall (with the required scope in the error + `X-Required-Scope` header).
- **Backwards-compatible:** an unregistered or full-access (`*`) key is unrestricted — least privilege is opt-in per key, so nothing breaks.
- **Closed seam:** creating, rolling, or restricting a key registers its scopes with the gateway, so enforcement is real end-to-end.
- **Prove it:** a console that shows the per-endpoint requirement matrix and fires live probes to watch allow/deny by scope.

**Non-Goals (this phase)** — resource-level / row-level scopes (endpoint-level only); custom user-defined scopes (a fixed catalog); scope approval workflows; per-scope rate limits or billing; OAuth scopes / token exchange; migrating the wildcard default to deny-by-default (opt-in restriction preserves compatibility).

## 3. Users & Personas
- **Security-minded developer (land):** issues a read-only key for a client app; the gateway guarantees it can't write.
- **Enterprise / platform admin (expand):** enforces least privilege across many keys; the denial counter proves it's working.
- **Auditor:** the endpoint→scope matrix documents exactly what each scope grants.
- **RBAC:** the console pages are `admin | developer`; the `/v1/keys/scopes` registry is a free meta endpoint (keyless-billed).

## 4. Differentiation
Table-stakes done cleanly, tied to **win #6 (enterprise-grade security)**. The differentiator is **coherence + provability**: one SSOT (`lib/scopes.ts`) drives both the console matrix and the gateway check, so they can never drift, and the console's **live probe** lets anyone verify enforcement in seconds (restrict a key → watch it get 403'd). Most tools show scope checkboxes; few let you *prove* the wire actually enforces them.

## 5. Data Model & Logic
- **`lib/scopes.ts`** (SSOT, client-safe): `SCOPE_CATALOG`, `scopeForEndpoint(endpoint)` (path/method → required scope, `null` for free/meta), `keyHasScope(keyScopes, required)` (honors `*`/`all` and `cat:*` wildcards), `isUnrestricted`, `scopeLabel`, `scopesByCategory`. Pure/deterministic.
- **`src/lib/gateway/scopes.ts`** (server registry): `registerKeyScopes` / `unregisterKeyScopes` / `getKeyScopes` (unregistered ⇒ `['*']`, preserving lazy provisioning) / `checkEndpointScope` (records checks + denials) / `getScopeRegistrySnapshot`. Seeded, per-isolate.
- **`MockKey.scopes`** (existing) is the console's source of truth; no store schema change.

## 6. State / Integration
- **Enforcement:** in `app/api/v1/[...route]/route.ts`, right after endpoint resolution and before billing — `checkEndpointScope(apiKey, endpoint)` → 403 `INSUFFICIENT_SCOPE` (`required_scope`, `key_scopes`, `X-Required-Scope`) on a shortfall.
- **Sync endpoint:** `GET /v1/keys/scopes` (masked registry snapshot), `POST` (register `{key, scopes}`), `DELETE` (revoke) — free meta path before billing.
- **Console sync:** `app/console/keys/page.tsx` now uses the SSOT catalog and calls the sync endpoint on **create / roll / auto-restrict** (fire-and-forget), so registered scopes match the console.
- **`/console/scopes`:** KPIs (registered / restricted keys, checks, denials), the scope catalog, the endpoint→scope matrix (✓/✗ against the selected key), and a live probe runner (real GET calls → 200/403). Cross-links to API Keys.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge). **Loading** — skeletons. **Ready** — catalog + matrix + tester. **Error** — registry load failed + retry. **Probe results** — per-probe allow/deny with status. Matrix scrolls in its own container; semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `scopes_viewed` (page view) and `scope_probe_run` (keyScopes, probes, denied). Emitted from the console; `api_key_created` already records scope count.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**10-case** suite: scopeForEndpoint mapping incl. meta=null, keyHasScope wildcard/category/exact/empty, isUnrestricted, registry register/replace/unregister, unregistered=unrestricted, in-scope allow + out-of-scope deny with required scope, snapshot counts + masking, meta always allowed) · isolated `next build` green (`/console/scopes` present) · Playwright smoke (`e2e/scopes.spec.ts`) · live gateway drill — a `corporate:read`-only key gets 200 on `/v1/companies/enrich` and 403 INSUFFICIENT_SCOPE on `/v1/people/phone`. 0 console errors.

## 10. Deferred
Deny-by-default for new keys; resource/row-level scopes; custom scopes + scope groups; per-scope rate limits; OAuth token exchange; a scope-usage report (which scopes a key actually exercises) to right-size grants; propagating scope enforcement to the GraphQL + gRPC channels.
