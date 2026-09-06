# PRD: Name Canonicalization

> **A preset in the Enrichment Studio** + the single source of truth for name normalization across the product. Ships at `/console/studio` as "Canonicalize name" (`canonicalize` preset), backed by a real endpoint.

**Status:** Built (prototype is the spec) · **Roadmap:** F-030 · **Route:** `/console/studio` (preset `canonicalize`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The same person's name shows up a dozen ways: "SMITH, John", "bob mcdonald", "Dr. josé garcía jr.", "Jhon Smith". Before you can match, dedupe, or display a name, you need one canonical form. Name Canonicalization turns any spelling, casing, ordering, or accenting into a single normalized name plus its parsed components — and becomes the one place the product decides what "canonical" means, so matching and de-duplication never disagree.

## 2. Goals & Non-Goals
**Goals**
- One messy name in → a **canonical "First [Middle] Last"**, an **ASCII-folded** form, a **formal** form (with prefix + suffix), and parsed **components** (prefix / first / middle / last / suffix).
- Handle **nickname expansion** (Bob→Robert), **common typos** (Jhon→John), **"Last, First" reordering**, **ALL-CAPS**, **diacritics** (José→Jose), and **surname casing** (McDonald, O'Brien, van der Berg).
- A transparent **change log** of every transformation and a confidence.
- **SSOT:** fuzzy matching (F-024) and entity de-dup consume the same normalization, so a name is canonicalized identically everywhere.

**Non-Goals (this phase)** — gender inference; culture-specific name-order rules beyond Western + particles; transliteration of non-Latin scripts; a learned nickname model (curated dictionary for now); company-name canonicalization (that's firmographics/fuzzy).

## 3. Users & Personas
- **RevOps / Data (land):** standardizes a name column before import, match, or dedup.
- **Integrating Developer (expand):** canonicalizes user input before storing or comparing.
- **Sales (expand):** cleans a pasted name for display.
- **RBAC:** the Studio's `admin | developer` gate; read-only.

## 4. Differentiation
**Table-stakes normalization, shipped with real parsing and full transparency** (win #5): prefix/suffix extraction, Mc/Mac/O'/particle casing, diacritic folding, and nickname expansion — with a per-transformation change log — not a naive title-case. The architectural point of care: it's the **SSOT** that fuzzy match and dedup import (`canonicalNameString`, `NICKNAMES`), so the product can never disagree about a name's canonical form.

## 5. Data Model & Logic
Single source of truth: **`lib/name-canonicalizer.ts`**.
- `canonicalizeName(raw): NameCanonicalization | null` (null only on empty input).
- `canonicalNameString(raw): string` — the simple "First [Middle] Last" other features share; `NICKNAMES` / `NAME_TYPOS` exported.
- **Pipeline:** trim/collapse → detect & reorder "Last, First" → extract prefix (Dr./Mr.…) + suffix (Jr./III/PhD…) → normalize the given name (typo → nickname → case) → case the surname (Mc/Mac/O'/hyphen/particles) → fold diacritics for the ASCII form → compose canonical / formal / ascii + a `changes[]` log. Deterministic; **no `Math.random`**.
- `NameCanonicalization`: `input`, `canonical`, `ascii`, `formal`, `components`, `nickname_expanded`, `had_diacritics`, `reordered`, `changes[]`, `confidence`.
- Invariants (unit-tested, `src/lib/__tests__/nameCanonicalizer.test.ts`): deterministic; reordering; nickname/typo expansion; prefix/suffix extraction; diacritic folding; Mc/O'/particle casing; mononym handling; `canonicalNameString` matches the shared form.
- **Refactor:** `lib/fuzzy-matcher.ts` (F-024) now imports `canonicalNameString` instead of its own dictionaries — one normalization for match, dedup, and canonicalization.

## 6. API & Gateway
- **Endpoint:** `GET /v1/names/canonicalize` (catalog id `name-canonicalize`), param `name`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `name-canonicalize` case returns `{ success, ...NameCanonicalization }`; empty name → `INVALID_PARAMETERS`.
- **Masking:** a name is low-sensitivity; returned in full for both sandbox and live.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `nameCanonicalToResult` branch (keyed on a `components` object with `first`/`last` + a `canonical` string — distinct from every other shape), emitting a structured `nameCanonical` section.
- **`NameCanonicalPanel`** (in `app/console/studio/page.tsx`): the canonical + formal + ASCII forms, a component chip row (prefix/first/middle/last/suffix), and the change log with a chip per transformation. Renders only when `result.nameCanonical` is present.
- **Preset:** "Canonicalize name" (`SpellCheck`/`CaseSensitive` icon, person category); examples cover a reorder, a nickname, and a diacritic/prefix case. **States:** loading / empty / error / success. Semantic tokens only; light + dark; Framer Motion.

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No dedicated event.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (9 canonicalizer cases + a view-model dispatch test + the unchanged fuzzy/dedup suites) · isolated build green · live Studio walkthrough (reorder, nickname, "Dr. josé garcía jr." → parsed components + ASCII form).

## 10. Deferred
Gender inference; non-Western name-order rules; non-Latin transliteration; a learned nickname model; company-name canonicalization.
