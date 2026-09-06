/**
 * F-306 Brute-force login protection — lockout policy tests.
 * Pure functions with injected `now`; deterministic, no network.
 */
import {
  applyFailure, applySuccess, isLocked, lockRemainingMs, attemptsRemaining,
  lockDurationForLevel, MAX_FAILED_ATTEMPTS, LOCK_DURATIONS_MS, type LoginGuardEntry,
} from '@/lib/brute-force';

const T = 1_700_000_000_000;

describe('lockDurationForLevel', () => {
  it('grows per level and caps at the longest', () => {
    expect(lockDurationForLevel(1)).toBe(LOCK_DURATIONS_MS[0]);
    expect(lockDurationForLevel(2)).toBe(LOCK_DURATIONS_MS[1]);
    expect(lockDurationForLevel(99)).toBe(LOCK_DURATIONS_MS[LOCK_DURATIONS_MS.length - 1]);
    expect(lockDurationForLevel(0)).toBe(LOCK_DURATIONS_MS[0]);
  });
});

describe('applyFailure', () => {
  it('counts consecutive failures without locking below the threshold', () => {
    let e: LoginGuardEntry | undefined;
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + i);
    expect(e!.failedCount).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(isLocked(e, T + 100)).toBe(false);
    expect(attemptsRemaining(e)).toBe(1);
  });

  it('locks at the threshold and resets the counter for the next cycle', () => {
    let e: LoginGuardEntry | undefined;
    for (let i = 1; i <= MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + i);
    expect(e!.lockLevel).toBe(1);
    expect(isLocked(e, T + MAX_FAILED_ATTEMPTS)).toBe(true);
    expect(e!.failedCount).toBe(0); // reset for the next cycle
    expect(lockRemainingMs(e, T + MAX_FAILED_ATTEMPTS)).toBeGreaterThan(0);
  });

  it('escalates the cooldown on each repeat lock cycle', () => {
    let e: LoginGuardEntry | undefined;
    // First lock cycle.
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + i);
    const firstDur = e!.lockedUntil - T;
    // Second lock cycle (another N failures).
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + 1000 + i);
    expect(e!.lockLevel).toBe(2);
    const secondDur = e!.lockedUntil - (T + 1000 + MAX_FAILED_ATTEMPTS - 1);
    expect(secondDur).toBeGreaterThan(firstDur);
  });

  it('caps history length', () => {
    let e: LoginGuardEntry | undefined;
    for (let i = 0; i < 40; i++) e = applyFailure(e, 'a@x.com', T + i);
    expect(e!.history.length).toBeLessThanOrEqual(20);
  });
});

describe('applySuccess', () => {
  it('clears the counter and any lock', () => {
    let e: LoginGuardEntry | undefined;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + i);
    expect(isLocked(e, T + 10)).toBe(true);
    e = applySuccess(e, 'a@x.com', T + 20);
    expect(isLocked(e, T + 21)).toBe(false);
    expect(e.failedCount).toBe(0);
    expect(e.lockLevel).toBe(0);
    expect(e.history[0].ok).toBe(true);
  });
});

describe('helpers', () => {
  it('isLocked / lockRemaining respect the clock', () => {
    let e: LoginGuardEntry | undefined;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) e = applyFailure(e, 'a@x.com', T + i);
    const until = e!.lockedUntil;
    expect(isLocked(e, until - 1)).toBe(true);
    expect(isLocked(e, until + 1)).toBe(false);
    expect(lockRemainingMs(e, until + 1)).toBe(0);
  });
  it('undefined entry is unlocked with full attempts', () => {
    expect(isLocked(undefined, T)).toBe(false);
    expect(attemptsRemaining(undefined)).toBe(MAX_FAILED_ATTEMPTS);
  });
});
