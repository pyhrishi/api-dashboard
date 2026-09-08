# PRD: PLG KPI Framework (Growth dashboard)

| | |
|---|---|
| **Status** | Built (prototype) · reverse-engineered |
| **Owner** | Product (Zintlr) |
| **Last updated** | 2026-09-08 |
| **Prototype route(s)** | `/console/growth` · fire points in `/console/explorer`, every `ConfirmAction`, the recharge modal, `/docs` search |
| **Source artifacts** | `lib/growth-kpis.ts` (SSOT), `app/console/growth/page.tsx`, `lib/telemetry.ts` (event catalog), `components/ui/ConfirmAction.tsx`, `components/RechargeModal.tsx`, `components/DocsSearch.tsx`, `app/console/explorer/page.tsx`, `src/lib/__tests__/growthKpis.test.ts`, `e2e/growth-kpis.spec.ts` |
| **Roadmap** | F-390 Time-to-first-call tracking · F-195 Endpoint popularity heatmap · F-530 Cohort analysis |

## 1. Context & Problem

Zinbit is a product-led business: developers land, self-activate on a first API call, exhaust a trial, and pay. Until now the console measured "did this one user activate" (a four-milestone checklist) and nothing about a population: no drop-off per stage, no distribution of time-to-activate, no cohorts, no alerting. The PM cannot answer "where do developers leak, how long does activation take, and who should be paged when a number moves".

Leadership set the KPI framework on 2026-09-08 (TOFU / MOFU / BOFU funnel with drop-off, time-to-activate statistics against a <10 min target, power-user bands, trial usage and free → paid, invites, DAU/WAU, endpoint heatmap, revenue per signup-month cohort, health metrics, four alert thresholds with owners). This PRD is that framework as built in the prototype, and what production must add.

## 2. Goals & Non-Goals

**Goals**
- One screen answers the framework end to end, from the same event log every feature already writes to (`lib/telemetry.ts` → `telemetryEvents`).
- Every metric has a real source in the product; where one was missing (activation from the Explorer, destructive actions, recharge failures, docs search) the fire point was added.
- Population statistics (median, bands, week-over-week) are demonstrable in a single-user prototype through a deterministic, clearly labelled sample cohort merged with the live workspace.
- Alerts are evaluated from the data with an owner and a routing target; scenarios make them fire deterministically for review.
- A one-click weekly PM report (Markdown) renders the framework filled in.

**Non-goals**
- Persisting derived metrics (everything is recomputed from events).
- Real third-party delivery: channels are routed and ledgered in-product (§14); the mail relay, Slack app and webhook signing are production work.
- Phone-OTP itself: the trial gate lives in the shared auth service (see `auth-risk-based-phone-otp.md`); this dashboard consumes its completion rate as an external series.
- New alert *rules*: the four rules are fixed by the framework; their thresholds are tunable within guard-rails (§14).

## 3. Users & Personas

- **Product manager / founder** — weekly review of activation, leaks and alerts; copies the PM report into the ops doc.
- **Admin / billing owner** (RBAC: the page is admin + billing) — conversion, wallet health, revenue by cohort.
- **Eng on-call / Docs owner** — recipients of the routed alerts.

## 4. User Stories & Flows

1. As a PM I open Growth and see the TOFU → BOFU funnel with the drop-off at each stage and the biggest leak highlighted; I switch scope between *my workspace* and the *sample cohort + me*.
2. As a PM I read time-to-activate as min / median / avg / p90 / max and the share inside the 10-minute target, with a histogram of where activations land.
3. As a PM I check the power-user bands: how many developers sit in each 10% band and what share of calls the top 20% carry.
4. As a billing owner I check trial consumption and free → paid (paid, and "money in the wallet"), plus revenue per signup-month cohort.
5. As a PM I check DAU / WAU stickiness and the endpoint × hour heatmap to see when and on what developers integrate.
6. As Eng on-call I see the top-up failure alert firing with the number of declines, the threshold and the hypothesis; I expand the row for the reasoning.
7. As a PM I pick the *Provider incident* or *Activation regression* scenario to rehearse an alert review, then copy the PM report.

