# PRD: Source Attribution

> **A cross-cutting layer over every enrichment result** (like field freshness and completeness). Renders a "Sources" panel on every field-carrying result in the Enrichment Studio. No new endpoint, page, or store slice.

**Status:** Built (prototype is the spec) · **Roadmap:** F-043 · **Route:** `/console/studio` (every result with provenance)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Every enrichment result already carries per-field provenance (field / source / signal / confidence), but the `source` is a raw method string ("SMTP verification", "Domain registry"). Buyers, security, and compliance need to know the *named provider* behind each field, its category, its reliability, and the license or lawful basis it's used under — to trust a value, to satisfy procurement, and to document data lineage. Source Attribution turns the opaque per-field source into a real provider attribution, grouped per result.

## 2. Goals & Non-Goals
**Goals**
- Name the **provider** behind every returned field, with its **category** (first-party graph / government registry / partner feed / derived inference), a **reliability**, and the **license / lawful basis**.
- **Group** a result's provenance by provider — which provider supplied which fields, and a per-provider average confidence.
- A **sourcing profile** (counts by category) for a quick read of how first-party vs derived the record is.
- Cross-cutting: applies to **every field-carrying result** (person, company, phone, socials, funding, …) over the same provenance SSOT — so attribution can never contradict the confidence/provenance already shown.

**Non-Goals (this phase)** — a per-provider consent/lawful-basis register with legal text (F-326); a data-provider marketplace (F-489); provider SLAs or cost-per-provider; letting a customer disable a provider; attribution on structured-only results that carry no field provenance.

## 3. Users & Personas
- **Security / Compliance (expand):** documents where each value came from and under what basis.
- **Economic buyer / Procurement (expand):** sees the first-party vs partner vs derived mix behind the data they're buying.
- **Integrating Developer (land):** reads the provider behind a field to decide how much to trust it.
- **RBAC:** inherits the Studio's `admin | developer` gate; a passive display attribute, no mutation.

## 4. Differentiation
Ties to **win #2 (compliance-native)** and **win #5 (operator-grade)**: named-provider attribution with category, reliability, and lawful basis — layered over the existing provenance so it's always consistent with the confidence already shown. Most enrichment APIs return a value with no sourcing; the ones that do rarely name the provider, its category, and its license per field.

## 5. Data Model & Logic
Single source of truth: **`lib/source-catalog.ts`**.
- A `CATALOG` mapping each provenance `source` string to a `SourceProvider` (name, category, reliability, license, description), plus `resolveProvider(source)` which falls back to a **categorized derived/partner/registry/first-party provider** for any unlisted source (keyword-classified) — so a new resolver source is never uncited.
- `attributeSources(provenance): SourceAttribution | null` groups provenance by provider → `providers[]` (each with its `fields`, `avgConfidence`), `providerCount`, `fieldCount`, and `byCategory[]`. Returns null when there's no provenance. Deterministic; **no `Math.random`**.
- Invariants (unit-tested, `src/lib/__tests__/sourceCatalog.test.ts`): null on empty provenance; known sources map to their provider; unlisted sources get a sensible category; every field attributed exactly once; providers sorted by field count; category tally sums to provider count; bounded average confidence; deterministic.

## 6. State / Integration
- **No new store slice, endpoint, or telemetry.** A `withSources` post-processor in `src/data/enrichments.ts` runs in the `toEnrichmentResult` chain (after `withFieldFreshness` and `withCompleteness`), adding an optional `sources?: SourceAttribution` to any result carrying provenance.
- Because it composes over provenance, it covers every current and future field-carrying preset automatically — one catalog, all results.

## 7. UI
- **`SourceAttributionPanel`** (in `app/console/studio/page.tsx`): a "Sources — who supplied each field" section with a category tally (First-party / Registry / Partner / Derived counts) and, per provider, a card showing the provider name, a category badge, its reliability, a one-line description, the field chips it supplied, and its license. Renders only when `result.sources` is present.
- Sits alongside the existing confidence rail (per-field provenance) — complementary: the rail shows field → signal → confidence; this groups field → provider → license.
- **States:** a success-state adornment; the Studio's existing loading/empty/error states apply. Semantic tokens only; light + dark; Framer Motion.

## 8. Telemetry
No new event — attribution is a passive display over data the `enrichment_run` event already records.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (source-catalog suite + a view-model dispatch test + suite) · isolated build green · live Studio walkthrough (a person result attributes email→SMTP Verification, company→WHOIS Registry, title→Professional Graph, each with category, reliability, and license).

## 10. Deferred
Consent / lawful-basis register (F-326); data-provider marketplace (F-489); provider SLAs / cost; customer-configurable providers; attribution on structured-only results.
