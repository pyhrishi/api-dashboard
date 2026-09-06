/**
 * Brute-force login protection (F-306) — lock out credential-stuffing on the console login.
 *
 * The account sign-in used to accept unlimited password attempts. This adds a
 * progressive lockout: after a threshold of consecutive failures an account is
 * locked for a cooldown that grows on each repeat lock cycle (30s → 2m → 15m → 1h),
 * so a stuffing attack is throttled to uselessness while a legitimate fat-fingered
 * password just waits a moment. A successful sign-in clears the counter.
 *
 * This is a PRE-authentication concern (it runs before any tenant/session exists),
 * so it lives in its own small persisted Zustand store rather than the tenant store
 * — the login page and the security console both read it. Pure policy math is
 * exported separately (deterministic; `now` is injected) for testing and the UI.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Consecutive failures that trip a lock. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Cooldown per lock level (ms) — grows on each repeat lock. */
export const LOCK_DURATIONS_MS = [30_000, 2 * 60_000, 15 * 60_000, 60 * 60_000];
/** How many recent attempts to retain per account. */
const HISTORY_CAP = 20;

export interface LoginAttempt {
  at: number;
  ok: boolean;
  /** Best-effort source label (deterministic in the prototype). */
  source: string;
}

export interface LoginGuardEntry {
  email: string;
  /** Consecutive failures in the current cycle. */
  failedCount: number;
  /** How many times this account has been locked (drives the cooldown length). */
  lockLevel: number;
  /** Epoch ms the lock lifts, or 0 when not locked. */
  lockedUntil: number;
  firstFailedAt: number;
  lastAttemptAt: number;
  history: LoginAttempt[];
}

// ── Pure policy (deterministic; now injected) ────────────────────────────────

/** The cooldown (ms) for a given lock level (1-based), capped at the longest. */
export function lockDurationForLevel(level: number): number {
  const i = Math.max(0, Math.min(LOCK_DURATIONS_MS.length - 1, level - 1));
  return LOCK_DURATIONS_MS[i];
}

export function isLocked(entry: LoginGuardEntry | undefined, now: number): boolean {
  return !!entry && entry.lockedUntil > now;
}

export function lockRemainingMs(entry: LoginGuardEntry | undefined, now: number): number {
  return entry ? Math.max(0, entry.lockedUntil - now) : 0;
}

export function attemptsRemaining(entry: LoginGuardEntry | undefined): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - (entry?.failedCount ?? 0));
}

const freshEntry = (email: string, now: number): LoginGuardEntry => ({
  email, failedCount: 0, lockLevel: 0, lockedUntil: 0, firstFailedAt: now, lastAttemptAt: now, history: [],
});

/**
 * Apply one failed attempt to an entry, returning the next entry. When the failure
 * count reaches the threshold, the account locks (cooldown by the next lock level)
 * and the count resets for the next cycle. Pure.
 */
export function applyFailure(prev: LoginGuardEntry | undefined, email: string, now: number, source = 'unknown'): LoginGuardEntry {
  const base = prev ?? freshEntry(email, now);
  const history = [{ at: now, ok: false, source }, ...base.history].slice(0, HISTORY_CAP);
  const failedCount = base.failedCount + 1;
  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    const lockLevel = base.lockLevel + 1;
    return { ...base, failedCount: 0, lockLevel, lockedUntil: now + lockDurationForLevel(lockLevel), lastAttemptAt: now, firstFailedAt: base.failedCount === 0 ? now : base.firstFailedAt, history };
  }
  return { ...base, failedCount, lastAttemptAt: now, firstFailedAt: base.failedCount === 0 ? now : base.firstFailedAt, history };
}

/** Apply a success — clears the counter + lock, keeps a trimmed history. Pure. */
export function applySuccess(prev: LoginGuardEntry | undefined, email: string, now: number, source = 'unknown'): LoginGuardEntry {
  const base = prev ?? freshEntry(email, now);
  return { ...base, failedCount: 0, lockLevel: 0, lockedUntil: 0, lastAttemptAt: now, history: [{ at: now, ok: true, source }, ...base.history].slice(0, HISTORY_CAP) };
}

const normEmail = (e: string) => String(e ?? '').trim().toLowerCase();

// ── Persisted store (pre-auth; its own key, not the tenant store) ────────────

export interface LoginGuardState {
  guards: Record<string, LoginGuardEntry>;
  /** Record a failed sign-in; returns the resulting entry (check isLocked on it). */
  recordFailure: (email: string, source?: string) => LoginGuardEntry;
  /** Record a successful sign-in (clears the account's lock/counter). */
  recordSuccess: (email: string, source?: string) => void;
  /** Admin: lift a lock + clear the counter for an account. */
  unlockAccount: (email: string) => void;
  /** Read a guard entry (normalized email). */
  getGuard: (email: string) => LoginGuardEntry | undefined;
  /** Seed illustrative locked accounts (idempotent) so the console isn't empty. */
  seedGuards: () => void;
}

export const useLoginGuard = create<LoginGuardState>()(
  persist(
    (set, get) => ({
      guards: {},
      recordFailure: (email, source = 'password') => {
        const key = normEmail(email);
        const next = applyFailure(get().guards[key], key, Date.now(), source);
        set((s) => ({ guards: { ...s.guards, [key]: next } }));
        return next;
      },
      recordSuccess: (email, source = 'password') => {
        const key = normEmail(email);
        set((s) => ({ guards: { ...s.guards, [key]: applySuccess(s.guards[key], key, Date.now(), source) } }));
      },
      unlockAccount: (email) => {
        const key = normEmail(email);
        set((s) => {
          const e = s.guards[key];
          if (!e) return {};
          return { guards: { ...s.guards, [key]: { ...e, failedCount: 0, lockLevel: 0, lockedUntil: 0 } } };
        });
      },
      getGuard: (email) => get().guards[normEmail(email)],
      seedGuards: () => set((s) => {
        if (Object.keys(s.guards).length > 0) return {};
        const now = Date.now();
        return {
          guards: {
            'attacker@evil.example': { email: 'attacker@evil.example', failedCount: 0, lockLevel: 3, lockedUntil: now + 12 * 60_000, firstFailedAt: now - 20 * 60_000, lastAttemptAt: now - 8 * 60_000, history: Array.from({ length: 6 }, (_, i) => ({ at: now - (i + 1) * 60_000, ok: false, source: 'password' })) },
            'jordan@acme.com': { email: 'jordan@acme.com', failedCount: 2, lockLevel: 0, lockedUntil: 0, firstFailedAt: now - 90_000, lastAttemptAt: now - 30_000, history: [{ at: now - 30_000, ok: false, source: 'password' }, { at: now - 90_000, ok: false, source: 'password' }] },
          },
        };
      }),
    }),
    { name: 'zinbit-login-guard', storage: createJSONStorage(() => localStorage) },
  ),
);