Fire-point flows: a developer who skips the wizard and clicks **Run** in the Explorer is counted as activated the first time a call succeeds; any two-click destructive confirmation records an event; choosing the expired saved card in the recharge modal reproduces a gateway decline (`card_expired`) with a designed error and retry; searching the API reference records the result count, and a no-result search hands the reader to Support.

## 5. Functional Requirements

- **FR-1 Funnel.** Five stages with bands: signed up (TOFU) → created an API key (MOFU) → activated = first successful API call (MOFU) → trial fully used = 100% of trial credits (BOFU) → paid = recharged or upgraded (BOFU). Each stage reports count, % of top, conversion from the previous stage and drop-off from the previous stage. `computeFunnel`.
- **FR-2 Activation predicate.** A developer is activated when a first successful API call exists, from any surface: the first-call wizard or the Explorer's Run. The Explorer MUST emit `first_call_made` (props `source: 'explorer'`) and mark the store flag on the first `2xx` response.
- **FR-3 Time-to-activate.** Duration from signup to first call; statistics min, max, avg, median, p90, share within `ACTIVATION_TARGET_MS` (10 min), and a 7-bucket histogram (≤2m, ≤5m, ≤10m, ≤30m, ≤2h, ≤1d, >1d). Same statistics for time to first key. `durationStats`.
- **FR-4 Power-user bands.** Activated developers ranked by 7-day calls and cut into ten 10% bands; each band reports developers, calls, share of calls and the minimum calls to qualify; the top two bands are "power". `usageBands`.
- **FR-5 Trial & conversion.** Share of activated developers at 100% trial usage, average trial usage, a 5-bucket distribution; free → paid = paid / signups; "money in wallet" = paid developers with a positive wallet balance; total revenue.
- **FR-6 Engagement.** 28-day DAU and WAU series; stickiness = DAU / WAU. `engagement`.
- **FR-7 Endpoint heatmap.** Endpoint × UTC-hour utilization: real request logs counted exactly; in population scope the cohort's endpoint mix is spread over a regional business-hours curve; top 12 endpoints; peak hour. Endpoint identity comes from `src/data/endpoints.ts`. `endpointHeatmap`.
- **FR-8 Revenue cohorts.** Group by `signupMonth` (`YYYY-MM`): developers, activated, paid, paid %, revenue, revenue per developer. `revenueCohorts`.
- **FR-9 Health.** Support tickets per active developer; destructive-action incident rate = reverted destructive actions / confirmed destructive actions; invites sent, accepted and per activated developer. `healthMetrics`.
- **FR-10 Alerts.** Four rules, evaluated every render from the same data, each with `value`, `status` (`ok` / `firing` / `insufficient-data`), an 8-week series, an owner and a hypothesis:

  | Rule | Comparator | Threshold | Owner | Source |
  |---|---|---|---|---|
  | Activation rate WoW change | `<` | −10 pp | Product | in-product |
  | Phone-OTP completion | `<` | 60% | Product | auth service |
  | Wallet top-up failure rate | `>` | 5% | Eng | in-product |
  | Docs search no-results rate | `>` | 20% | Docs owner | in-product |

  Live workspace counts (`credits_recharged`, `credits_recharge_failed`, `docs_search_performed`) are added to the current week. `evaluateAlerts`.
- **FR-11 Scenarios.** `current`, `provider-incident` (OTP 47%, top-up failures 8.3%), `activation-regression` (every other activation in the current week removed, docs no-results 27%). Deterministic; labelled in the UI and in the PM report.
- **FR-12 Scopes.** `workspace` = this console's own record only; `population` = seeded cohort (`COHORT_SIZE`) + the live record marked `isYou`. The population is always labelled a sample.
- **FR-13 Live record.** `liveDeveloperRecord` reconstructs this console's funnel from real state: signup (event, else org creation, else earliest event), first key (event, else key present), first call (event, else store flag, else a successful `explorer_run`), calls from the request log, paid from recharge/upgrade events, trial usage from the credit balance, destructive actions from `destructive_action_confirmed`, reverts from `merge_reverted` + `key_restored`.
- **FR-14 PM report.** `pmReportMarkdown` renders every section (funnel table, MOFU, BOFU, engagement & feature, advanced with the cohort table, alerts) with the 10-minute target called out; the page copies it to the clipboard.
- **FR-15 Fire points.** `destructive_action_confirmed { action }` from `ConfirmAction` on the confirming click (`actionId` prop, else the label); `credits_recharge_failed { pack, credits, reason: 'card_expired', gateway, paymentMethod }` from the recharge modal's declined path (no credits added, error with retry); `docs_search_performed { query≤40 chars, queryLength, results, noResults }` debounced 600 ms from `DocsSearch`; Growth emits `growth_kpis_viewed`, `growth_kpi_scope_changed`, `growth_scenario_changed`, `growth_alert_inspected`, `growth_pm_report_copied`.
- **FR-16 Determinism.** No `Math.random`. The cohort uses an FNV-seeded mulberry32 generator; `COHORT_SALT` is chosen so the steady-state week does not trip the WoW alert on sampling noise (tested).

