# PRD: Person Demographic Append

> Append a contact's professional demographics from an email — seniority, function, decision-making role, tenure, education, skills — with protected characteristics excluded by design.

**Status:** Built (prototype is the spec) · **Roadmap:** F-014 (Later → shipped) · **Studio preset:** `demographics` · **Source:** `lib/demographic-resolver.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Lead scoring and routing need to know *what kind of role* a contact holds — seniority, function, whether they're a decision-maker, how experienced they are. Enrichment tools that fill this in often also infer *protected* characteristics (gender from a first name, age from a graduation year), which is a discrimination and privacy liability under GDPR/DPDP/EEOC. Teams want the professional signals without the legal risk.

## 2. Goals & Non-Goals
**Goals**
- Append professional/career demographics from an email: seniority tier, department, function, management level, decision-maker + buying role, experience + tenure, education, skills, seniority score.
- **Never** infer protected characteristics, and declare that explicitly in the response.
- Keep it coherent with a direct person lookup.

**Non-Goals (this phase)** — any protected-attribute inference (excluded by design); a bespoke Studio panel (renders through the standard result card); batch demographic append; user-editable taxonomies.

## 3. Users & Personas
- **Developer / RevOps (land):** appends seniority + decision-maker + buying role to score and route leads — the 10-minute win.
- **Compliance / security (expand):** needs a provider that provably excludes protected attributes (Win #2, compliance-native).
- **RBAC:** the Studio is `admin | developer`.

## 4. Differentiation
The angle is **Win #2 (compliance-native)**: we append *professional* demographics only and return an `excluded_attributes` list naming exactly what we refuse to infer (age, gender, race/ethnicity, religion, marital status, nationality). Incumbents that guess gender/age create discrimination risk; making the exclusion explicit and contractual is a trust differentiator no one else foregrounds. And because the professional taxonomy reuses the platform's title normalizer, it never disagrees with a direct lookup.

## 5. Data Model & Logic
Single source of truth: **`lib/demographic-resolver.ts`** — `appendDemographics(email)`, deterministic (no `Math.random`), built on `resolvePersonFromEmail` + `normalizeJobTitle`.
- Returns `null` for personal / unresolvable emails.
- Professional taxonomy (seniority, function, department, management level, decision-maker) comes from `normalizeJobTitle` — so it agrees with `title-normalize` and person lookups.
- Derived deterministically from the email hash, anchored to seniority: years of experience (with a band), years at company / in role, education level + field of study (skewed by function + seniority), function-specific skills, buying role, and a 0–100 seniority score (tier + decision authority + experience).
- `excluded_attributes` is a fixed list of protected characteristics that are never inferred.
- Invariants (unit-tested, `lib/__tests__/demographicResolver.test.ts`, 6 tests): determinism; personal-email null; the protected-attributes-excluded contract (declared *and* absent as fields); a coherent profile (tier 1–7, tenure ≤ company ≤ experience, ≥3 distinct skills, score 0–100, valid buying role); C-suite scoring; experience banding.

## 6. API & Gateway
- `GET /v1/people/demographics?email=…` (catalog entry, 2 credits) → the `PersonDemographics` object. Resolved in `src/lib/sandboxAPI.ts` via a `people-demographics` case (returns `NO_PROFILE` for personal/unresolvable emails). No route.ts change — a normal catalog endpoint.

## 7. UI
- **Enrichment Studio** preset `demographics` (`IdCard` icon, person category, `src/data/enrichments.ts`): `demographicToResult` renders a person result card — badges (seniority, decision-maker, buying role, score), fields (seniority + tier, department, management level, buying role, experience + band, tenure, education, **Excluded by design**), and skills as chips. Dispatched on a distinctive shape (`seniority_tier` number + `excluded_attributes` array), placed *before* the title check (it also carries `canonical_title` + `seniority`). Renders through the standard result card — no bespoke panel. Every run emits the central `enrichment_run` event.

## 8. Telemetry
Covered by the Studio's central `enrichment_run` (`preset: 'demographics'`) — the platform pattern for field-based enrichments (bespoke events are reserved for structured-panel views).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (6 new tests) · live gateway smoke: `jane.doe@acme.com` → C-Suite (tier 7), Executive function, decision_maker, 16–20 yrs, score 100, exec skills, and the `excluded_attributes` list.

## 10. Deferred
Any protected-attribute inference (excluded by design); a bespoke Studio panel (seniority ladder viz); batch append; confidence per-field; linking to the buying-committee / org graph.
