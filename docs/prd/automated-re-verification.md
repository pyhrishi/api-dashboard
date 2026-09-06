# PRD: Automated Re-verification

> A rolling-schedule freshness engine: the `/console/re-verification` console, backed by a deterministic engine (`lib/reverification.ts`) and a store slice.

**Status:** Built (prototype is the spec) · **Roadmap:** F-041 (Next → shipped) · **Page:** `/console/re-verification` · **Engine:** `lib/reverification.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enriched data decays the moment it's captured — emails bounce, phones disconnect, people change jobs. A one-time enrichment is stale within months, and teams don't know which records went bad. Field-level freshness (F-040) shows *age*; automated re-verification acts on it — re-checking high-value fields on a rolling schedule and surfacing exactly what changed or decayed, so records self-heal.

## 2. Goals & Non-Goals
**Goals**
- A per-field-type **rolling cadence** (email / phone / employment) — the schedule that decides when a field is due for re-check.
- Re-verify due fields and report each outcome — **unchanged / updated / decayed** — with a human explanation (and the new value when it changed).
- A run history and roll-up counts; a "run now" action.
- Deterministic and RBAC-gated (billing read-only).

**Non-Goals (this phase)** — actually re-calling the live gateway per field (the outcomes are a deterministic simulation over a seeded pool); a background scheduler/cron (runs are user-triggered, modelling the cycle); auto-applying updates back into a source system; per-record notification/webhooks (that's F-042 Data decay alerts); predictive decay (F-291).

## 3. Users & Personas
- **RevOps / data steward (expand):** sets the cadence and runs re-verification; acts on decayed records.
- **Sales manager:** trusts that contact data is kept fresh automatically.
- **Developer:** sees which fields decayed to prune before a campaign.
- **RBAC:** `admin | developer` set cadence + run; `billing` views read-only (controls disabled; store actions throw for billing).

## 4. Differentiation
Most vendors sell enrichment as a one-shot; the operator-grade move is to treat freshness as a **continuous** property — a schedule that re-checks high-value fields and, crucially, tells you *what decayed* (bounced mailbox, disconnected line, job change) rather than silently serving stale data. It turns the F-040 freshness signal into an action, and pairs with the audit trail (F-038) as the data-quality backbone.

## 5. State & Data Model
Engine (deterministic SSOT): **`lib/reverification.ts`**.
- A curated pool of `ReverifiableRecord`s (entity, company, field type, value, last-verified) spanning ages so some are due. `DEFAULT_CADENCE = { email: 30, phone: 60, employment: 90 }` (days), clamped to `CADENCE_BOUNDS` [7, 180].
- `isDue` / `computeDueRecords` — due when age ≥ the field's cadence, computed against a fixed reference date (coherent with the freshness model).
- `reverifyField(record, cycle)` — a **deterministic** outcome seeded by FNV-1a over `(record, cycle)`: ~68% unchanged, ~20% updated (with a new value), ~12% decayed — each with a field-appropriate explanation. **No `Math.random`, no wall-clock in the outcome.** `reverifyRecords` rolls up the counts.

Zustand slice (`lib/store.ts`, added by the state-architect, keeping interface / initial state / `partialize` in sync):
- State: `reverificationCadence` (persisted) and `reverificationRuns` (persisted, capped at 20).
- Actions: `runReVerification(): ReVerificationRun` (re-verifies the currently-due records at `cycle = runs.length`, prepends the run, writes a `data.reverified` audit log; billing throws) and `setReverificationCadence(field, days)` (clamped; billing throws).

## 6. API & Gateway
None this phase — the engine is a deterministic simulation over a seeded pool. A `/v1` batch re-verification job is a natural follow-up (deferred).

## 7. UI
- **`/console/re-verification`** (`app/console/re-verification/page.tsx`, client component, `RoleGuard`):
  - **KPIs:** records monitored, due now, last-run updated, last-run decayed.
  - **Rolling schedule:** a cadence slider per field type (email/phone/employment), each showing how many records are due at that cadence; disabled for billing.
  - **Records due:** the fields past their cadence, with age.
  - **Latest run:** outcome roll-up badges + a per-record result list, **decayed and updated first** (the actionable ones), each with its explanation and new value.
  - **Run history:** prior runs with their counts.
  - A prominent **Run re-verification** action (disabled when nothing is due or for billing).
- Semantic tokens only; Framer Motion on result rows; toasts on run/error. **States:** loading skeleton, a true empty state (no runs yet), and the populated state — no layout shift.
- **Nav:** a role-filtered "Re-verification" entry (RefreshCw icon) beside the Match Audit Trail.

## 8. Telemetry
Typed events (`lib/telemetry.ts`): `reverification_viewed` on mount, `reverification_run` (`{ checked, updated, decayed }`) on a run, `reverification_cadence_changed` (`{ field, days }`) on a schedule change.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (7 new engine tests) · isolated `NEXT_DIST_DIR=.next-verify next build` green (`/console/re-verification` route emitted). Browser walkthrough: tighten a cadence → more records go due; run → outcomes appear with decayed/updated leading; billing role sees controls disabled.

## 10. Deferred
A real background scheduler/cron; live per-field gateway re-calls; auto-apply of updates to a source system; per-record decay alerts/webhooks (F-042); predictive data decay (F-291); a `/v1` re-verification batch job.