## 6. Data Model

`DeveloperRecord` (derived, not persisted): `id`, `handle`, `company`, `region`, `signupAt`, `signupMonth`, `firstKeyAt|null`, `firstCallAt|null`, `callsTotal`, `calls7d`, `activeDays[]` (0 = today … 27), `trialCreditsUsedPct`, `paidAt|null`, `walletBalanceCredits`, `revenueUsd`, `plan`, `invitesSent`, `invitesAccepted`, `supportTickets`, `destructiveActions`, `destructiveReverts`, `endpointMix`, `isYou`.

Derived types: `FunnelStage`, `DurationStats`, `UsageBand`, `EngagementSeries`, `Heatmap`, `RevenueCohort`, `HealthMetrics`, `AlertRule` / `AlertEvaluation`, `KpiSnapshot`.

**Prototype storage:** nothing new is persisted; inputs are the existing `telemetryEvents` (capped 2 000, persisted), `apiLogs`, keys, credits, team, tickets. **Production:** events land in the analytics warehouse (PostHog forwarding already exists behind `NEXT_PUBLIC_POSTHOG_KEY`); `DeveloperRecord` becomes a per-account materialized view refreshed hourly; `signupAt` / `firstKeyAt` / `firstCallAt` come from server-side events, not the client.

## 7. API Contracts

N/A in the prototype (store-only). Production: `GET /internal/kpis?scope=&from=&to=` returning `KpiSnapshot` for the console, and the alert evaluator as a scheduled job posting to the owner's channel.

## 8. Non-Functional

- **RBAC:** page gated to `admin` + `billing` (`RoleGuard`); no mutations.
- **Multi-tenancy:** the live record is the active organization's; production scopes every query by org.
- **Privacy:** the cohort is synthetic; `docs_search_performed` carries the query capped at 40 characters (search terms, not PII); no email in any Growth event.
- **Performance:** all aggregation is O(developers × 28) and runs in a memo; the request log is read once.
- **Accessibility:** heatmap has a text summary; alert rows are buttons with `aria-expanded`; every icon-only control is labelled.
- **Observability:** the dashboard's own events land in the same log it reads.

## 9. Dependencies & Integrations

`lib/telemetry.ts` (event catalog), `src/data/endpoints.ts` (heatmap axis, docs search index), `lib/store.ts` (`telemetryEvents`, `apiLogs`, `isFirstCallMade`, `firstCallTimestamp`, `markFirstCallMade`, credits, team, tickets), the shared auth service (OTP completion feed, external), PostHog (optional forwarding). Cross-links: Analytics, Logs, Billing, Team, Explorer.

## 10. Milestones / Phasing

1. **Prototype (done):** SSOT + dashboard + fire points + seeded cohort + scenarios + PM report.
2. **Production M1:** server-side events for signup / key / first call; warehouse tables; the cohort seed replaced by real accounts (keep the seed for staging demos).
3. **M2:** scheduled alert evaluator with real routing (Slack / PagerDuty per owner), OTP completion ingested from the auth service.
4. **M3:** cohort retention curves and custom thresholds (F-194).

## 11. Success Metrics

- Median time-to-activate < 10 min for ≥ 70% of weekly signups.
- Activation rate (signup → first call) trending up week-over-week; no unexplained alert in 4 consecutive weeks.
- Free → paid ≥ 3% of signups per monthly cohort by M2.
- Docs no-results rate < 10% after the Docs owner works the top failed queries.

