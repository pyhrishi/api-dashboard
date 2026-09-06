# PRD: Encoding & Language Normalization

> Enforce UTF-8 and normalize language/script variants on any messy string — repair mojibake, compose to NFC, strip invisibles, detect script + language, and return canonical + ASCII forms. Wired upstream of name matching so records never diverge over encoding.

**Status:** Built (prototype is the spec) · **Roadmap:** F-057 · **Routes:** `GET /v1/text/normalize`, `/console/studio` (the "Normalize text" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Real-world names, companies, and addresses arrive corrupted: UTF-8 decoded as Latin-1/Windows-1252 ("JosÃ©", "itâ€™s"), Unicode-decomposed ("e"+combining accent instead of "é"), padded with zero-width/control characters, or written in a non-Latin script. Every one of those quietly breaks exact and fuzzy matching — the same person looks like two records. F-057 enforces one canonical UTF-8 form and exposes the script/language it detected, so both the customer (via an API/Studio tool) and the platform's own matching layer work from clean, comparable text.

## 2. Goals & Non-Goals
**Goals**
- **Repair encoding:** fix common mojibake (both Latin-1 and Windows-1252 renderings) and compose to Unicode NFC.
- **Clean:** strip zero-width, BOM, bidi, and control characters; collapse whitespace.
- **Detect:** the script(s) present (10 scripts) and a coarse language hint.
- **Latinize:** return an ASCII form — transliterated for Cyrillic/Greek, diacritic-folded for Latin — so non-Latin/accented records become matchable.
- **Explain:** return the exact list of transformations applied, deterministically.
- **Feed matching:** run the same repair upstream of name canonicalization so matching/dedup never diverge over encoding.

**Non-Goals (this phase)** — full statistical language detection (we give a script-driven hint, not a classifier); transliteration of CJK/Arabic/Hebrew/Devanagari/Thai (detected + folded best-effort, not romanized); gateway-wide rejection of non-UTF-8 request bodies; per-locale casing/collation; translation.

## 3. Users & Personas
- **Integrating developer (land):** pipes dirty CSV/CRM exports through `GET /v1/text/normalize` before ingest, or spot-checks a value in the Studio tool.
- **Data-ops / RevOps (expand):** understands why two records didn't merge (encoding) and gets a canonical form to standardize on.
- **The platform itself:** name canonicalization (F-030), and through it fuzzy matching (F-024) and dedup, consume `canonicalUtf8` so a mojibaked name matches its clean form.
- **RBAC:** the Studio tool inherits the Studio's `admin | developer` gate; the endpoint bills like any enrichment.

## 4. Differentiation
Ties to **win #5 (operator-grade)**: most enrichment APIs assume clean UTF-8 input and silently mismatch on dirty data. Zinbit repairs it, tells you exactly what it changed, and — critically — uses the *same* normalization internally, so what the tool shows and what matching does can never disagree. Table-stakes capability, shipped to production depth and single-sourced.

## 5. Data Model & Logic
Single source of truth: **`lib/text-normalizer.ts`** (pure, deterministic, no `Math.random`, no network).
- `normalizeText(raw): NormalizedText` — the pipeline: `fixMojibake` → NFC → `stripControlChars` → `collapseWhitespace`, then script detection, language hint, and ASCII derivation. Returns `{ original, normalized, ascii, scripts[], primaryScript, languageHint, transformations[], flags, bytes }`.
- Helpers, each independently testable: `fixMojibake` (a 70-pair table generated from the real UTF-8→Latin-1/cp1252 corruption, longest-first), `stripControlChars`, `collapseWhitespace`, `detectScripts` (codepoint ranges → Latin/Cyrillic/Greek/Han/Hiragana/Katakana/Hangul/Arabic/Hebrew/Devanagari/Thai), `transliterate` (Cyrillic/Greek → Latin), `asciiFold` (NFD + combining-mark strip).
- `canonicalUtf8(raw)` — the repair-only form (no transliteration; non-Latin preserved), cheap enough to run upstream of matching.
- Iterates code points via `Array.from` (never `for..of`/spread over a string) to stay correct under the low tsconfig target.

## 6. State / Integration
- **No store slice, no telemetry event** — it's a stateless transform. The Studio preset emits the existing `enrichment_run`.
- **Gateway:** a normal-pipeline endpoint (`text-normalize` in `src/data/endpoints.ts`) with a deterministic sandbox case in `src/lib/sandboxAPI.ts` that returns `normalizeText(text)`. Feeds docs / Explorer / OpenAPI / Postman / CLI like every catalog endpoint.
- **View-model:** `src/data/enrichments.ts` gains a `text-normalize` preset, a `normalize?: NormalizedText` field on `EnrichmentResult`, `normalizeToResult`, and a shape-based dispatch (`normalized` + `transformations` + `flags` + `primaryScript`).
- **Coherence:** `lib/name-canonicalizer.ts` now runs `canonicalUtf8` on its input first, so F-030/F-024/dedup inherit encoding-robustness for free.

## 7. UI
- **Studio "Normalize text" preset** (icon `Languages`, freeform `text` input) with example chips including a mojibake string and a Cyrillic name.
- **`NormalizePanel`:** a tone-coded header (script badge + language hint; teal when changed, success when already clean), a before → after block (Original → Canonical UTF-8 → optional ASCII form) with a byte-delta and script list, and a "Transformations applied" checklist. When nothing changed, a clean "already valid UTF-8" state. Loading/empty/error states are the Studio's. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Reuses `enrichment_run` (preset `text-normalize`) — no new event; a stateless utility needs none beyond adoption, which the run event already captures.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (19-case text-normalizer suite: mojibake both encodings, NFC, control/whitespace, script detection, transliteration, folding, end-to-end, determinism, empty; plus the unchanged name-canonicalizer/fuzzy suites) · isolated build green · live Studio walkthrough: `JosÃ© GarcÃ­a` → canonical "José García", ASCII "Jose Garcia", transforms (mojibake repaired, diacritics folded), Latin/French; `Пётр Ильич` → transliterated "Petr Ilich", Cyrillic/Russian. 0 console errors.

## 10. Deferred
Statistical language detection; transliteration for CJK/Arabic/Hebrew/Devanagari/Thai; gateway-wide UTF-8 enforcement on request bodies; locale-aware casing/collation; wiring `canonicalUtf8` into every resolver input (started with the name canonicalizer).
