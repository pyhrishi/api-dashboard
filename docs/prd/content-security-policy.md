# PRD: Content-Security-Policy

> The console ships a real, browser-enforced Content-Security-Policy — delivered by the edge middleware on every page, rolled out safely in report-only mode with a live in-product violation feed, and switchable to enforce with one admin toggle that actually changes the served header.

**Status:** Built — phase 1 (prototype is the spec) · **Roadmap:** F-315 · **Routes:** `/console/csp`, `POST|GET /api/csp-report`, CSP header on all page navigations (middleware)
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The console shipped **no** Content-Security-Policy: the `default-src 'none'` in `gateway/security.ts` protects JSON *API* responses, but the HTML pages a browser renders had nothing guarding against XSS or clickjacking. F-315 adds a real CSP to the console app — but does it the correct way for a live product: **report-only by default** (never blocks) with an observable violation feed, so the policy can be tuned before an admin flips it to **enforce**.

## 2. Goals & Non-Goals
**Goals**
- **A real CSP on every page**, delivered by the edge middleware — `default-src 'self'`, `frame-ancestors 'none'` (clickjacking), `object-src 'none'`, `base-uri 'self'`, scoped `script/style/img/font/connect-src`, plus defense-in-depth headers (nosniff, Referrer-Policy, Permissions-Policy).
- **Safe rollout:** report-only by default; enforce is opt-in via a cookie the middleware reads, so the console toggle genuinely changes the served header (`Content-Security-Policy-Report-Only` ↔ `Content-Security-Policy`).
- **Observability:** a real `/api/csp-report` collector (both legacy `application/csp-report` and Reporting API batch shapes), aggregated by directive + blocked host, surfaced as a live feed.
- **A test path:** a "trigger test violation" that fires a genuinely-blocked cross-origin resource so a real report lands.
- **Edge-safe + deterministic:** the SSOT is pure (no zustand/Node) so middleware can import it; report ids are FNV-derived.

**Non-Goals (this phase)** — a strict nonce-based enforcing policy (the console is largely statically prerendered, so inline scripts can't carry a per-request nonce; the SSOT generates a nonce + exposes `x-nonce` for the documented dynamic-hardening path, but the shipped policy relies on `'unsafe-inline'`); per-route policies; persisting violations beyond the per-isolate buffer; hash-based script allowlisting. **Deferred to phase 2** (blocked only by another session's concurrent edits to the shared files): telemetry wiring, nav row, roadmap BUILT, changelog.

## 3. Users & Personas
- **Security/IT admin (expand):** turns the enterprise XSS/clickjacking control on, watches the feed go quiet, then enforces — the concrete answer to a pen-test finding or vendor questionnaire.
- **Developer (land):** sees the exact policy and every violation in-product instead of digging through response headers or the browser console.
- **RBAC:** page viewable by `admin | developer | billing`; **the mode toggle (report-only ↔ enforce) is admin-only**; the policy + feed + test are visible to all.

## 4. Differentiation
Ties to **win #6 (enterprise-grade security)**. Table-stakes hardening, shipped with depth others skip: it's *observable* (a live violation feed + directive/host aggregation), *safely rolled out* (report-only first), and *genuinely toggleable* (a cookie the edge middleware honors — not a decorative switch). The same pure SSOT builds the header in middleware, renders it in the console, and parses reports — one policy, no drift.

## 5. Data Model & Logic
Single source of truth: **`lib/csp.ts`** (pure, Edge-safe — no zustand, no Node).
- `CSP_DIRECTIVES` (explicit, self-describing), `buildCspHeader({ nonce?, reportPath? })` (drops `'unsafe-inline'` and pins the nonce when one is passed), `cspHeaderName(mode)`, `reportToHeader`, `hardeningHeaders`, `generateNonce` (Web Crypto, Edge-safe), `parseViolationReport` (both report shapes + batches; never throws), `CSP_MODE_COOKIE` / `CSP_REPORT_PATH` / `CSP_REPORT_GROUP` constants, `CspMode`/`CspViolation` types (no `any`).
- **`src/lib/gateway/cspReports.ts`** — per-isolate capped ring buffer (`recordViolations`, `getCspReportStats` with by-directive + top-blocked aggregation, `__resetCspReports`), seeded with realistic samples.
- No Zustand store: mode is a **cookie** (so the Edge middleware can honor it); the policy itself is fixed in the SSOT this phase.

## 6. State / Integration
- **`middleware.ts`** (broadened matcher to page routes, excluding `/api`, Next internals, and static files): `applyConsoleCsp` sets `Content-Security-Policy[-Report-Only]` + `Report-To` + hardening headers and forwards `x-nonce`; the `/api/v1` auth+rate-limit branch is unchanged; fully defensive (never 500s).
- **`app/api/csp-report/route.ts`** — a standalone (keyless, un-gated) collector: `POST` parses + records, `GET` returns stats for the feed.
- **Console** `/console/csp`: mode banner + admin toggle (writes the cookie), KPIs, the rendered policy string + per-directive cards, a "trigger test violation" button (a real cross-origin image load), and the live violation feed. Cross-links to Encryption / Firewall / Security Hub.
- **Phase-2 wiring (deferred, see §2):** telemetry, nav row, roadmap/changelog.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, SegmentedControl, StatusBadge, Button, EmptyState, Skeleton). **Loading** — feed skeletons. **Report-only / Enforce** — distinct banner treatment; enforce shows a warning. **Empty** — no violations (with a test-trigger CTA). **Error** — collector unreachable (retry). **Non-admin** — mode shown read-only. Framer Motion on incoming violations. Semantic tokens; light + dark.

## 8. Telemetry (phase 2)
`csp_viewed`, `csp_mode_changed`, `csp_violation_reported`, `csp_test_fired` — stubbed at the call sites now (TODO), emitted once the telemetry union lands with the phase-2 wiring.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**13-case** suite: policy build incl. nonce/unsafe-inline handling, header-name-by-mode, Report-To, hardening headers, both report shapes + garbage, collector seed/record/aggregate) · Playwright smoke (`e2e/csp.spec.ts`) · live: a real page navigation carries `Content-Security-Policy-Report-Only` with `frame-ancestors 'none'` + `report-uri`, and `GET /api/csp-report` returns stats.

## 10. Deferred
Phase-2 integration (§2/§6/§8); nonce-based enforcing CSP once pages render dynamically; per-route/per-environment policies; durable violation storage + alerting; Trusted Types; Subresource Integrity for any external scripts.
