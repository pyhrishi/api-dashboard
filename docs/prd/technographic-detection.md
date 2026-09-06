# PRD: Technographic Detection

> A domain-in, stack-out enrichment: `GET /v1/companies/technographics` and its Enrichment Studio preset, both reading one deterministic source (`lib/technographic-resolver.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-006 (Next → shipped) · **Endpoint:** `GET /v1/companies/technographics` · **Preset:** Studio → "Technographic detection"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Firmographics (who a company is) and technographics (what it runs) are the two halves of company intelligence. Zinbit already resolves a full company dossier and a firmographic classification layer, but the tech stack was a flat list buried in the dossier. Technographic detection promotes it to a first-class enrichment: categorized, evidenced (how each technology was detected), and — crucially for GTM — interpreted into buying signals. This is the difference between "they use Snowflake" and "they have an active data-modernization budget."

## 2. Goals & Non-Goals
**Goals**
- `GET /v1/companies/technographics?domain=` returns a categorized stack, each technology with a detection **method**, vendor, confidence, and first/last-seen dates.
- Derive **GTM signals** from the stack mix (modernization, GTM motion, security posture, gaps), a 0–100 sophistication score, and an estimated stack spend.
- Ship as a one-input Studio preset with a rich, category-grouped render.
- Deterministic and **coherent** — enrich the company dossier's own `tech_stack`, never a divergent one.

**Non-Goals (this phase)** — live web-crawl/BuiltWith-style scanning of real sites; per-page technology diffing; competitor-alerting on stack changes; a technology-to-company reverse index ("who uses Datadog?" — that's a separate prospecting feature); confidence from real fingerprints.

## 3. Users & Personas
- **GTM / RevOps (expand):** reads the derived signals and spend band to prioritize and message accounts.
- **Integrating developer (land):** one call appends a categorized stack to a CRM/enrichment pipeline.
- **Competitive/partnerships:** sees which vendors an account already runs.
- **RBAC:** none beyond the standard authenticated key; billed one credit like other company enrichments.

## 4. Differentiation
Table-stakes as a data field (Clearbit/ZoomInfo expose technographics) — our angle is **interpretation**: every detection is evidenced with a method + dates, and the stack is rolled up into buying signals and a spend estimate, tying tech data to a sales action. Coherence is the moat: the technographic profile is derived from the same deterministic company graph the dossier and firmographics use, so the three never contradict each other.

## 5. Data Model & Logic
Single source of truth: **`lib/technographic-resolver.ts`** → `detectTechnographics(domain): TechnographicProfile | null`.
- Builds on `resolveCompanyFromDomain` for the base `tech_stack` (the SSOT), then maps each technology through a `TECH_CATALOG` → `{category, vendor, method, premium}`. Unknowns fall back to a default entry.
- Per detection: a deterministic FNV-1a hash of `domain:tech` seeds a first-seen (180–1580 days ago), a recent last-seen (≤21 days), and a method-weighted confidence — **no `Math.random`, no wall-clock read**.
- Rollups: categories in canonical order, only those present. Composite `sophistication` = f(category breadth, premium count, total). `estimated_stack_spend` = f(premium count, headcount).
- Signals: presence-based, priority-ordered, capped at 4 (data warehouse → cloud-native → GTM motion → identity → observability gap), with a guaranteed fallback.
- Returns `null` for invalid or personal-mailbox domains (no corporate stack).
- Invariants (unit-tested, `src/lib/__tests__/technographic.test.ts`, 7 tests): deterministic; detections equal the company's own stack; valid method/confidence/dates with first < last; category counts sum to total; 1–4 signals; sophistication in [0,100]; and the full dispatch into a `technographic` view-model.

## 6. API & Gateway
- **Endpoint:** `GET /v1/companies/technographics` (catalog entry in `src/data/endpoints.ts`; mock case in `src/lib/sandboxAPI.ts`), 1 credit. Runs the real gateway pipeline (auth, rate-limit, billing) like every `/v1` route. Sandbox returns full data; live masks per policy (no PII here, so output is stable across environments).
- A structurally invalid or personal domain returns `INVALID_DOMAIN`.

## 7. UI
- **Enrichment Studio preset** "Technographic detection" (`src/data/enrichments.ts` — preset + `technographicToResult` + dispatch on a `detections` array + numeric `sophistication`). Rendered by a new `TechnographicPanel` in the Studio `ResultCard`:
  - A **sophistication bar** (0–100) with the estimated stack spend.
  - The **category-grouped stack**: each category with an icon, count, and its technologies as chips — premium platforms highlighted in teal, each chip's title showing vendor · method · confidence · first-seen.
  - A **buying & intent signals** panel, tone-coded (teal modernization, success GTM/security, warning gap).
- Semantic tokens only; motion on the bar and chips. KPI fields (technologies, categories, sophistication, spend, industry, signal count) render in the standard field grid.
- **States:** loading spinner during the call; the standard "no result" empty state for personal/invalid domains; error panel on 402/429/5xx — all inherited from the Studio.

## 8. Telemetry
Emits `enrichment_run` (generic) plus a typed **`technographic_detected`** event (`lib/telemetry.ts`) with `{ technologies, categories, signals, sophistication, environment }` on success — so adoption and stack-shape distribution land in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (7 new tests, incl. the dispatch chain) · isolated `NEXT_DIST_DIR=.next-verify next build` green. Live curl is IP-gated (`::1`, SOC 2 policy) as for all `/v1` routes; the browser same-origin Studio path is the live surface.

## 10. Deferred
Real fingerprint-based scanning; stack-change alerting/webhooks; a reverse "who-uses-X" prospecting index; technology adoption trends over time; per-technology spend breakdown.
