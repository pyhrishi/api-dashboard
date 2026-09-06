/**
 * Circuit breaker (F-066) — per-upstream failure isolation.
 *
 * Each upstream data provider (see upstreams.ts) gets its own breaker, keyed by
 * name. Consecutive failures trip it OPEN so requests that depend on that upstream
 * shed load immediately (503 + Retry-After) instead of piling onto a dead
 * backend; after a cooldown it goes HALF_OPEN to probe recovery, and one success
 * closes it. One flaky upstream never takes down the rest of the API.
 *
 * Generic and deterministic (no `Math.random`): the same sequence of
 * success/failure calls always yields the same state. In-memory, per-process.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  totalRequests: number;
  totalFailures: number;
  openedAt: number;
  trippedCount: number;
  /** Manual override for drills: forced OPEN (drain) or CLOSED (pin healthy). */
  forced: 'OPEN' | 'CLOSED' | null;
}

const breakers = new Map<string, CircuitBreakerState>();

// Thresholds
export const FAILURE_THRESHOLD = 3; // 3 consecutive failures trips the breaker
export const COOLDOWN_MS = 30_000; // 30s cooldown before half-open

function ensure(name: string): CircuitBreakerState {
  let cb = breakers.get(name);
  if (!cb) {
    cb = { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, totalRequests: 0, totalFailures: 0, openedAt: 0, trippedCount: 0, forced: null };
    breakers.set(name, cb);
  }
  return cb;
}

/** Current state, honoring a manual override and the OPEN→HALF_OPEN cooldown. */
export function getCircuitState(name: string): CircuitState {
  const cb = breakers.get(name);
  if (!cb) return 'CLOSED';
  if (cb.forced) return cb.forced;
  if (cb.state === 'OPEN') {
    if (Date.now() - cb.lastFailureTime > COOLDOWN_MS) {
      cb.state = 'HALF_OPEN';
      return 'HALF_OPEN';
    }
    return 'OPEN';
  }
  return cb.state;
}

/** Record a successful call — closes the breaker (recovery from HALF_OPEN). */
export function recordSuccess(name: string): void {
  const cb = ensure(name);
  cb.totalRequests += 1;
  cb.failureCount = 0;
  if (cb.forced !== 'OPEN') cb.state = 'CLOSED';
}

/** Record a failed call — trips OPEN at the threshold, or immediately from HALF_OPEN. */
export function recordFailure(name: string): void {
  const cb = ensure(name);
  cb.totalRequests += 1;
  cb.totalFailures += 1;
  cb.failureCount += 1;
  cb.lastFailureTime = Date.now();
  const effective = cb.forced ?? cb.state;
  if (effective === 'HALF_OPEN' || cb.failureCount >= FAILURE_THRESHOLD) {
    if (cb.state !== 'OPEN') { cb.trippedCount += 1; cb.openedAt = Date.now(); }
    cb.state = 'OPEN';
  }
}

/** Manually force a breaker OPEN (drain) / CLOSED (pin), or 'auto' to clear the override. */
export function forceCircuit(name: string, mode: 'OPEN' | 'CLOSED' | 'auto'): void {
  const cb = ensure(name);
  if (mode === 'auto') {
    cb.forced = null;
    cb.state = 'CLOSED';
    cb.failureCount = 0;
    return;
  }
  cb.forced = mode;
  if (mode === 'OPEN') {
    if (cb.state !== 'OPEN') { cb.trippedCount += 1; cb.openedAt = Date.now(); }
    cb.state = 'OPEN';
    cb.lastFailureTime = Date.now();
  } else {
    cb.state = 'CLOSED';
    cb.failureCount = 0;
  }
}

export interface CircuitSnapshot {
  state: CircuitState;
  failureCount: number;
  totalRequests: number;
  totalFailures: number;
  failureRate: number; // 0..1 over the process lifetime
  trippedCount: number;
  openedAt: number;
  /** ms until the OPEN breaker probes HALF_OPEN (0 when not open). */
  cooldownRemainingMs: number;
  forced: 'OPEN' | 'CLOSED' | null;
}

/** A rich view of one breaker for the console / stats endpoint. */
export function getCircuitSnapshot(name: string): CircuitSnapshot {
  const cb = breakers.get(name);
  const state = getCircuitState(name); // resolves cooldown → HALF_OPEN
  if (!cb) {
    return { state: 'CLOSED', failureCount: 0, totalRequests: 0, totalFailures: 0, failureRate: 0, trippedCount: 0, openedAt: 0, cooldownRemainingMs: 0, forced: null };
  }
  const cooldownRemainingMs = cb.state === 'OPEN' && !cb.forced
    ? Math.max(0, COOLDOWN_MS - (Date.now() - cb.lastFailureTime))
    : 0;
  return {
    state,
    failureCount: cb.failureCount,
    totalRequests: cb.totalRequests,
    totalFailures: cb.totalFailures,
    failureRate: cb.totalRequests === 0 ? 0 : Math.round((cb.totalFailures / cb.totalRequests) * 100) / 100,
    trippedCount: cb.trippedCount,
    openedAt: cb.openedAt,
    cooldownRemainingMs,
    forced: cb.forced,
  };
}

/** Reset all breakers — test-only. */
export function __resetCircuits(): void {
  breakers.clear();
}
