# PRD: Tier-Based Throughput

> A key's plan sets its throughput — each tier sizes both the burst capacity and the sustained requests/second the gateway allows, and the standard `RateLimit-Limit` + `X-RateLimit-Tier` headers advertise it on every response.

**Status:** Built (prototype is the spec) · **Roadmap:** F-131 · **Routes:** enforced on all `/api/v1/*` (limiter), `/console/throughput-tiers`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The token-bucket limiter (F-129) gave every key the same flat capacity, so "higher plans get more throughput" was a pricing-page claim with nothing behind it. Tier-based throughput makes the plan real: a key's tier sizes its bucket — burst and sustained refill — so Growth and Enterprise keys genuinely sustain more RPS than Starter. Because the standard `RateLimit-Limit` header (F-130) reports the bucket capacity, the tier is advertised on every response with no extra plumbing, and clients can pace to their true ceiling. It's the monetization layer on the F-129 engine, expressed through the F-130 header contract.

## 2. Goals & Non-Goals
**Goals**
- A **throughput ladder** — Starter (baseline) / Growth (3×) / Enterprise (12×) — sizing both **burst capacity** and **sustained refill (RPS)**.
- The gateway limiter **enforces** the tier: a key's bucket is sized from its tier, so `RateLimit-Limit` (and a new `X-RateLimit-Tier`) vary by plan on every response.
- **Backwards-compatible:** Starter reuses the exact F-129 baseline, so existing flat behaviour is unchanged for Starter/sandbox keys.
- **Edge-safe SSOT** shared by the Edge limiter and the console, so the numbers never drift.
- A **console** showing the ladder, the key's current tier + live-verified limit, and an upgrade path (PLG).

**Non-Goals (this phase)** — pulling the tier from the authenticated billing plan server-side (billing.ts isn't Edge-safe; tier is derived deterministically from the key as a coherent stand-in — sandbox keys are always Starter); custom/negotiated limits per account; burst-vs-sustained as separate purchasable dials; per-endpoint tiering; actually charging for an upgrade (the CTA links to billing).

## 3. Users & Personas
- **Scaling developer (expand):** sees their key throttled at Starter, views the ladder, and upgrades to Growth for 3× sustained RPS — enforced immediately.
- **Enterprise buyer:** high sustained throughput is a real, verifiable capability (confirm the limit live from the response header), not a line item.
- **Integrating developer (land):** reads `RateLimit-Limit` / `X-RateLimit-Tier` and paces to the exact ceiling.
- **RBAC:** the console is `admin | developer | billing` (billing sees the plan value + upgrade CTA); enforcement applies to every call.

## 4. Differentiation
Ties to **win #6 (enterprise scale)** + monetization. The differentiator is that the tier is **enforced and provable**, composed from the existing engine + header contract: F-129 sizes the bucket, F-131 sizes it *by plan*, and F-130's `RateLimit-Limit` advertises it — one coherent subsystem, verifiable live from the response headers. Many APIs publish per-plan limits but don't expose them in-band or let you confirm them; here the console reads the real header back.

## 5. Data Model & Logic
Single source of truth: **`lib/throughput-tiers.ts`** (Edge-safe, pure, deterministic — no Node deps, no `Math.random`).
- `TIER_LIMITS: Record<ThroughputTier, { capacity, refillPerMinute, sustainedRps, description }>` — Starter reuses `RATE_LIMIT` (F-129); Growth = 300/300; Enterprise = 1200/1200.
- `tierForKey(apiKey)` — `sk_test_*` → Starter (dev baseline); live keys map by a stable FNV hash across the ladder (weighted to Starter). Deterministic: same key → same tier, in the limiter and the console.
- `tierLimitForKey`, `nextTier` (upgrade CTA), `TIER_ORDER`.
- **`src/lib/gateway/rateLimiter.ts`** now resolves `tierLimitForKey(apiKey)` to size the bucket and returns `tier` on `RateLimitResult` (additive; F-130 headers read limit/remaining/reset unchanged).

## 6. State / Integration
- **Enforcement:** the Edge limiter sizes each key's token bucket by tier; **`middleware.ts`** adds `X-RateLimit-Tier` to every response (success + 429). `RateLimit-Limit` = the tier's capacity (via F-130). No store slice.
- **Console** (`/console/throughput-tiers`): the current tier card (burst / sustained / refill) with a **Verify live** button (fires a real call, reads `RateLimit-Limit` + `X-RateLimit-Tier` back), the three-tier ladder with the current tier highlighted + `N× Starter` multipliers, and an **upgrade CTA** to the next tier (→ Billing). Imports the SSOT directly (Edge-safe = client-safe), so the console math equals the gateway's.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, StatusBadge). **Ready** — current tier + ladder + CTA. **Verify** — spinner → confirmed banner (or toast on failure). **Top tier** — a "maximum throughput" note instead of the CTA. Sandbox note clarifies Starter baseline. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `throughput_tiers_viewed` (tier) and `throughput_tier_checked` (tier, limit). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**9-case** suite: ladder increases capacity+RPS, Starter == F-129 baseline, nextTier walk, sandbox→Starter, deterministic tierForKey, live-key distribution across all tiers, limiter sizes the bucket + reports the tier per key) · isolated `next build` green (`/console/throughput-tiers` present) · Playwright smoke (`e2e/throughput-tiers.spec.ts`) · live drill — a Starter key returns `RateLimit-Limit: 100`, a Growth/Enterprise key returns the higher ceiling, with `X-RateLimit-Tier` set. 0 console errors.

## 10. Deferred
Server-authoritative tier from the billing plan (needs an Edge-safe plan lookup or a signed plan claim); custom/negotiated per-account limits; separately purchasable burst vs sustained; per-endpoint tiers; wiring the upgrade CTA to a real plan change; surfacing tier in the token-bucket visualizer (F-129).
