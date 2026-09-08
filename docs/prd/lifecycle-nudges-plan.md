# PRD / Plan: Lifecycle Nudges & Journey Orchestration

| | |
|---|---|
| **Status** | Planned · **Steps 0–5 done — green** (2026-09-08) |
| **Owner** | Product (Zintlr) |
| **Last updated** | 2026-09-08 |
| **Prototype route(s)** | `/console/journey` (cockpit, Step 5 — /console/lifecycle is a1's CSM cockpit) · nudge surfaces console-wide · landing/signup (Step 6) |
| **Source artifacts (target)** | `lib/lifecycle.ts`, `lib/nudges.ts`, `lib/nudge-delivery.ts`, `components/nudges/*`, `lib/telemetry.ts`, `app/console/journey/page.tsx` |
| **Roadmap** | supersedes F-387 (Progress-based nudges); clusters F-388-class lifecycle work |

This is the implementation plan for the full user-journey nudge system (the "Section F" journey table:
C0-a … C7-b plus the missing-trigger table). It is built **step by step**; each step is an
independently shippable increment ending in a commit and a green bar. This document is the
checklist — every step updates it.

## Locked decisions (2026-09-08)

The four open questions were resolved as follows (chosen for depth + coherence with what exists):

1. **Pre-auth scope (Step 6):** build the highest-value pop-ups on the *existing* marketing page
   (`app/api/page.tsx`) — mock-sandbox → signup gate, exit-intent capture, SSO — and mark the rest
   (retargeting pixel, RB2B, dwell heuristics) production-required. The full post-auth journey is
   built to production depth.
2. **Email / webhook delivery:** reuse the Alert Center delivery ledger (`lib/growth-alerts.ts`
   `planDeliveries` / channels / honest delivered-vs-failed outcomes). No new provider integration
   in the prototype; production swaps the ledger for real SES/SendGrid + signed webhooks.
3. **Mixpanel:** add a real `forwardToMixpanel` adapter alongside PostHog, keyed by
   `NEXT_PUBLIC_MIXPANEL_TOKEN`, no-op without it. The Mixpanel event *names* in the tables are the
   telemetry event catalog.
4. **Trial expiry:** the lifecycle SSOT derives the trial window deterministically from signup time
   + `TRIAL_DURATION_DAYS` (Step 0). A persisted, overridable `trialExpiresAt` is added to the store
   in Step 3, where the decision-window nudge (C4-a) needs an authoritative date.

## Architecture (six layers)

1. **Lifecycle SSOT** — `lib/lifecycle.ts` derives the current C-stage, active triggers, and lead
   score from real state (composing the peer trial-gate `AccountState`, my growth-kpis
   `DeveloperRecord` predicates, credit %, key expiry, inactivity). Pure, deterministic, no store import.
2. **Nudge catalog + selector** — `lib/nudges.ts`: one `NudgeSpec` per in-product nudge, plus
   `activeNudges(account, state, now)` honoring dismissal / snooze / seen / frequency caps /
   suppression / priority. A dedicated persisted store `useNudgeState` (own key `zinbit-nudge-state`,
   the Alert-Center pattern) so **`lib/store.ts` is untouched**.
3. **In-product rendering** — `components/nudges/*` (orchestrator + banner/modal/toast/progress/
   celebration), mounted once in the console layout.
4. **Trigger evaluator** — `NudgeWatcher` (the `GrowthAlertsWatcher` pattern) for time/threshold
   edges, with a deterministic simulated-time scenario switch.
5. **Channel delivery** — `lib/nudge-delivery.ts` over the Alert Center ledger: re-engagement emails,
   Phase-2 webhooks, multi-touch sequences with cap + unsubscribe.
6. **Lead classification & sales routing** — lead score, a "Sales" owner in Alert Center routing,
   and the `/console/journey` cockpit.

## Reuse map — do not rebuild

| Journey rows | Reuse | Where |
|---|---|---|
| C1-c, C1-d (risk eval, phone OTP) | Peer F-503 trial gate (`evaluateTrialRisk`, `AccountState`, phone-otp, `TrialActivationGate`) | `lib/auth/trial-gate.ts` |
| Funnel stages, consumption %, wallet | growth-kpis `DeveloperRecord`, `liveDeveloperRecord`, `useGrowthLiveInputs` | `lib/growth-kpis.ts` |
| Email/webhook/re-engagement, routing, ledger | Alert Center `planDeliveries`, ledger, watcher cadence | `lib/growth-alerts.ts` |
| C1-b onboarding, C2-b first key | Onboarding checklist | `components/OnboardingChecklist.tsx` |
| C3-a first fire | FirstCallWizard, Explorer `first_call_made` | `src/components/FirstCallWizard.tsx` |
| Wallet C3–C7 | CreditHealthBar, RechargeModal, `deductCredits`, `quota_threshold_reached` | `components/CreditHealthBar.tsx` |
| Key expiry | `MockKey.expiresAt` / `status` | `lib/store.ts` |
| Analytics forwarding | `track()` + PostHog adapter pattern | `lib/telemetry.ts` |

## Steps

- **Step 0 — Backbone (no UI). ✅ DONE.** `lib/lifecycle.ts` (state machine, 24 stages + triggers + lead score) + `lib/nudges.ts` (26-entry catalog, selector, `useNudgeState`) + `forwardToMixpanel` + 34 new events + 29 unit tests. Green: tsc clean, 1034 tests pass. Store.ts untouched.
- **Step 1 — Rendering framework. ✅ DONE.** `components/nudges/*` (NudgeOrchestrator + NudgeBanner + NudgeModal + useLifecycleAccount adapter) mounted once in the layout after GrowthAlertsWatcher; banners stack at the top of content, one modal/celebration at a time, toast/progress ephemeral; dismiss/snooze/convert persisted; consumption cascade suppresses lower milestones; emits only `nudge_*` events. Green: tsc, lint, 29 unit + 3 e2e, 1034 tests. e2e/nudges.spec.ts.
- **Step 2 — Activation journey (C1-a…C3-f). ✅ DONE.** `detectTransitions` wires the one-shot celebrations that never fired before (C2-a granted, C3-a first-fire w/ confetti, C5-b/c upgrade, C7-a re-up) + emits the two un-emitted activation milestones (trial_granted, first_key_created); role/use-case capture modal (C1-b, skippable, safe defaults); consumption cascade already live from Step 1. Green: tsc/lint, 32 unit + 4 e2e, 1037 tests.
- **Step 3 — Conversion & wallet health (C4-a…C7-b). ✅ DONE.** Authoritative persisted trial window (in the nudge store, store.ts untouched); data-driven nudge copy (`context`/`resolveNudge`) — C4-a shows used%+days-left, C6-d shows projected runway; `detectStateMilestones` emits decision_window_entered / wallet_low / wallet_zero / dunning_started once per crossing. Green: tsc/lint, 36 unit + 5 e2e.
- **Step 4 — Trigger evaluator + channels. ✅ DONE.** `components/nudges/NudgeWatcher.tsx` (layout-mounted, cadence + simulated-time clock) fires the time/threshold milestone events the orchestrator doesn't (usage_threshold_hit, key_expiry_warned, key_expired, inactivity_detected), baselined so load doesn't burst; `lib/nudge-delivery.ts` re-engagement email/webhook over an Alert-Center-style ledger — capped multi-touch, unsubscribe-honouring, honest delivered/failed/skipped; nudge store gains the delivery ledger + touch counters + simulated offset. Verified live: a 30h simulated advance dispatched a delivered re-engagement email. Green: tsc/lint, 42 unit + 6 e2e.
- **Step 5 — Lead classification & sales routing. ✅ DONE.** Lead-class events (sales_qualified / sales_ready / hot_lead / dead_lead / lead_score_changed) emitted from NudgeWatcher on class change; `/console/journey` cockpit — journey board (C0→C7 by phase, funnel-tagged, your position + seeded-cohort distribution via accountFromDeveloper), lead & sales-routing panel, nudge-activity + re-engagement ledger, and a simulated clock to age the trial and fire triggers; nav row in Operations & Monitoring. Step 6 (pre-auth TOFU) handed to api-dashboard-ea. Green: tsc/lint, 43 unit + 7 e2e.
- **Step 6 — Pre-auth TOFU (C0-a, C0-b, C1-a). ✅ DONE.** C0-a landing mock-sandbox gate + intent pop-ups already shipped by the funnel engine (components/landing/ApiSandboxSection + IntentPopups) — reused, not rebuilt. Gap filled: functional signup SSO (GitHub + Google, was a dead affordance) emitting signup_started/signup_completed{method}, and a C0-b exit-intent value-reminder capture (components/preauth/SignupExitIntent). Verification (C1-a) handled by the activate flow. Green: tsc/lint, 3 e2e (e2e/preauth.spec.ts).
- **Step 7 — Instrumentation close-out.** Growth/Alert integration, PRD, roadmap/changelog, coverage-audit test.

## Coverage matrix (every row → step + Mixpanel event)

| Code | Nudge | Step | Mixpanel event | Pri | Funnel |
|---|---|---|---|---|---|
| C0-a | Landing value prop + mock sandbox | 6 | `landing_viewed`, `sandbox_fired` | P0 | Lead |
| C0-b | Signup/login SSO | 6 | `signup_started` | P0 | Lead |
| C1-a | Welcome modal + verify | 2/6 | `signup_completed`*, `email_verification_sent` | P0 | Lead |
| C1-b | Onboarding checklist + capture | 2 | `onboarding_step_completed`* | P1 | Lead |
| C1-c | Trial risk eval | reuse | `trial_risk_evaluated`* | P0 | Lead |
| C1-d | Phone OTP | reuse | `otp_challenge_shown`*/`otp_verified`* | P0 | Lead |
| C2-a | "$X credits" celebration | 2 | `trial_granted` | P0 | Lead |
| C2-b | First-key nudge | 2 | `first_key_created` | P0 | Lead |
| C3-a | Quickstart + first fire | 2 | `first_call_made`* | P0 | Lead |
| C3-b…f | Consumption 10/25/50/75/100% | 2/3 | `usage_threshold_hit(threshold_pct)` | P0-P1 | Lead |
| C4-a | Decision-window banner | 3 | `decision_window_entered` | P0 | Lead |
| C5-a | Dead lead / reactivation | 4/5 | `dead_lead`, `inactivity_detected`* | P1 | Lead |
| C5-b | Upgrade during trial | 3 | `credits_recharged`* | P0 | Lead |
| C5-c | Direct upgrade / Hot Lead | 3/5 | `hot_lead`, `plan_upgraded`* | P0 | Lead |
| C6-a…c | Paid wallet health | 3 | `wallet_health_evaluated` | P1-P2 | Feature |
| C6-d | Quick burn + auto-reload | 3/4 | `wallet_low`, `wallet_depleted` | P0 | Both |
| C7-a | Re-up | 3 | `credits_recharged`* | P1 | Feature |
| C7-b | Zero-balance dunning | 3/4 | `wallet_zero`, `dunning_started` | P0 | Both |
| Trigger | Key expiring 7d/1d | 3/4 | `key_expiry_warned(days_remaining)` | P1/P0 | Feature |
| Trigger | Key expired | 3/4 | `key_expired` | P0 | Feature |
| Trigger | Inactivity 7d | 4 | `inactivity_detected` | P1 | Lead |
| Trigger | Usage near limit 80% | 3 | `usage_threshold_hit(80)` | P0 | Lead |

`*` = event already emitted in the tree today. Every nudge also emits the lifecycle events
`nudge_shown` / `nudge_clicked` / `nudge_dismissed` / `nudge_snoozed` / `nudge_converted`.

## Cross-cutting

Frequency capping & suppression (P0 preempts, one modal at a time, `suppressWhen`); deterministic
simulated time for time-based triggers; Lead/Feature/Both funnel tag drives sales routing vs
health-only; pre-auth anonymous events vs post-auth store; tenant-scoped nudge state; RBAC on config;
per-step peer-footprint announce and commit sequencing.

## Verification (per step)

`tsc` clean · `next build` green · lint at baseline · unit tests for logic · a Playwright smoke ·
`/coherence-check` · design-reviewer ship · PRD update. Step 7 adds a coverage-audit test asserting
every C-code and trigger has a catalog entry and an event, so the table and code cannot drift.

## Changelog
- **2026-09-08** — Plan authored; decisions locked; **Steps 0–4 shipped green** (SSOTs+Mixpanel; rendering; transitions+milestones; conversion/wallet data-driven nudges; trigger watcher + re-engagement delivery over an Alert-Center-style ledger with simulated time; 42 unit + 6 e2e) (Claude, api-dashboard-66).
