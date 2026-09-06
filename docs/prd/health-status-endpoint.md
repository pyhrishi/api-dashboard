# PRD: Health & Status Endpoint

> A public, unauthenticated API route (`app/api/health/route.ts`) plus the `/status` page, both reading one deterministic source (`lib/health.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-073 (Now) · **Endpoint:** `GET /api/health` · **Page:** `/status`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A status *page* isn't enough — teams want to check platform health *programmatically* (uptime monitors, dashboards, incident automation) and be able to trust that the page and the API agree. Before this, `/status` was hardcoded and there was no health endpoint. Health & Status Endpoint adds a real `GET /api/health` and makes the page render from the same source, so they can never disagree.

## 2. Goals & Non-Goals
**Goals**
- A public, unauthenticated `GET /api/health` returning component-level status, latency, and 60-day uptime, an overall status, and a `degraded` flag.
- The `/status` page renders from the **same** source — one snapshot, two surfaces.
- Deterministic (same snapshot every call), and `200` when up / `503` when down for uptime monitors.
- Outside the billed `/v1` catalog and the auth middleware — health checks are free and keyless.

**Non-Goals (this phase)** — real-time metrics from live infrastructure (deterministic mock); historical incident management (the incident list stays curated content); subscribe-to-updates / webhooks on status change; regional/per-component sub-pages.

## 3. Users & Personas
- **Engineering / Platform Lead (expand):** points an uptime monitor at `/api/health`; sees per-component status and degraded-mode.
- **Integrating Developer (land):** checks status before debugging a failing call.
- **Any visitor / buyer:** reads the public `/status` page for uptime transparency.
- **RBAC:** none — the endpoint and page are public by design.

## 4. Differentiation
Table-stakes for a serious API (the Stripe/Twilio bar), shipped clean and tied to win #5 (operator-grade): a programmatic endpoint that the human page is *derived from*, so status is single-sourced and honest — with correct HTTP semantics (`503` on down) so it drops straight into any monitor.

## 5. Data Model & Logic
Single source of truth: **`lib/health.ts`** → `getHealthSnapshot(): HealthSnapshot`.
- Components (API Gateway, Identity Engine, Company Graph, Billing & Metering, Webhook Dispatcher, Zinbit Console) each get a deterministic status, latency, and a 60-day daily-status `history` from a stable FNV-1a hash — **no `Math.random`, no wall-clock read** (so tests and re-renders never flicker). Today is always green.
- `uptime` = operational share of the window; overall `status` = worst component; `degraded` = status ≠ operational.
- Invariants (unit-tested in `src/lib/__tests__/health.test.ts`): deterministic; 60-day history per component; status equals today's history entry; uptime = operational/window; overall = worst component; overall uptime = component mean.

## 6. API & Gateway
- **Endpoint:** `GET /api/health` (`app/api/health/route.ts`) — public, `force-dynamic`, `Cache-Control: no-store`, adds a live `checked_at`. Returns `200` (up/degraded) or `503` (down).
- **Not** under `/api/v1`, so the auth + rate-limit middleware (`matcher: '/api/v1/:path*'`) never gates it — health is free and keyless, as it must be.

## 7. UI
- **`/status` page** (`app/status/page.tsx`) refactored to render from `getHealthSnapshot()`: an overall banner (green "All Systems Operational" / amber "Some Systems Degraded" driven by `snapshot.status`), a per-component list with a status dot, label, latency, uptime %, and the 60-day bar graph (green/amber per day), and a `GET /api/health` deep link. Curated incident history retained. Semantic tokens only.
- **States:** the page is static from the deterministic snapshot; a client clock shows "last updated (auto-refreshing)".

## 8. Telemetry
None — health checks are unauthenticated infrastructure calls, not billed product events.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (4 new tests) · `curl /api/health` returns the component snapshot with no key · Playwright smoke: `/status` renders all six components, uptime, and the health-API link.

## 10. Deferred
Live infra metrics; status-change webhooks/subscriptions; incident management tooling; per-region status; a history endpoint.
