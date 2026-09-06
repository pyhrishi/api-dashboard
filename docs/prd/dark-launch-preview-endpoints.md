# PRD: Dark-Launch Preview Endpoints

> Ship upcoming API capabilities behind a dark launch — live and callable, but gated to opt-in testers so the shape settles before GA. Enroll and your next call returns the new shape; a teammate who hasn't opted in gets a clear 403, not a surprise.

**Status:** Built (prototype is the spec) · **Roadmap:** F-081 (Later → shipped) · **Route:** `GET /api/preview[/…]` · **Console:** `/console/preview` · **Source:** `lib/preview-program.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The codebase already had a binary "v2 dark launch" flag, but no way to *see* what's in preview, opt into a specific capability, or call it. The best developer platforms (Stripe, Twilio) let you try upcoming APIs behind a version/preview flag and gather feedback before GA. Zinbit needed the same: a real, gated preview program where enrollment actually unlocks the endpoint, and non-enrolled callers get an actionable 403 rather than a silent 404 or an accidental dependency on an unstable shape.

## 2. Goals & Non-Goals
**Goals**
- A preview-program catalog: which endpoints are in dark launch, their stability stage, what's new, and target GA.
- Per-org **enrollment** that really gates the endpoint — enrolled calls succeed, non-enrolled calls 403 with a clear opt-in hint.
- Try a preview from the console and see the real 403-vs-200 gate; preview calls are free until GA.

**Non-Goals (this phase)** — per-key (vs. per-org) preview scoping; automatic GA promotion; a feedback thread per preview; versioned/pinned API versions (`Zinbit-Version` header) — the preview flag is the mechanism here; deprecation lifecycle of GA endpoints.

## 3. Users & Personas
- **Developers (land):** opt into a beta endpoint and call it immediately — the 10-minute win; a non-enrolled call returns a clear 403 telling them how to opt in.
- **Platform/enterprise:** per-org enrollment governance, audited.
- **RBAC:** page visible to `admin | developer | billing`; **billing is read-only** (enrollment gated in UI + store).
- **Multi-tenant:** enrollment is tenant-scoped, so it swaps per org.

## 4. Differentiation
Ties to **Win #5 (operator-grade DX)** — the Stripe/Twilio bar. It's a *real* gate, not a flag on a mock: the route enforces opt-in and returns `403 PREVIEW_ACCESS_REQUIRED` with the exact header to send, and the console's "Try it" demonstrates the gate live (403 when not enrolled → 200 the moment you enroll). Preview endpoints map to the **same deterministic resolvers** as the GA surfaces where an equivalent exists (People Search v2 → the person resolver; Company Graph v2 → company + hierarchy), so a preview never disagrees with production; and one brand-new capability (Buying Signals) is dark-launched as `alpha`.

## 5. Data Model & Logic
- **`lib/preview-program.ts`** (client-safe SSOT) — `PREVIEW_ENDPOINTS`: id, path, name, `stage` (alpha/beta/preview), summary, `whatsNew[]`, `targetGA`, `supersedes?`, input param. Helpers `previewById`/`isEnrolled`/`byStability`/`stageLabel`. Free during dark launch (0 credits).
- **`lib/preview-resolvers.ts`** (server) — `PREVIEW_RESOLVERS` mapping each preview to a resolver: `people-search-v2` → `resolvePersonFromEmail` + employer join; `company-graph-v2` → `resolveCompanyFromDomain` + `resolveCompanyHierarchy`; `buying-signals` → a deterministic (FNV-1a) intent model (typed signals + a 0–100 index). No `Math.random`.
- **State (Zustand, tenant-scoped, persisted):** `previewOptIns: string[]` + `enrollPreview(id)` / `leavePreview(id)` — billing-blocked, validated against the catalog, audit-logged (`preview.enrolled` / `preview.left`), in `TenantState`/extract/default/partialize (swaps per org).
- Invariants (unit-tested, `src/lib/__tests__/previewProgram.test.ts`, 8 tests): catalog integrity (stage, path, resolver present); `previewById`/`isEnrolled`/stability sort; resolvers (person+employer, company+family, deterministic bounded buying-signals, null on bad input); store enroll/leave idempotent + tenant-scoped + unknown-id throw + billing block.

## 6. API & Gateway
Own gated route (`app/api/preview/[[...slug]]/route.ts`) — middleware covers only `/api/v1`, so it does its own auth (format-only, any well-formed `sk_test_`/`sk_live_`).
- `GET /api/preview` → the public program listing.
- `GET /api/preview/<id>?param=…` → the gate: requires header `x-preview-optin: <id>` (or `true`); without it → **`403 PREVIEW_ACCESS_REQUIRED`** naming the header to send; with it → the resolver's data + `X-Preview-Stage` / `X-Preview-GA` headers, `cost: 0`. `401` bad key, `404` unknown preview, `400` missing param.

## 7. UI
`/console/preview` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (preview count, your enrollments, "Free" cost, beta/alpha split).
- **Preview cards** (sorted most-stable first): stage badge (alpha=warning, beta=teal, preview=success) + its blurb, name, `GET /api/preview/<id>`, summary, `whatsNew` list, target GA, `supersedes`, an **Enroll/Leave** toggle, and a **"Try it"** that fires the real route (opt-in header only when enrolled) and shows the 200 payload or the 403 gate inline ("Enroll above, then try again — the gate is real").
- **States:** loading skeleton; billing read-only; toast on enroll; per-card try-result panel with the JSON. Runs log to `apiLogs` (Logs/Analytics seam). Framer Motion on cards + result reveal.

## 8. Telemetry
`preview_program_viewed` (view), `preview_endpoint_enrolled {id, action}` (enroll/leave), `preview_endpoint_tried {id, status}` (try) — via `lib/telemetry.ts`. **PLG hook:** enrollment is an early-adopter/expansion signal.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (8 new tests) · `next build` green (new `/console/preview` + `/api/preview`) · Playwright smoke (`e2e/preview.spec.ts`) · live gateway smoke: `GET /api/preview` lists the program; `people-search-v2` without opt-in → `403 PREVIEW_ACCESS_REQUIRED`; with `x-preview-optin` → `200` + `X-Preview-Stage: beta` + `X-Preview-GA: Q4 2026`.

## 10. Deferred
Per-key preview scoping; automatic GA promotion + a "graduated" state; per-preview feedback thread; `Zinbit-Version` pinned API versions; GA-endpoint deprecation lifecycle; converting the legacy `v2DarkLaunchEnabled` flag onto this program.
