# PRD: Brute-Force Login Protection

> Lock out credential-stuffing on the account sign-in: after a threshold of failed attempts an account is locked for a cooldown that escalates on each repeat, while a legitimate mistake just waits — a successful sign-in clears the counter.

**Status:** Built (prototype is the spec) · **Roadmap:** F-306 · **Routes:** enforced in `/login`, `/console/login-security`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The console sign-in accepted unlimited password attempts, so a credential-stuffing or brute-force attack against an account had no friction. Brute-force login protection adds a progressive lockout: after 5 consecutive failures an account locks for a cooldown that grows on each repeat lock cycle (30s → 2m → 15m → 1h). That makes automated guessing economically pointless while a real user who fat-fingers a password only waits a moment; a correct sign-in immediately resets the counter. It's the account-auth counterpart to the gateway's API-key intrusion tracking and the WAF (F-303) — hardening the human login rather than the API surface.

## 2. Goals & Non-Goals
**Goals**
- **Progressive lockout** on the sign-in: N consecutive failures → lock; escalating cooldown per repeat cycle; success resets.
- **Enforced at the login screen** — a locked account can't submit, with a live countdown and "attempts remaining" warnings.
- **Persistent** across reloads (a refresh must not bypass the lock).
- **Operable:** an admin incident console — locked/at-risk accounts, the policy, a simulator, and a one-click unlock for false alarms.
- **Deterministic policy** (testable; no `Math.random`).

**Non-Goals (this phase)** — real password verification (the prototype simulates failures via a demo "error"/"invalid" email); CAPTCHA / step-up MFA; IP-based or device fingerprinting (account-scoped only); email alerts to the account owner on lockout; server-side enforcement (this is the client console's own auth surface — no gateway route); a store-schema change (login-guard lives in its own persisted store, being a pre-auth concern).

## 3. Users & Personas
- **Account owner (land):** protected from someone brute-forcing their password; a mistyped password shows attempts-left, not a silent failure.
- **Security admin (expand):** sees locked accounts + attack patterns in the Login Security console and can unlock a legitimate user instantly.
- **Attacker (adversary):** hits an escalating wall after 5 tries — the feature's whole point.
- **RBAC:** the login enforcement is universal (pre-auth); the console is **admin-only** (viewing lockouts + unlocking is a privileged action).

## 4. Differentiation
Table-stakes auth hardening, tied to **win #6 (enterprise-grade security)**. The depth is in the **escalating cooldown** (not a flat lock), the **live, persistent** lock state surfaced on the login screen, and an **operable incident console with a simulator** so an admin can see the policy work and unlock false alarms — where most prototypes either skip lockout or hard-code a flat one with no visibility.

## 5. Data Model & Logic
Single source of truth: **`lib/brute-force.ts`** (pure policy + a dedicated persisted store).
- Pure (deterministic, `now` injected): `applyFailure` / `applySuccess` (reducers over a `LoginGuardEntry`), `isLocked`, `lockRemainingMs`, `attemptsRemaining`, `lockDurationForLevel`. Constants `MAX_FAILED_ATTEMPTS` (5), `LOCK_DURATIONS_MS` (30s/2m/15m/1h).
- **`useLoginGuard`** — a focused Zustand store persisted under its own key (`zinbit-login-guard`), **separate from the tenant store** because login runs before any tenant/session exists. Actions: `recordFailure`, `recordSuccess`, `unlockAccount`, `getGuard`, `seedGuards` (illustrative locked accounts). Keyed by normalized email.

## 6. State / Integration
- **Login enforcement** (`app/login/page.tsx`): before submit, a locked account is refused with a live cooldown; a failed attempt calls `recordFailure` and shows attempts-left (or the lockout); a success calls `recordSuccess`. The submit button disables while locked; a lock banner counts down each second.
- **Console** (`/console/login-security`, admin): KPIs (locked / tracked accounts, failed attempts, threshold), the escalating-cooldown policy, a **simulator** (record a failed/successful attempt for any email and watch the lock trigger), and the tracked-accounts list with **two-click unlock**. Reads `useLoginGuard` directly.
- **No gateway route, no tenant store slice.** Cross-links to the Security Hub.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, StatusBadge, ConfirmAction). Login: inline lock banner + countdown, attempts-left warning, disabled submit. Console: **empty** (no failed sign-ins), **populated** (accounts + live countdowns), simulator feedback via toasts. Semantic tokens; Framer Motion (row enter/exit); light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `login_blocked` (reason, lockLevel — from the login screen), `login_security_viewed`, `login_lockout_simulated` (locked, lockLevel), `login_guard_unlocked`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**8-case** suite: escalating `lockDurationForLevel`, count-without-lock below threshold, lock+reset at threshold, escalating cooldown across cycles, history cap, success clears lock, clock-respecting `isLocked`/`lockRemaining`, undefined-entry defaults) · isolated `next build` green (`/console/login-security` present) · Playwright smoke (`e2e/login-security.spec.ts` — console + a real /login lockout after 5 attempts) · manual: 5 failed sign-ins lock the account with a live countdown; unlock restores it. 0 console errors.

## 10. Deferred
Real password verification; CAPTCHA / step-up MFA after a lockout; IP + device signals; owner email alert on lockout; server-side/session enforcement; a global lockout policy editor; feeding lockout events into the audit log + Security Hub timeline.
