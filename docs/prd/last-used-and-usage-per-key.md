# PRD: Last-Used & Usage Per Key

> See when and how much each API key is exercised — a freshness status, request volume, and a usage timeline per key — plus the security-hygiene insight to rotate the stale ones and revoke the never-used.

**Status:** Built (prototype is the spec) · **Roadmap:** F-118 (Now → shipped) · **Console:** `/console/key-usage` · **Source:** `lib/key-usage.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The console already tracks `lastUsed` and `usage` on every key, but they're buried on the Keys page as static fields — there's no way to *see* which keys are actually being exercised, which have gone quiet, and which never authenticated a call. That gap is both an operability problem (which key is my production traffic on?) and a security one (an idle live key is a standing liability, and an unused live key is almost always a mistake). Last-Used & Usage Per Key turns those raw fields into an operator view with built-in hygiene.

## 2. Goals & Non-Goals
**Goals**
- A per-key freshness status derived from `lastUsed`, a usage total, and a usage timeline.
- A roll-up (total requests, active keys, idle/dormant, never-used) and a busiest-key call-out.
- Security-hygiene insights: rotate stale live keys, revoke never-used live keys — with a path to act.

**Non-Goals (this phase)** — per-endpoint or per-scope usage attribution (F-191); real-time streaming of usage; cost/spend per key (billing surface); charting beyond a sparkline; changing how usage is recorded (the gateway/console already increment it).

## 3. Users & Personas
- **Developers/operators (land):** at a glance, which key carries production traffic and which have gone dark — the 10-minute win.
- **Security/platform (expand):** the hygiene insights — rotate/revoke the risky keys — the enterprise control.
- **RBAC:** visible to `admin | developer | billing` (read-only view; remediation links to the Keys page where RBAC applies).

## 4. Differentiation
Table-stakes for an operator-grade console (Win #5), shipped clean, with a security-hygiene angle most enrichment APIs don't bother with: they show a key list; we show which keys are a liability and what to do. It reuses the exact fields the real gateway/console already increment on live calls (`usage`, `lastUsed` — bumped by the Explorer, Studio, and bulk runner), so the view reflects real activity, not a separate ledger.

## 5. Data Model & Logic
- **`lib/key-usage.ts`** (SSOT), deterministic (FNV-1a; no `Math.random`, `now` injected):
  - `keyFreshness(key, now)` → `active` (<24h) / `idle` (<7d) / `dormant` (<30d) / `stale` (≥30d) / `never`; `daysSinceUse`.
  - `usageTimeline(key)` → a 14-day sparkline seeded from the key id, spreading `usage` with a per-day weight and a recency ramp (busier lately); flat zero when never used.
  - `computeKeyUsage(keys)` (busiest first), `summarizeKeyUsage` (totals, active/idle/never, busiest), and `usageInsights` (stale live → rotate; never-used live → revoke; dormant live → review; severity-ranked).
  - `relativeLastUsed`, `freshnessLabel`.
- **State:** none — a pure derivation over the store's `activeKeys` (no slice, no API change).
- Invariants (unit-tested, `src/lib/__tests__/keyUsage.test.ts`, 7 tests): freshness bucketing + daysSinceUse; timeline deterministic + 14 points + roughly conserves the total + zero-for-never; `computeKeyUsage` sort; summary roll-up + busiest; insights flag stale/never live keys, severity-ordered, correct action; formatting.

## 6. API & Gateway
No new endpoint. `usage`/`lastUsed` are incremented by the existing console call paths (Explorer/Studio `incrementKeyUsage`, bulk runner) and the seeded keys carry realistic values; this feature reads them.

## 7. UI
`/console/key-usage` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (total requests, active keys, idle/dormant, never-used).
- **Hygiene panel:** severity-badged insights (rotate/revoke/review) linking to the Keys page.
- **Filter** (`SegmentedControl`: All / Active / Quiet / Needs attention) + a count.
- **Per-key rows:** name, env badge, freshness badge, "last used …", a colored **Sparkline** of the 14-day timeline, and the request total. Revoked keys are marked.
- **States:** loading skeleton; a no-keys empty state (→ create a key); a filtered-to-nothing empty state; cross-links to Keys / Analytics / Security. Framer Motion on row entrances.

## 8. Telemetry
`key_usage_viewed {keys}` (view), `key_usage_filtered {filter}` (filter) — via `lib/telemetry.ts`. **PLG hook:** the hygiene insights nudge toward key rotation (a security-activation moment).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (7 new tests) · `next build` green (new `/console/key-usage`) · Playwright smoke (`e2e/key-usage.spec.ts`) · the seeded Production Primary key (1.2M requests, used 1h ago) reads as Active/busiest; a long-idle live key surfaces a rotate insight.

## 10. Deferred
Per-endpoint/per-scope usage attribution (F-191); cost per key; real-time usage; a usage-over-time chart; auto-rotation policies; exporting the usage report.
