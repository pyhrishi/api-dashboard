# PRD: Regional API Endpoints

> Pin your API traffic to a region for latency and data residency — call `eu.api.zinbit.zintlr.com` (or `us.`/`in.`) and every request, and the data it touches, stays in one region under that region's compliance regime.

**Status:** Built (prototype is the spec) · **Roadmap:** F-070 (Later → shipped) · **Console:** `/console/api-regions` · **Source:** `lib/regions.ts` (+ `lib/api-config.ts`)
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enterprise buyers — especially in the EU and India — cannot send personal data to a US endpoint. "Where is my data processed?" is a gating procurement question, and a single global host doesn't answer it. The gateway already routes each key to a deterministic home region and refuses cross-border calls (451), but there was no *public regional endpoint* to call and no console surface to see or control residency. Regional API endpoints expose the regional edge (`us.`/`eu.`/`in.` hosts), let an org pin its residency, and prove — with a live latency test — which region actually served a request.

## 2. Goals & Non-Goals
**Goals**
- Publish region-pinned API hosts (US/EU/IN) alongside the global smart-routed host, from the one API-config source of truth.
- Show each region's endpoint, location, compliance frameworks, and a **live** latency test that reads back the served region.
- Let admins set a per-org **data-residency pin**; surface which edge the account's keys resolve to (matching the gateway).

**Non-Goals (this phase)** — physically isolated regional processing (F-452); per-key residency provisioning UI (keys carry `dataResidency` gateway-side); automatic nearest-region geo-detection from the browser; multi-region failover (F-438); a regional status/uptime page.

## 3. Users & Personas
- **Enterprise compliance / security (expand):** confirms data residency and pins the org to EU/IN — the enterprise control.
- **Developers (land):** copy the regional base URL, run a latency test, call `eu.api…/v1/…` — the 10-minute win.
- **RBAC:** page visible to `admin | developer | billing`; **only admins** change the residency pin (gated in the UI and the store action).
- **Multi-tenant:** the residency pin is tenant-scoped, so it swaps per organization.

## 4. Differentiation
Ties to **Win #2 (compliance-native)** and **Win #3 (India-strong)**. Incumbents bolt on residency as an enterprise afterthought; here it's a first-class, self-serve surface backed by the *same* gateway that already enforces cross-border 451s — and the console's region resolution is the *same key-hash derivation* the gateway uses, so what the console shows is exactly where a request is served. The India (Mumbai/DPDP) edge is a first-class peer of US/EU, not an afterthought.

## 5. Data Model & Logic
Single source of truth: **`lib/regions.ts`** (+ regional host constants in `lib/api-config.ts`), deterministic, no `Math.random`.
- `REGIONS` — the three regions (`us-east-1`/`eu-west-1`/`ap-south-1`) with host, label, city/country, `residency` code (US/EU/IN), compliance frameworks, and a baseline latency. Hosts come from `api-config`'s `REGIONAL_API_HOSTS`.
- `resolveRegionForKey(key)` — the key's home region, computed with the **exact key hash the gateway uses** (`app/api/v1/[...route]/route.ts`), so console and gateway agree.
- `regionalBaseUrl(id, env)`, `regionForResidency(code)` (the gateway's residency→region rule), `isCrossBorder(pinned, target)`.
- **State (Zustand, tenant-scoped, persisted):** `dataResidencyRegion: RegionId | null` (null = auto/global) + `setDataResidencyRegion(region)` — admin-only, audit-logged (`residency.region_pinned`), part of `TenantState`/`extractTenantState`/`defaultTenantState` so it snapshots and resets on org switch.
- Invariants (unit-tested, `src/lib/__tests__/regions.test.ts`, 8 tests): region catalog integrity (hosts from api-config, residency codes, compliance); `resolveRegionForKey` deterministic **and equal to an independent re-impl of the gateway hash**; regional base URLs (no `/v1`, global sandbox); residency→region map (EU→GDPR, IN→DPDP); cross-border detection; store slice pin/clear tenant-scoped + non-admin block.

## 6. API & Gateway
No new endpoint — the feature reuses the **real** gateway. The console's latency test sends `GET /api/v1/_ping` with `x-force-region: <id>` and reads the `X-Region` / `X-Served-By` response headers (set before billing, so the probe is free and returns `404` at 0 credits) while timing the round-trip. Residency enforcement (451 cross-border) is the gateway's existing behavior against a key's `dataResidency`; the console's pin is the org-level policy that mirrors it.

## 7. UI
`/console/api-regions` — composed from `components/ui`, semantic tokens only.
- **Header** + a Regional Coverage cross-link; a "your keys resolve to <region>" card; a **residency-policy** card with an Auto/US/EU/IN `SegmentedControl` (admin-gated).
- **Three region cards:** label, city/country, compliance badges, the copyable endpoint host, a description, and a **live latency test** ("Test" → real ping → "served `<region>` · `<ms>`"); a "Pinned" / "Your keys" badge, and a cross-border warning when the region is outside the residency pin.
- A copyable **curl** snippet against the pinned/resolved region's host.
- **States:** no-key empty state (→ create a key); loading skeleton; per-card testing spinner; probe-error state; toast on pin change. Framer Motion on card entrances.

## 8. Telemetry
`api_regions_viewed` (view), `region_latency_tested {region, latencyMs, served}` (test), `data_residency_pinned {region}` (pin) — via `lib/telemetry.ts`. **PLG hook:** the residency pin is an enterprise expansion signal.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (8 new tests) · `next build` green (new `/console/api-regions`) · Playwright smoke (`e2e/api-regions.spec.ts`) · live gateway smoke: `GET /api/v1/_ping` with `x-force-region: eu-west-1` → `X-Region: eu-west-1`, `X-Served-By: zinbit-node-eu-west-1-*`, 0 credits.

## 10. Deferred
Per-key residency provisioning UI; browser geo nearest-region detection; multi-region failover (F-438); physically isolated regional processing (F-452); a regional status/uptime page; sandbox regional hosts.
