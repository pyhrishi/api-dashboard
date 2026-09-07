# PRD: MFA Enforcement

> An org admin can require multi-factor auth for the whole organization — members who haven't enrolled are gated (after a grace period) with a console-wide banner and a login redirect, until they set up an authenticator app.

**Status:** Built (prototype is the spec) · **Roadmap:** F-309 · **Routes:** enforced across `/console/*` + `/login`, `/console/mfa`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A personal 2FA toggle already existed, but nothing let an admin *require* it — so account security was opt-in and uneven. MFA enforcement adds the enterprise control: an admin flips the org policy to Required, a grace period gives everyone time to enroll, and after it, any member who hasn't set up MFA is blocked from the console (a persistent banner + a login-time redirect to enrollment) until they do. It's the org-level counterpart to the personal 2FA setting and a sibling of brute-force login protection (F-306) — hardening every account, not just the security-minded ones.

## 2. Goals & Non-Goals
**Goals**
- **Org policy** (Required / Optional) an admin can flip, with a **grace period** before enforcement bites.
- **Real enforcement:** when Required + not enrolled + past grace, a **console-wide gate banner** and a **login redirect** route the user to enrollment.
- **TOTP enrollment:** a secret (+ otpauth URI) and **recovery codes**, keeping the legacy personal `is2faEnabled` in sync.
- **Org-wide compliance** roster — who's enrolled and who isn't — for the admin.
- **Deterministic** secrets/codes (testable; no `Math.random`).

**Non-Goals (this phase)** — verifying an actual TOTP code against a real authenticator (enrollment is a confirm step); SMS/WebAuthn/passkey factors (TOTP + recovery codes only); a hard server-side session lock (the console is auto-authenticated in the prototype — enforcement is the gate banner + login redirect); per-role or per-resource MFA step-up; SCIM/IdP-driven policy; a tenant-store schema change (MFA policy lives in its own persisted store).

## 3. Users & Personas
- **Security/IT admin (expand):** turns on Required, watches compliance climb, and knows every member is covered — the enterprise checkbox for SOC2/vendor reviews.
- **Team member (land):** is walked through a 30-second authenticator setup with recovery codes when required.
- **RBAC:** the org **policy switch is admin-only**; anyone can enroll themselves; the page is viewable by `admin | developer | billing`. The enforcement banner applies to every signed-in user.

## 4. Differentiation
Table-stakes enterprise security done with real teeth, tied to **win #6 (enterprise-grade security)**. The depth is that it's **actually enforced** — a policy switch that produces a visible, unavoidable gate + a login redirect and a live compliance roster — rather than a settings toggle with no consequence. The grace period + recovery codes + legacy-flag sync are the operational details that make it deployable without locking people out.

## 5. Data Model & Logic
Single source of truth: **`lib/mfa.ts`** (pure helpers + a dedicated persisted store).
- Pure (deterministic; `now` injected): `isEnforced`, `inGracePeriod`, `memberCompliant` (enrollment or self's `is2faEnabled`), `orgCompliance` (counts + pct), `enrollmentRequired` (the gate predicate), `totpSecret` / `recoveryCodes` / `otpauthUri` (FNV-derived, stable per account).
- **`useMfaPolicy`** — a Zustand store persisted under its own key (`zinbit-mfa-policy`), separate from the tenant store. State: `policy`, `graceUntil`, `enrollments` (per email). Actions: `setPolicy` (Required applies a 7-day grace), `enroll` / `unenroll`, `regenerateRecovery`, `seedEnrollments`. Joined **read-only** with `teamMembers` + `user` + `is2faEnabled` from the main store.

## 6. State / Integration
- **Enforcement:** `components/MfaEnforcementBanner.tsx` renders inside `app/console/layout.tsx` (above the page) — a non-dismissible banner when `enrollmentRequired`, hidden on the MFA page. `app/login/page.tsx` redirects a signed-in user to `/console/mfa` instead of `/console` when they must enroll.
- **Console** (`/console/mfa`): compliance KPIs, an **admin** Required/Optional segmented control (grace-aware), a self **TOTP enrollment** flow (secret + copyable recovery codes → `enroll` + `enable2fa`), and the **member compliance roster**. Enrolling calls the existing `enable2fa` action so the personal setting stays consistent.
- **No tenant-store slice, no gateway route.** Cross-links to Security settings + Login Security.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, SegmentedControl, EmptyState, StatusBadge, ConfirmAction). **Gated** — red enrollment card/banner. **Not enrolled** — setup flow (secret + codes). **Enrolled** — protected state + regenerate/disable. **Non-admin** — policy shown read-only. **Empty** — no members. Semantic tokens; Framer Motion (banner/gate); light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `mfa_viewed`, `mfa_enrolled`, `mfa_policy_changed` (policy). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**10-case** suite: deterministic secret/recovery/otpauth, `isEnforced`/grace, `memberCompliant` via enrollment + self flag, `orgCompliance` counts/pct, `enrollmentRequired` across optional/required/grace/covered/no-user) · isolated `next build` green (`/console/mfa` present) · Playwright smoke (`e2e/mfa.spec.ts`) · manual: flip Required → the gate banner appears for a non-enrolled user; enroll → banner clears, compliance rises. 0 console errors.

## 10. Deferred
Real TOTP code verification; WebAuthn/passkeys/SMS factors; hard server-side session enforcement; per-role step-up MFA; IdP/SCIM-driven policy; admin-initiated reset of a member's MFA; feeding enrollment + policy changes into the audit log; a true per-account `is2faEnabled` (today the legacy flag is global).
