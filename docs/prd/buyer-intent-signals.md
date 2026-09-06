# PRD: Buyer Intent Signals

> Score how in-market a company is and surface the topics it's actively researching — a composite 0–100 intent score with a hot/warm/cool/cold tier, topic surges, and the signals behind them.

**Status:** Built (prototype is the spec) · **Roadmap:** F-012 · **Routes:** `GET /v1/companies/intent`, `/console/studio` (the "Buyer intent" preset)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Sales and marketing waste effort on accounts that aren't in-market. Buyer-intent data — which companies are researching your category, and how hot they are — is how GTM teams prioritize. Zinbit already resolves company firmographics, funding, and news; F-012 turns those into a single **in-market score** plus the **topics** an account is surging on, so a rep or an ABM play can focus on accounts that are actually buying.

## 2. Goals & Non-Goals
**Goals**
- **A composite intent score** (0–100) and a **hot / warm / cool / cold** tier per company domain.
- **Topic surges:** the category topics the account is researching (Data Enrichment, Sales Intelligence, Lead Scoring, ABM, …), each with a week-over-week trend.
- **Explainable signals:** the contributing evidence — recent funding (budget), GTM/data hiring, competitive-tech evaluation, trigger events, content engagement — each with a weight.
- **A recommended action** and an `in_market` flag.
- **Coherence:** reuse the real company / funding / news resolvers so intent never contradicts enrichment.

**Non-Goals (this phase)** — a real third-party intent feed (Bombora/6sense-style co-op data); person-level intent; a "hot accounts" dashboard aggregating intent across a book of business (that's expansion / F-293 intent summarization); intent history/trending over time; configurable topic taxonomies per customer; intent for personal-email domains (no company to score).

## 3. Users & Personas
- **Sales / SDR (expand):** pulls a domain's intent to decide whether to prioritize outbound now, with the top surging topic as the hook.
- **Marketing / ABM (expand):** targets warm accounts with content on the topics they're researching.
- **Integrating developer (land):** `GET /v1/companies/intent?domain=…` returns a scored, explainable profile to route leads or enrich a CRM.
- **RBAC:** inherits the Studio's `admin | developer` gate; billed like a company enrichment (2 credits).

## 4. Differentiation
Ties to **win #1 (developer-first enrichment breadth)** and **win #4 (coherent, explainable AI)**: unlike opaque third-party intent scores, Zinbit's is **explainable and coherent** — every point traces to a real signal (the same funding/news the platform already surfaces), and it's deterministic (state-aware, never random), so the score a customer sees today is the score they see tomorrow for the same evidence.

## 5. Data Model & Logic
Single source of truth: **`lib/intent-resolver.ts`** (pure, deterministic, no `Math.random`).
- `resolveBuyerIntent(domain): BuyerIntentProfile | null` — null for personal/unrecognized domains.
- **Signals** (several drawn from the real resolvers for coherence): `resolveFundingForDomain` → a funding/budget signal (recent raise weighted higher); `resolveCompanyNews` → trigger-event signal (weighted by the top event's importance); plus seeded hiring (GTM/data reqs), technographic (competitor-tool evaluation), and engagement signals. Each carries a `weight` (0..1).
- **Topics:** 3–5 category topics seeded from the domain, each a `{ score, delta, trend }` (surging / rising / steady / cooling).
- **Composite:** `0.55 × top-topic-average + 48 × mean-signal-weight`, clamped 3..99 → tier bands (hot ≥ 75, warm ≥ 50, cool ≥ 25, else cold); `in_market` = hot|warm; a tier-specific recommended action.

## 6. State / Integration
- **Gateway:** a normal-pipeline endpoint (`company-intent` in `src/data/endpoints.ts`) with a deterministic sandbox case (`src/lib/sandboxAPI.ts`) returning the profile. Feeds docs / Explorer / OpenAPI / Postman / CLI.
- **View-model** (`src/data/enrichments.ts`): an `intent` preset, `intent?: BuyerIntentProfile` on `EnrichmentResult`, `intentToResult`, and a shape-based dispatch (`tier` + `in_market` + `topics` + `signals`).
- **No store slice** — intent is a stateless lookup surfaced in the Studio.

## 7. UI
The Studio "Buyer intent" preset (icon `Crosshair`) renders an `IntentPanel`: a score header (big 0–100 score, tier badge tone-coded hot→cold, in-market badge, trend with a flame/▲/▼ icon, and the recommended action), a "Topics being researched" list (each with an animated score bar and a signed weekly delta + trend icon), and a "Contributing signals" list (category icon, label, weight %, and a one-line detail). Semantic tokens; Framer Motion; light + dark. The Studio's existing loading/empty/error/not-found states apply (personal domains → not-found).

## 8. Telemetry
`intent_resolved` (domain, score, tier, in_market) via `lib/telemetry.ts`, emitted from the Studio alongside `enrichment_run`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (6-case resolver suite: null on personal/unknown, coherent profile, tier↔score bands, topic ranking + trend↔delta, signal ordering + resolver reuse, determinism + domain normalization) · isolated build green · live gateway checks — `stripe.com` → 68 warm rising, in-market, top topic Sales Intelligence:86, 5 signals, an ABM recommendation; `gmail.com` → NOT_FOUND (personal). Studio panel renders (score 68/100, tier, topics, signals, action), 0 console errors.

## 10. Deferred
Real third-party intent co-op data; person-level intent; a cross-account "hot accounts" dashboard; intent history/trending; configurable topic taxonomies; feeding intent into the Signals/alerts surface.
