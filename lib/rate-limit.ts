/**
 * Token-bucket rate limiting (F-129) — the bucket model (SSOT).
 *
 * The gateway rate-limits every key with a token bucket: a key may burst up to
 * `capacity` requests instantly, then is throttled to the steady refill rate.
 * This module is the single source of truth for those constants and a pure,
 * deterministic simulator for previewing burst behaviour without spending real
 * calls — the same math the gateway limiter (src/lib/gateway/rateLimiter.ts)
 * runs, so the console and the real limiter never disagree.
 *
 * Edge-safe (pure — no Node deps, no Math.random): the limiter imports the
 * constants from here.
 */

export const RATE_LIMIT = {
  /** Maximum burst — tokens available instantly from a full bucket. */
  capacity: 100,
  /** Steady-state refill rate (tokens per minute). */
  refillPerMinute: 100,
} as const;

export const refillPerMs = RATE_LIMIT.refillPerMinute / 60_000;
export const refillPerSecond = RATE_LIMIT.refillPerMinute / 60;

export interface BurstStep {
  /** 0-based request index. */
  index: number;
  /** Tokens remaining after this request (floored). */
  remaining: number;
  /** Whether this request was allowed (true) or rate-limited/429 (false). */
  allowed: boolean;
}

/**
 * Simulate firing `count` requests spaced at `ratePerSecond`, starting from a
 * full bucket. Between requests the bucket refills by the elapsed time. Returns
 * a per-request timeline. Deterministic.
 */
export function simulateBurst(count: number, ratePerSecond: number, capacity: number = RATE_LIMIT.capacity): BurstStep[] {
  const n = Math.max(0, Math.min(1000, Math.floor(count)));
  const intervalMs = ratePerSecond > 0 ? 1000 / ratePerSecond : 0;
  let tokens = capacity;
  const steps: BurstStep[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0 && intervalMs > 0) tokens = Math.min(capacity, tokens + intervalMs * refillPerMs);
    const allowed = tokens >= 1;
    if (allowed) tokens -= 1;
    steps.push({ index: i, remaining: Math.floor(tokens), allowed });
  }
  return steps;
}

export interface BurstSummary {
  total: number;
  allowed: number;
  throttled: number;
  /** Index of the first 429, or null if none. */
  firstThrottle: number | null;
}

export function summarizeBurst(steps: BurstStep[]): BurstSummary {
  const throttled = steps.filter((s) => !s.allowed);
  return {
    total: steps.length,
    allowed: steps.length - throttled.length,
    throttled: throttled.length,
    firstThrottle: throttled.length ? throttled[0].index : null,
  };
}

/** Bucket fill as a 0–100 percentage. */
export function fillPct(remaining: number, capacity: number = RATE_LIMIT.capacity): number {
  if (capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((remaining / capacity) * 100)));
}

/** Whole seconds to earn back one token when empty — the Retry-After a 429 advertises. */
export function retryAfterSeconds(): number {
  return Math.max(1, Math.ceil(1 / refillPerSecond));
}

/** Human "N req/min" sustained + burst description. */
export const rateSummary = (): string =>
  `${RATE_LIMIT.refillPerMinute} req/min sustained · burst up to ${RATE_LIMIT.capacity}`;