## 12. Open Questions

- Exact definition of "100% API usage in trial mode": implemented as 100% of trial credits consumed — confirm against the leadership wording.
- Is the <10 min target measured from signup (implemented) or from first key?
- Should the sample cohort be visible in production demos, or replaced by a "sample data" banner over real (sparse) data?
- Incident definition: implemented as "destructive action later reverted"; confirm whether support-ticket-linked destructive actions should count too.

## 13. Out of Scope

Real notification delivery; custom rules; phone-OTP implementation; retention curves; per-key (rather than per-developer) bands.

## 14. Alert Center, delivery & weekly digest (added 2026-09-08)

**Source:** `lib/growth-alerts.ts` (SSOT + persisted `useAlertCenter`), `app/console/alerts/page.tsx`, `components/GrowthAlertsWatcher.tsx` (the console-side scheduler + `useGrowthLiveInputs`), `components/NotificationBell.tsx`, nav badge in `app/console/layout.tsx`, Growth pulse on `app/console/overview/page.tsx`, ⌘K actions in `components/Omnibar.tsx`. Roadmap: F-194, F-526, F-553. Tests: `src/lib/__tests__/growthAlerts.test.ts`, `e2e/alert-center.spec.ts`.

- **FR-17 Incidents.** A firing rule opens one incident per rule, per ISO week, per org (`inc_<rule>_<week>_<source>_<org>`), status `open → acknowledged → resolved`. Acknowledge carries actor + optional note (≤280 chars); resolve is manual or `auto` when the rule recovers. Rehearsal incidents (Growth scenarios) are tagged `source: 'rehearsal'`, isolated from live ones, auto-resolved when the scenario returns to the current week, and clearable.
- **FR-18 Evaluation cadence.** `GrowthAlertsWatcher` is mounted in the console layout: it evaluates the effective rules against real state (population scope, no scenario) on mount, when the event log grows, when thresholds or the digest schedule change, and every 5 minutes; new incidents surface as in-app toasts and `growth_alert_fired`.
- **FR-19 Delivery.** Routing per owner: channels ⊆ {in-app (floor, cannot be removed), email, slack, webhook}, recipients, Slack channel, webhook URL. `planDeliveries` writes one ledger entry per target with a deterministic outcome: in-app delivered; email delivered per valid recipient, failed when none; Slack failed unless `#channel`; webhook failed unless `https://`. Test alerts per owner. Ledger capped at 500.
- **FR-20 Thresholds.** Admin-only overrides per rule, snapped and clamped to `THRESHOLD_BOUNDS` (activation −30…−5 pp, OTP 40…90%, top-up 1…20%, docs 5…50%). `effectiveRules` feeds `evaluateAlerts` everywhere (Growth page, watcher, Alert Center).
- **FR-21 Weekly PM digest.** Settings: enabled, cadence weekly|daily, ISO weekday, UTC hour, channels (no webhook), recipients, Slack channel, scope. `nextDigestRunAt` / `digestIsDue` define the schedule; the watcher runs a due digest recorded at the scheduled point; "Send now" runs it manually. Every run stores the rendered Markdown (`pmReportMarkdown`) with deliveries; history keeps 26 runs.
- **FR-22 Surfacing.** Header bell with unseen count + acknowledge; nav badge on Alert Center; Overview "Growth pulse" (activation rate + WoW, median time-to-activate, open alerts) and per-org open-alert count; ⌘K actions "Alert Center" and "Weekly PM digest".
- **RBAC.** Config (thresholds, routing, digest) admin-only; acknowledge/resolve admin, developer, billing; the page is visible to all three roles.
- **Production notes.** Evaluation moves to a scheduled job; deliveries become real integrations (SES/SendGrid, Slack app, signed webhooks) with retries and the same ledger schema; incident dedupe key stays rule × week × org.

---

## Changelog
- **2026-09-08** — Added §14: Alert Center, multi-channel delivery, weekly PM digest, Overview/nav/bell surfacing (Claude, api-dashboard-66).
- **2026-09-08** — Reverse-engineered from the prototype build: SSOT, dashboard, four fire points, seeded cohort, scenarios, PM report (Claude, api-dashboard-66).
