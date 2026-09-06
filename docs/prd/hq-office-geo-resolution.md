# PRD: HQ & Office Geo-Resolution

> A domain-in, geography-out enrichment: `GET /v1/companies/offices` and its Enrichment Studio preset, both reading one deterministic source (`lib/hq-geo-resolver.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-013 (Next → shipped) · **Endpoint:** `GET /v1/companies/offices` · **Preset:** Studio → "HQ & office geo"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The company dossier already carries an HQ city, country, and timezone — but as strings, not as geography you can act on. Sales and ops need the *precise* HQ (a geocoded address, coordinates, timezone) and the *footprint* (which offices exist, where, how big) — and, above all, the answer to "when can I reach them." HQ & office geo-resolution promotes location to a first-class enrichment: a geocoded HQ, a functional office list, and derived reach signals including a UTC outreach window.

## 2. Goals & Non-Goals
**Goals**
- `GET /v1/companies/offices?domain=` returns a geocoded HQ (street, region, postal, ISO country, lat/lng, IANA timezone, UTC offset) and an office list by function with headcount and coordinates.
- Derive reach signals: country/continent counts, follow-the-sun coverage, and the best UTC window to reach HQ.
- Ship as a one-input Studio preset with a geo footprint panel and **live local clocks** per office.
- Deterministic and **coherent** — anchored to the company dossier's own HQ city/country/timezone.

**Non-Goals (this phase)** — real geocoding against a live address database; an interactive/tiled map render; per-office contact routing; distance/travel calculations; registered legal-entity addresses distinct from operating offices.

## 3. Users & Personas
- **GTM / SDR (expand):** reads the live local clocks and UTC window to time outreach; sees which region owns which function.
- **RevOps / territory planning:** uses the office footprint + headcount split to assign accounts.
- **Integrating developer (land):** one call appends geocoded HQ + offices to a CRM record.
- **RBAC:** none beyond a standard authenticated key; billed one credit like other company enrichments.

## 4. Differentiation
Table-stakes as a data field (everyone returns an HQ) — the angle is **actionability**: geography is rolled into a UTC outreach window and follow-the-sun coverage, and the UI shows each office's live local time so "when can I call them" is answered at a glance. Coherence is the moat: HQ, timezone, and headcount all derive from the same deterministic company graph the dossier, firmographics, and technographics use, so location never contradicts the rest of the record.

## 5. Data Model & Logic
Single source of truth: **`lib/hq-geo-resolver.ts`** → `resolveOfficeGeography(domain): OfficeGeography | null`.
- Builds on `resolveCompanyFromDomain` for the HQ city/country/timezone (the SSOT), then geocodes via a `CITY_GEO` reference table (lat/lng, region, ISO country, continent, UTC offset, postal prefix) for every city in the company-resolver location pool.
- Office count scales with headcount (1 site under 50 employees → up to 5 for 8,000+), capped by the city pool. Satellite cities are chosen by a deterministic rotation; each satellite gets a function (Engineering → Sales → Support → Remote hub).
- Headcount splits HQ ~45% / satellites weighted, with the last office absorbing the rounding remainder so office headcounts **sum to the company total**. Street numbers and postal codes are FNV-1a-seeded — **no `Math.random`, no wall-clock read**.
- Reach: country/continent counts; `follow_the_sun` = ≥3 continents or a ≥9h offset span; `outreach_window_utc` = HQ 09:00–17:00 local expressed in UTC.
- Returns `null` for invalid, personal-mailbox, or non-referenced-city domains.
- Invariants (unit-tested, `src/lib/__tests__/hqGeoResolver.test.ts`, 7 tests): deterministic; HQ anchored to the dossier + valid coordinates; exactly one HQ, no duplicate cities, headcounts sum to total; well-formed UTC window; and the full dispatch into an `officeGeo` view-model.

## 6. API & Gateway
- **Endpoint:** `GET /v1/companies/offices` (catalog entry in `src/data/endpoints.ts`; mock case in `src/lib/sandboxAPI.ts`), 1 credit. Runs the real gateway pipeline (auth, rate-limit, billing) like every `/v1` route. No PII, so output is stable across sandbox/live.
- Invalid/personal domains return `INVALID_DOMAIN`.

## 7. UI
- **Enrichment Studio preset** "HQ & office geo" (`src/data/enrichments.ts` — preset + `officeGeoToResult` + dispatch on an `offices` array + an `hq` object). Rendered by a new `OfficeGeoPanel` in the Studio `ResultCard`:
  - A **reach summary** (offices · countries · continents · HQ UTC window) and a follow-the-sun badge when applicable.
  - An **office list**: HQ highlighted in teal, each row with function, address, headcount, coordinates, and a **live local clock** (open/closed) that ticks every 30s — the local time is derived from the office's real UTC offset, not random.
- KPI fields (HQ, address, coordinates, timezone, offices, best window) render in the standard field grid. Semantic tokens only; motion on row entrance.
- **States:** loading spinner during the call; the standard "no result" empty state for invalid/personal domains; error panel on 402/429/5xx — inherited from the Studio.

## 8. Telemetry
Emits `enrichment_run` (generic) plus a typed **`offices_resolved`** event (`lib/telemetry.ts`) with `{ offices, countries, continents, followTheSun, environment }` on success — so footprint shape and international coverage land in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (7 new tests, incl. the dispatch chain) · isolated `NEXT_DIST_DIR=.next-verify next build` green. Live curl is IP-gated (`::1`, SOC 2 policy) as for all `/v1` routes; the browser same-origin Studio path is the live surface.

## 10. Deferred
Real geocoding; an interactive map render; per-office contact routing; travel/distance calculations; legal-entity vs. operating-address distinction; a "reach me now" cross-office overlap window.
