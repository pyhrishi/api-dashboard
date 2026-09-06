# PRD: Company News & Event Feed

> **A preset in the Enrichment Studio.** Ships at `/console/studio` as "Company news" (`news` preset), backed by a real endpoint. No separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-015 · **Route:** `/console/studio` (preset `news`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Timing wins deals. A rep who opens a call the week a company raised a round, opened an office, or changed its CRO has a reason to reach out and a hook to lead with. Company News & Event Feed turns a domain into a chronological feed of trigger events — funding, leadership changes, expansion, product launches, M&A, partnerships, and hiring surges — each typed, dated, sourced, and scored for materiality, and reconciled with the rest of the company graph so it never contradicts the funding or firmographic data.

## 2. Goals & Non-Goals
**Goals**
- One domain in → a **chronological event feed** (newest first), each event with `type`, `date`, `headline`, `summary`, `source`, `sentiment`, and an `importance` score.
- Event **types**: funding, leadership, expansion, product, acquisition, partnership, hiring (extensible).
- A **by-type tally** for filter chips and a `latest_event` for a quick "what just happened".
- **Cross-consistent**: funding events are pulled from the funding graph, so a Series C here matches the same round in Funding Signals exactly.
- Deterministic per domain; personal-email domains resolve to a clean not-found.

**Non-Goals (this phase)** — real-time news polling / webhooks on new events (a Signals + F-235 change-event feature); sentiment from real NLP (deterministic mock); article full-text; per-event source URLs; watchlists/alerts (a separate Signals surface); intent topics (F-012).

## 3. Users & Personas
- **Sales / SDR (land):** opens an account with the freshest trigger and a talking point.
- **RevOps (expand):** maps event types to trigger-based plays and prioritization.
- **VC / Corp-dev (expand):** scans the timeline for momentum and M&A signals.
- **RBAC:** the Studio's `admin | developer` gate; read-only, no mutation.

## 4. Differentiation
**Table-stakes category, shipped with a coherence point of care** (win #5, operator-grade): the feed is **reconciled with the company graph** — funding events come straight from the funding resolver, so the news feed, Funding Signals, and firmographics tell one consistent story instead of three datasets that disagree. That internal consistency is exactly what breaks in bolted-on news scrapes.

## 5. Data Model & Logic
Single source of truth: **`lib/company-news-resolver.ts`** → `resolveCompanyNews(domain): CompanyNewsFeed | null` (null when the base company can't resolve or is a personal domain).
- Built on `resolveCompanyFromDomain` (facts) and **reuses `resolveFundingForDomain`** (funding events). A seeded RNG (`hash("news:"+domain)`) fills the non-funding events — **no `Math.random`**.
- Event volume scales with company size (employee count gates expansion/hiring; funding stage gates M&A and round count).
- `CompanyNewsFeed`: `events: CompanyEvent[]`, `event_count`, `latest_event`, `by_type`, `confidence`, `last_verified`, `provenance[]`.
- `CompanyEvent`: `id`, `type`, `date`, `headline`, `summary`, `source`, `sentiment`, `importance` (0-100).
- Invariants (unit-tested, `src/lib/__tests__/companyNewsResolver.test.ts`): deterministic per normalized domain; newest-first; `by_type` sums to `event_count`; **funding event dates equal the funding graph's round dates**; every event well-formed with bounded importance; personal domains → null.

## 6. API & Gateway
- **Endpoint:** `GET /v1/companies/news` (catalog id `company-news`), param `domain`, **2 credits**.
- **Mock:** `src/lib/sandboxAPI.ts` `company-news` case returns `{ success, ...CompanyNewsFeed }`; personal/unresolvable domain → `NOT_FOUND`.
- **Masking:** public news/event data, returned in full for both sandbox and live keys.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `newsToResult` branch (keyed on an `events` array + numeric `event_count`), emitting a structured `news` section.
- **`NewsFeedPanel`** (in `app/console/studio/page.tsx`): a vertical event timeline — each item a type icon + tone dot, headline, date, source, and an importance cue — with type-count filter chips derived from `by_type`. Renders only when `result.news` is present.
- **Preset:** "Company news" (`Newspaper` icon, company category); examples cover a venture-backed company, a public one, and an Indian company. **States:** loading / empty (young company, few events) / error (unresolvable) / success. Semantic tokens only; light + dark; Framer Motion timeline.

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No dedicated event.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (6 news-resolver cases + a view-model dispatch test + suite) · isolated build green · live Studio walkthrough (event timeline with funding/leadership/expansion; personal-domain not-found).

## 10. Deferred
Real-time event webhooks (F-235); NLP sentiment; per-event source URLs; watchlists & alerts; intent topics (F-012); article full-text.
