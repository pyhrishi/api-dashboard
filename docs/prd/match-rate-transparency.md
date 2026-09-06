# PRD: Match-rate Transparency

> **A console dashboard + per-request explanation.** Ships at `/console/coverage` ("Match Rate") with a match-explanation panel embedded in the Logs detail. No new API endpoint.

**Status:** Built (prototype is the spec) · **Roadmap:** F-029 (Now) · **Route:** `/console/coverage` (+ `/console/logs` detail)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
"What's your real match rate?" is the first question every enrichment buyer asks and the one incumbents answer least honestly — a single marketing number, no per-endpoint or per-identifier breakdown, and no way to see *why* a given lookup missed. Developers, meanwhile, get a 404 with no guidance on what to try next. Match-rate Transparency turns the console's own request history into an honest, decomposed match rate and explains, for every request, why it matched or missed.

## 2. Goals & Non-Goals
**Goals**
- An **honest match rate** = matched ÷ (matched + missed) over genuine coverage lookups, with a visible statement of what's excluded.
- **Breakdowns** by endpoint and by identifier type (email, domain, phone, LinkedIn, IP, CIN), each with its own rate and volume.
- A **miss-reason** breakdown (outside coverage vs no-match) with deterministic recovery suggestions.
- A **per-request explanation** ("why this matched / missed") surfaced both on the dashboard's recent-lookups list and inside the Logs detail — the F-029 "for each request" mandate.
- Fully **deterministic and state-aware**: computed from real `apiLogs` via `lib/insight-engine.ts`, never hardcoded or random.

**Non-Goals (this phase)** — a committed accuracy/quality SLA (roadmap F-055); coverage-gap heatmaps by region/industry (F-053); a pre-purchase coverage lookup (F-220); feeding bounces back to improve scores (F-045); exporting a coverage report (natural follow-on).

## 3. Users & Personas
- **Integrating Developer (land):** sees, in Logs, exactly why a lookup missed and the next identifier to try.
- **Data / RevOps Leader (expand):** reads match rate by identifier to decide which inputs to send.
- **Economic Buyer / Procurement (expand):** gets an auditable, honest match rate with a stated methodology — the answer to the coverage question.
- **RBAC:** admin, developer, and billing can all view (coverage is a procurement concern); the page is read-only, so there are no gated mutations.

## 4. Differentiation
Ties to **win #4 (radical usage transparency)** and **win #5 (operator-grade console)**. The differentiator is the **honest denominator**: transforms (email verify, title normalize, domain auth) and non-coverage errors (invalid input, auth, rate limits) are excluded, so the number reflects real dataset coverage rather than being inflated to ~100%. Incumbents publish one opaque figure; we show the math and the per-request reasoning.

## 5. Data Model & Logic
Single source of truth: **`lib/insight-engine.ts`** (deterministic, dependency-free), reading a structural `MatchLog` (satisfied by the store's `ApiLog`).
- `classifyLookup(path, params)` → `{ kind: 'lookup' | 'transform' | 'other'; identifier; endpointLabel }`. Transforms and non-lookups never count toward coverage.
- `explainMatch(log): MatchExplanation` → `{ verdict: 'matched' | 'missed' | 'error' | 'excluded'; label; detail; identifier; endpointKind; recovery; counts }`. Verdict rules: 2xx with resolved data → matched; 2xx empty or 404 → missed; 400/401/403/429/5xx → error (not counted); transforms/other → excluded.
- `aggregateMatchRate(logs): MatchRateSummary` → totals, `matchRate`, `byEndpoint[]`, `byIdentifier[]`, and `missReasons[]`. Denominator = matched + missed only.
- Invariants (unit-tested in `src/lib/__tests__/matchRate.test.ts`, 12 cases): deterministic; transforms/errors excluded from the denominator; empty input never divides by zero; miss-reason counts sum to total misses.
- **Seed:** `lib/seed-request-history.ts` `generateSeedRequestHistory(env)` produces a deterministic, realistic 7-day lookup history (a believable ~68–80% match mix across every identifier type). The store action `seedRequestHistory()` populates it only when the active environment has little real traffic (idempotent; replaces any prior seed batch), enriching Logs and Analytics too. No `Math.random` in the outcomes — only timestamps are anchored to "now" so timeframe filters work.

## 6. State
- **No new store slice.** Reads the existing persisted `apiLogs` (already in `partialize`). Adds one action, `seedRequestHistory()`, that only writes `apiLogs` (no credit/quota side effects, unlike `logApiRequest`).
- Environment-scoped throughout; timeframe (24h / 7d / 30d) filters by timestamp client-side.

## 7. UI
- **`/console/coverage`** (new page, `app/console/coverage/page.tsx`), composed from `components/ui`:
  - `PageHeader` (Target icon) + a `SegmentedControl` timeframe.
  - Four `KpiTile`s (match rate, attempted, matched, missed) + a one-line exclusions statement.
  - Two `GlassCard` breakdowns (by endpoint, by identifier) with animated, tone-coded rate bars and a relative-volume cue.
  - A miss-reason card (share bars + recovery copy) and a recent-lookups explainer (per-request verdict badge, label, identifier, detail, recovery link).
  - A methodology `GlassCard` explaining the honest-denominator formula.
  - **States:** loading skeleton (matched layout), empty (no coverage lookups → CTA to the Studio), success.
- **Logs detail** (`app/console/logs/page.tsx`): a full-width match panel above the request/response grid, shown only for coverage lookups, tone-coded by verdict with a recovery link to `/console/coverage`.
- Semantic tokens only; correct in light + dark; Framer Motion entrances.

## 8. Integration
- **Nav:** "Match Rate" entry (Target icon) after Usage & Analytics, roles `admin | developer | billing`.
- **Cross-links:** Coverage → Logs ("All logs" + per-row), Coverage → Studio (recovery: Reverse Enrichment / Identity Resolve), Logs → Coverage.
- **Single sources of truth / insight engine:** all reasoning in `lib/insight-engine.ts` (the state-aware AI layer); no endpoint/catalog changes.

## 9. Telemetry
`coverage_viewed` (on load, with environment), `coverage_timeframe_changed` (timeframe), `match_recovery_clicked` (identifier + environment) — a drop-off/expansion signal for how often misses lead to a recovery attempt.

## 10. Verification
`tsc` clean · lint 0/0 · `jest` green (12 match-rate cases + suite; 172 total) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live walkthrough of the dashboard (68% honest rate, breakdowns, miss reasons, recent explainer) and the Logs per-request match panel.

## 11. Deferred
Coverage report export; quality/accuracy SLA (F-055); coverage-gap heatmaps (F-053); pre-purchase coverage lookup (F-220); bounce-feedback learning (F-045); alerting on a match-rate drop.
