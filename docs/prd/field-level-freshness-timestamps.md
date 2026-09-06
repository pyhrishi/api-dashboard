# PRD: Field-Level Freshness Timestamps

> **A cross-cutting layer on the Enrichment Studio result view-model** (see `enrichment-studio.md`). Not a preset — it stamps every field of every result, so it applies to all lookups at once.

**Status:** Built (prototype is the spec) · **Roadmap:** F-040 (Now) · **Surface:** `/console/studio` result card (all presets)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriched data decays at different rates per attribute — a title changes yearly, a direct dial monthly, a company HQ rarely. Incumbents stamp one "last updated" date on the whole record, which hides which specific fields are stale. A developer wiring enrichment into a workflow, and a RevOps lead trusting it for routing, both need to know *per attribute* what's fresh and what to re-verify. Field-Level Freshness Timestamps put a last-verified date and a fresh/aging/stale tier on every field.

## 2. Goals & Non-Goals
**Goals**
- Every result field carries its own **`verifiedAt`** date and a **fresh / aging / stale** tier — not one date for the record.
- Rendered as a compact, color-coded freshness chip ("verified 12d ago") on every field in the Studio result card.
- **Cross-cutting:** applies to every preset (person, company, phone, socials, title, firmographics, deliverability, domain-auth) through one post-processor, so new presets get it for free.
- Deterministic per field (stable seed, **never a wall-clock read**), so the same result always shows the same dates across Studio, Explorer, and CLI.

**Non-Goals (this phase)** — real source-timestamp tracking (synthetic, deterministic mock); a re-verify action/endpoint; freshness-based filtering or alerts; per-field freshness in exports or the history list (result card only this phase).

## 3. Users & Personas
- **Integrating Developer (land):** sees at a glance which fields to trust before acting on them.
- **RevOps / Data Leader (expand):** gauges data decay per attribute to plan re-enrichment.
- **Security / Compliance (expand):** freshness supports audit of how current each attribute is.
- **RBAC:** none new — inherits the Studio's read path.

## 4. Differentiation
Tied to win #5 (operator-grade): per-attribute freshness with an at-a-glance tier, versus the industry-standard single record date. Cheap to render, high signal, and cross-cutting so it strengthens every existing lookup rather than adding one more.

## 5. Data Model & Logic
Lives in **`src/data/enrichments.ts`**.
- `EnrichmentField` gains optional `verifiedAt?: string` and `freshness?: FieldFreshness` (`'fresh' | 'aging' | 'stale'`).
- `toEnrichmentResult` is now a thin wrapper: it calls the internal `buildEnrichmentResult` (the per-preset dispatch, unchanged) and then `withFieldFreshness`, which stamps each field from a deterministic FNV-1a hash of `title|label|value`.
- `fieldFreshness(seed)`: `daysAgo = hash % 160`; `verifiedAt = FRESHNESS_NOW − daysAgo`; tier is ≤30 fresh, ≤90 aging, else stale. `FRESHNESS_NOW` is a fixed demo clock (2026-09-06), never `Date.now()`.
- `freshnessAgeLabel(verifiedAt)` (exported) renders "today" / "Nd ago" / "Nmo ago" / "Ny ago".
- Invariants (unit-tested in `src/lib/__tests__/fieldFreshness.test.ts`): every field stamped; deterministic; dates never in the future; tier matches age; label formatting.

## 6. API & Gateway
No endpoint or gateway change — this is a presentation-layer enrichment of the shared view-model. A field that already carries a `verifiedAt` (future per-field source data) is left untouched.

## 7. UI
- **Studio `ResultCard` field grid** (`app/console/studio/page.tsx`): each field's label row is now a flex row with a right-aligned freshness chip — a color-coded dot (green fresh / amber aging / muted stale) plus the relative age, with the exact date on hover. Truncates gracefully; no layout shift.
- **States:** freshness only renders on `ok` results; loading/empty/error unchanged.

## 8. Telemetry
Reuses the Studio's `enrichment_run` event. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (5 new tests + existing suites) · Playwright smoke: Studio firmographic result shows per-field freshness chips (NAICS "19d ago" fresh, SIC "2mo ago" aging) with color-coded tiers.

## 10. Deferred
Real source timestamps; a one-click re-verify action; freshness filters/alerts; per-field freshness in exports, the history list, and Bulk Jobs.
