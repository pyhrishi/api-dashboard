# PRD: Session Management

> Every device and client signed into your account, scored against your active session and explained in plain English — so you can spot the one you don't recognize and end it. One click signs out everywhere but here.

**Status:** Built (prototype is the spec) · **Roadmap:** F-310 (Now → shipped) · **Console:** `/console/sessions` · **Source:** `lib/sessions.ts` (SSOT) + `lib/store.ts` (state)
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The store already tracked `activeSessions` (device/browser/location/ip/last-active) with a bare revoke, surfaced only as a flat table buried in Settings → Security. There was no signal to tell a safe session from a hostile one, no bulk "sign out everywhere", and no enterprise policy. Account-takeover is the highest-severity security event for a data API; the console needs to make a compromised session *obvious* and *one-click revocable*, and give admins a real session policy.

## 2. Goals & Non-Goals
**Goals**
- Rich, explainable per-session risk (new-country, new-city, external network, idle-past-policy, impossible-travel) — deterministic, never random.
- "Sign out everywhere else" + "revoke all stale" bulk actions that never touch the current session.
- An admin session policy (idle timeout, max concurrent) with a *real* effect — the idle timeout drives stale-flagging and the "revoke all stale" target set.
- A dedicated console beyond the old settings table (which keeps working, now cross-linked).

**Non-Goals (this phase)** — real server-side session tokens/JWT revocation (client-simulated); per-member org-wide session administration (deferred); step-up re-auth flows (MFA owns that, F-309); device fingerprinting; geolocation lookups (locations are seeded).

## 3. Users & Personas
- **Developers (land):** the 10-minute win — see every signed-in device, understand the risk rating, kill the unknown one.
- **Enterprise/security admin (expand):** set an org idle-timeout + concurrency cap; sign out everywhere on suspicion.
- **RBAC:** page visible to `admin | developer | billing` (own sessions); the policy panel is `admin`-only (also enforced in the store action).

## 4. Differentiation
Table-stakes account security (the GitHub/Stripe "your sessions" bar), shipped with our angle: **explained, deterministic risk**. Where competitors show a flat list, every session here carries a risk badge and a "why this rating?" that names the exact signals (a different country than your active session, an external IP, idle past your policy). The policy isn't decorative — raising/lowering the idle timeout visibly changes what's flagged stale and what "revoke all stale" clears. Cross-links to Login Security (F-306) and MFA (F-309) complete the security cluster.

## 5. Data Model & Logic
- **`lib/store.ts`:** `ActiveSession` extended (+`createdAt?`, +`type?: 'console'|'api'|'cli'`, back-compatible); new `sessionPolicy: { idleTimeoutMins, maxConcurrent }` (persisted, migrated in — persist v5); actions `revokeAllOtherSessions`, `revokeSessions(ids)` (both keep the current session), `updateSessionPolicy` (admin-gated + clamped). Re-seeded with a genuinely suspicious session (CLI, Ashburn US, public IP).
- **`lib/sessions.ts`** (SSOT, deterministic, no `Math.random`): `scoreSession(session, all, policy, now)` → `{ level, reasons[], isStale, isExternal, idleMs }` — compares each session to the active one (country/city), the network (`isPrivateIp`), and idle vs policy; `summarizeSessions` (KPI rollup + concurrency), `staleSessionIds` (the bulk-revoke target), `parseDevice` (OS + form factor), `relativeTime`, `DEFAULT_SESSION_POLICY`.
- Invariants (unit-tested, `src/lib/__tests__/sessions.test.ts`, 13 tests): device parsing; private/public IP; current=normal; same-city/private/recent=normal; different-city=elevated; foreign+external+stale=high (all reasons present); impossible-travel flag; determinism; summary counts + concurrency; stale-id selection; relative-time buckets.

## 6. API & Gateway
No gateway change — sessions are client/store state (no server session store in the prototype). The revoke actions mutate `activeSessions`; the current session is invariant across every revoke path.

## 7. UI
`/console/sessions` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (active/limit, this device, idle-stale, high-risk).
- **High-risk callout** — the wow: the flagged session with its reasons and an inline revoke.
- **"This device"** card (highlighted) + **Other sessions** list — each with device-OS icon, location + IP (private/external), last-active + since-created, a risk badge, and an expandable "why this rating?".
- **Actions:** "Sign out everywhere else" (ConfirmAction), "Revoke all stale (n)".
- **Admin policy panel:** idle-timeout + max-concurrent sliders with a real flagging effect.
- **States:** loading skeleton; empty ("no other sessions"); over-concurrency hint; risk callout. Framer Motion on callout + reason reveal. Cross-links: Security settings, Login Security, Logs.

## 8. Telemetry
`sessions_viewed {count}`, `session_revoked {risk, type}`, `sessions_revoked_all {count, scope?}`, `session_policy_updated {idleTimeoutMins, maxConcurrent}` — via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (13 new tests) · `next build` green (new `/console/sessions`) · Playwright smoke (`e2e/sessions.spec.ts`) · walkthrough: the seeded high-risk CLI session surfaces with its reasons; "sign out everywhere else" leaves only the current device; "revoke all stale" clears the idle Windows session.

## 10. Deferred
Real server-side token revocation; org-wide per-member session administration; step-up re-auth on sensitive actions; device fingerprint trust; live geo/IP lookups; session-created audit-log entries; email on new-device sign-in.
