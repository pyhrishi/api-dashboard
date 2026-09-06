# PRD: Currency Normalization

> Turn any messy monetary value — any symbol, ISO code, scale word, or locale format — into one canonical amount: the ISO 4217 currency, the parsed number, and the value converted to a target reporting currency at a frozen reference FX rate, with every assumption surfaced.

**Status:** Built (prototype is the spec) · **Roadmap:** F-056 · **Routes:** `GET /v1/currency/normalize`, `/console/studio` (the "Normalize currency" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Financial fields arrive from every source in a different shape — "$1.2M", "€1.200.000,50", "₹1,200 crore", "JPY 3,000,000", "1'200'000 CHF", "(1,500)". Aggregating revenue, funding, or deal size across sources means first agreeing on what each string *means*: which currency, which decimal vs grouping convention, which scale word. Currency normalization parses any of it into a canonical amount + ISO 4217 code and converts it to one reporting currency, so a warehouse can sum and compare money across regions. It's the money-field sibling of encoding & language normalization (F-057), name canonicalization (F-030), and title normalization (F-005).

## 2. Goals & Non-Goals
**Goals**
- Parse **symbols** ($, €, £, ¥, ₹, ₩, R$, HK$, kr…), **ISO codes** (USD/EUR/INR…), and **scale words** (K, M, B, thousand/million/billion, and Indian **lakh/crore**).
- Parse **every locale's number format**: US `1,200,000.50`, EU `1.200.000,50`, French space grouping, **Indian** `12,00,000`, Swiss apostrophe `1'200'000`, and accounting parentheses as negatives.
- Return the **ISO currency**, the **canonical amount**, and the amount **converted to a target** (USD default) at a **frozen reference FX rate**.
- Be **honest about ambiguity**: flag ambiguous symbols ("$" → USD/CAD/AUD…, "¥" → JPY/CNY), guessed thousands-grouping-vs-decimal, and the scale applied — with a confidence that reflects it.

**Non-Goals (this phase)** — live/real-time FX (a frozen reference table, deterministic by design); historical FX as-of a date; every ISO 4217 currency (a curated ~27-currency table covering the platform's needs); cryptocurrencies; parsing ranges ("$1M–$5M") or free-text ("a few million"); rounding-policy configuration; this is **not** billing currency (that's F-157 multi-currency billing).

## 3. Users & Personas
- **Data engineer (land):** `GET /v1/currency/normalize?value=₹1,200 crore&to=USD` → `{ currency: INR, amount, targetAmount, rate }` — one call to normalize a column of mixed-currency revenue.
- **RevOps / analytics (expand):** normalizes revenue/funding across a global account list to one reporting currency before rollups.
- **Developer in Studio:** pastes any money string and sees the canonical amount, the conversion, and what was assumed.
- **RBAC:** inherits the Studio's `admin | developer` gate; billed like a lookup (1 credit).

## 4. Differentiation
Ties to **win #4 (coherent, explainable data)**. The differentiator isn't conversion — it's the **honest, explainable parse**: correctly disambiguating EU vs US separators and Indian vs Western grouping, handling lakh/crore, and *telling you every assumption it made* (ambiguous symbol, guessed grouping, applied scale) with a calibrated confidence. Generic parsers silently mis-read "1.200.000,50" or "12,00,000"; this one gets them right and shows its work.

## 5. Data Model & Logic
Single source of truth: **`lib/currency-normalizer.ts`** (pure, deterministic — no `Math.random`, no network, frozen FX table @ 2026-09-01, hand-rolled formatting so output is identical across environments).
- `normalizeCurrency(value, target='USD')` → `NormalizedCurrency { input, currency, symbol, amount, scaleApplied, target, targetAmount, rate, rateDate, formatted, formattedTarget, confidence, ambiguous, alternatives[], notes[] }`.
- **Detection order:** explicit ISO code (0.98) → multi-char symbol prefix like R$/HK$ (0.92) → single symbol, some ambiguous (0.82–0.9) → default USD (0.5).
- **Number parse:** when both `.` and `,` are present, the last one is the decimal; a single separator with exactly 3 trailing digits is treated as thousands-grouping (noted as ambiguous), otherwise as a decimal; spaces and apostrophes are grouping; parentheses ⇒ negative.
- **Scale:** longest-token-first match (crore before cr, million before m), attached to a digit or as a standalone word.
- **Convert:** `rate = FX_TO_USD[from] / FX_TO_USD[target]`; unknown currency keeps the amount and notes "no FX rate".
- `getFxReference()` / `supportedCurrencies()` expose the frozen table for the UI.

## 6. State / Integration
- **Gateway:** a normal-pipeline `GET /v1/currency/normalize` (catalog entry in `src/data/endpoints.ts`, params `value` + optional `to`) with a deterministic sandbox case calling `normalizeCurrency`. Feeds docs / Explorer / OpenAPI / Postman / CLI. **Seam verified live.**
- **View-model** (`src/data/enrichments.ts`): a `currency-normalize` preset (icon `Coins`), a `currency?` field on `EnrichmentResult`, `currencyToResult`, and a shape dispatch (`currency` + `target` + `formattedTarget` + `rateDate`).
- **No store slice, no dedicated console page** — a stateless resolver surfaced in the Studio.

## 7. UI
The Studio "Normalize currency" preset renders a `CurrencyPanel`: a header (ISO code + scale + ambiguity badges), a large canonical amount with an `In <target>` conversion and the rate + reference date, an "Assumptions" list (every note), and — when the symbol was ambiguous — the alternative currencies with a hint to pass an explicit code. Loading/empty/error handled by the Studio shell; semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
`currency_normalized` (input, currency, target, ambiguous, scale, confidence) via `lib/telemetry.ts`, emitted from the Studio alongside `enrichment_run`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**23-case** suite: ISO/symbol/multi-char/default detection, ambiguity flags, K/M/B + lakh/crore scales, US/EU/French/Indian/Swiss grouping, accounting negatives, conversion to USD/other/identity, zero-decimal formatting, empty/no-number edges, determinism, FX reference) · isolated `next build` green · Playwright smoke (`e2e/currency.spec.ts`) · live gateway drill — `$1.2M`, `₹1,200 crore` (→ $144M), `€1.200.000,50`, `1'200'000 CHF`, `¥3000000`, `£500→EUR`, `($1,500)→ -$1,500`. 0 console errors.

## 10. Deferred
Live/historical FX; the full ISO 4217 set; crypto; range and free-text amounts ("a few million"); configurable rounding; wiring the normalizer into firmographic revenue/funding fields so every company dossier reports one currency; a bulk endpoint for a column of values.
