# PRD: Historical Identity Graph

> Trace how a contact's identity changed over their career — companies, emails, titles — all tied together by one persistent Zinbit ID.

**Status:** Built (prototype is the spec) · **Roadmap:** F-035 (Later → shipped) · **Page:** `/console/identity-history` · **Source:** `lib/identity-history-resolver.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
People change jobs, and CRM records rot: the email bounces, the title is stale, and the contact looks "lost" when they've simply moved. Teams need to see a contact's identity *over time* — that jane@oldco.com and j.doe@newco.com are the same person — so a record survives a job change instead of becoming a dead row.

## 2. Goals & Non-Goals
**Goals**
- From a work email, reconstruct the contact's identity timeline: companies, emails, titles, and the transitions between them.
- Tie every state to one persistent Zinbit ID.
- Render it as a readable career timeline.

**Non-Goals (this phase)** — real employment-history sourcing; editing / confirming states; future-state prediction (that's re-verification); a graph (node-link) layout beyond the timeline.

## 3. Users & Personas
- **RevOps / data steward (land + expand):** keeps CRM contacts alive across job changes — the 10-minute win.
- **Sales:** sees a champion's history to re-engage them at a new company.
- **RBAC:** the console is `admin | developer | billing`.

## 4. Differentiation
Persistent-identity products give you a stable ID; few show the *history* behind it as a legible timeline of employers, emails, and titles with typed transitions. Our angle is coherence with the persistent Zinbit ID (F-028) and the person resolver: the current state is the resolved person, seniority progresses coherently into the past, and every state resolves to the same ID — so "the same person across addresses" is visible, not just asserted.

## 5. Data Model & Logic
Single source of truth: **`lib/identity-history-resolver.ts`** — `resolveIdentityHistory(email)`, deterministic (no `Math.random`), on `resolvePersonFromEmail` + `zidForPerson`.
- Returns `null` for personal / unresolvable emails.
- The current state is anchored to the resolved person (email, company, title, seniority, location). Prior states are generated backwards: seniority decreases into the past (career progression), the function is preserved, prior employers/domains/emails and locations are derived, and periods are contiguous and non-overlapping (an older role ends exactly when the newer one starts).
- Transitions between consecutive states are typed — `job_change` / `promotion` (seniority step-up) / `relocation` (location change) / `email_change` — each with a human detail.
- Reports `zinbit_id`, `span_years`, `employer_count`, and the current state id.
- Invariants (unit-tested, `lib/__tests__/identityHistoryResolver.test.ts`, 7 tests): determinism; personal-null; exactly one current state anchored to the person; contiguous non-overlapping periods (newest→oldest); seniority progression; one Zinbit ID + distinct employer count; an email-change transition per prior role.

## 6. API & Gateway
- `GET /v1/people/identity-history?email=…` (catalog entry, 3 credits) → the `IdentityHistory` object. Resolved in `src/lib/sandboxAPI.ts` via a `people-identity-history` case (`NO_HISTORY` for personal/unresolvable). No route.ts change.

## 7. UI
- **`/console/identity-history`** (`app/console/identity-history/page.tsx`, `RoleGuard admin|developer|billing`): a persistent-Zinbit-ID header, KPIs (employers, career span, identity states, transitions), and a vertical **career timeline** — each state a company/title/period node with its email + location and the typed transition chips that led out of it (promotions highlighted). States: idle, loading skeletons, error, populated. Semantic tokens, Framer Motion.
- **Nav:** "Identity History" (Route icon) beside Identity Resolution.

## 8. Telemetry
`identity_history_viewed` (on view), `identity_history_resolved` (employers, states, span). Registered in `lib/telemetry.ts` (identity group).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (7 new tests) · live gateway smoke: `sarah.chen@shopify.com` → 3 employers over 9.4 years, coherent seniority progression (VP → Director → Manager), one Zinbit ID, contiguous periods.

## 10. Deferred
Real employment-history sourcing; state confirmation / editing; a node-link graph; batch history; linking history states to the identity-resolution cluster; future-move prediction.
