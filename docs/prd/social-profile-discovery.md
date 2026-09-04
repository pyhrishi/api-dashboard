# PRD: Social Profile Discovery

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Social profiles" preset — no separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-007 (Now) · **Route:** `/console/studio` (preset `email-to-social`)
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A contact is more than an email. Sales, recruiting, and developer-relations teams want the person's *whole* professional footprint — where to reach them, what they build, what they publish — but incumbents (Clearbit, PDL) return a thin LinkedIn URL and stop, skipping the platforms that matter for technical audiences (GitHub, Stack Overflow) and offering no per-platform confidence. Social Profile Discovery turns one email into a person's cross-platform presence, each profile carrying a handle, verification, a reach signal, and a match confidence.

## 2. Goals & Non-Goals
**Goals**
- One email in → the person's social profiles out: LinkedIn, GitHub, X, Stack Overflow, Medium, and personal sites.
- Per-platform **handle, verification, follower/reputation signal, and confidence**, plus clickable profile links and cross-platform **provenance** (how the accounts were correlated to one identity).
- Deterministic: the same email always fans out to the same profiles (Studio, Explorer, CLI).
- Reuses `GET /v1/people/social` (2 credits), the generic `enrichments` slice/history, and the Studio renderer — no new page, nav, or store slice.

**Non-Goals (this phase)** — bulk/CSV social append (that is Bulk Enrichment Jobs); real social-graph integration (synthetic, deterministic mock); follower-history/time-series; writing profiles back to a CRM; scraping post content.

## 3. Users & Personas
- **Integrating Developer (land):** appends a contact's social footprint in one call; copies JSON/cURL; sees the call in Logs.
- **RevOps / Data Leader (expand):** reads platform coverage + confidence to gauge channel reach.
- **Security / Compliance (expand):** profiles are public data; per-platform provenance and confidence make sourcing auditable.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Largely **table-stakes** (everyone appends socials), shipped clean with two points of polish that tie to win #5 (operator-grade): **breadth** into developer-relevant platforms incumbents skip (GitHub, Stack Overflow), and **per-platform confidence + cross-platform provenance** instead of an opaque URL list.

## 5. Data Model & Logic
Single source of truth: **`lib/social-resolver.ts`** → `discoverSocialProfiles(email): SocialDiscovery | null`.
- Builds on `resolvePersonFromEmail` for the base identity and its LinkedIn/GitHub/X links, then derives additional platforms and reach signals from a deterministic FNV-1a hash of the normalized email — **no `Math.random`**.
- `SocialDiscovery`: `email`, `full_name`, `profiles: SocialProfile[]`, `platform_count`, `confidence`, `last_verified`, `provenance[]`.
- `SocialProfile`: `platform`, `handle`, `url`, `verified`, `confidence`, `followers?`, `headline?`, `primary`.
- Invariants (unit-tested in `src/lib/__tests__/socialResolver.test.ts`): deterministic per normalized email; LinkedIn is always the single `primary` and `verified`; `platform_count === profiles.length`; every `confidence ∈ (0, 0.99]`; every `url` is absolute.

## 6. API & Gateway
- **Endpoint:** `GET /v1/people/social` (catalog id `email-to-social`, `src/data/endpoints.ts`), param `email`, **2 credits**.
- **Mock:** `src/lib/sandboxAPI.ts` `email-to-social` case returns `{ success, ...SocialDiscovery }`; a null resolve returns `NOT_FOUND`.
- **Masking:** profiles are public handles, so no PII masking applies; sandbox and live both return full data.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `socialToResult` branch, selected when the response carries a `profiles` array + `platform_count`.
- **Result card** (existing Studio `ResultCard`): title = name; a platform-count badge; subtitle = "N social profiles discovered"; each profile is a field (handle · followers, with a verified check) and a clickable link; right rail = confidence % + bar + cross-platform provenance.
- **Preset:** "Social profiles" (`Share2` icon, person category). **States:** loading, empty (preset prompt), not-found (`No result`), success (the card).

## 8. Telemetry
Reuses the Studio's run event recorded in the shared `enrichments` slice. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (5 new tests + existing sandbox/enrichment suites) · Playwright smoke: Studio "Social profiles" renders the multi-platform card with links and confidence.

## 10. Deferred
Bulk social append; real social-graph sources; follower-history; CRM write-back; per-post activity detail.
