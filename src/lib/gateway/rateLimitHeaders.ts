/**
 * Standard rate-limit headers (F-130) — the IETF-draft RateLimit-* header set (SSOT).
 *
 * The gateway used to emit only the vendor-prefixed `X-RateLimit-*` headers (and only
 * on a 429). This module produces the emerging *standard* set from
 * draft-ietf-httpapi-ratelimit-headers — `RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset` (as delta-seconds), and `RateLimit-Policy` — on EVERY response,
 * plus `Retry-After` on a 429, while keeping `X-RateLimit-*` for backward compatibility.
 * One helper, consumed by both the Edge middleware (which sets them) and the console
 * inspector (which parses them), so what we send is exactly what we document.
 *
 * Edge-safe (no Node APIs), pure, deterministic — the caller passes `now`.
 */

/** The token-bucket window the policy advertises (100 tokens / 60s). */
export const RATE_LIMIT_WINDOW_SEC = 60;

export interface RateLimitState {
  limit: number;
  remaining: number;
  /** Epoch seconds when the bucket is full again (as the limiter reports it). */
  reset: number;
}

/**
 * Build the full header set for a response. Standard `RateLimit-*` carry the reset as
 * delta-seconds (per the draft); legacy `X-RateLimit-Reset` keeps the epoch timestamp
 * for clients that already parse it that way.
 */
export function buildRateLimitHeaders(state: RateLimitState, nowMs: number = Date.now()): Record<string, string> {
  const nowSec = Math.floor(nowMs / 1000);
  const limit = Math.max(0, Math.floor(state.limit));
  const remaining = Math.max(0, Math.floor(state.remaining));
  const resetDelta = Math.max(0, state.reset - nowSec);
  return {
    // IETF draft standard.
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(resetDelta),
    'RateLimit-Policy': `${limit};w=${RATE_LIMIT_WINDOW_SEC}`,
    // Legacy vendor-prefixed (kept for backward compatibility).
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(state.reset),
  };
}

/**
 * Seconds a client should wait before retrying after a 429 — the time until the next
 * token at the advertised refill rate (limit / window), floored to 1s.
 */
export function retryAfterSeconds(state: RateLimitState): number {
  const perToken = state.limit > 0 ? Math.ceil(RATE_LIMIT_WINDOW_SEC / state.limit) : RATE_LIMIT_WINDOW_SEC;
  return Math.max(1, perToken);
}

/** The header set for a 429 — the standard/legacy set plus `Retry-After`. */
export function buildRateLimitedHeaders(state: RateLimitState, nowMs: number = Date.now()): Record<string, string> {
  return { ...buildRateLimitHeaders(state, nowMs), 'Retry-After': String(retryAfterSeconds(state)) };
}

export interface ParsedRateLimit {
  limit: number | null;
  remaining: number | null;
  /** Delta-seconds until reset (from the standard header, else derived from the legacy epoch). */
  resetSeconds: number | null;
  policy: string | null;
  retryAfter: number | null;
  /** Which header family the response used. */
  standard: boolean;
}

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parse rate-limit headers off a response (the console inspector). Prefers the
 * standard `RateLimit-*`; falls back to `X-RateLimit-*` (converting the epoch reset
 * to delta-seconds).
 */
export function parseRateLimitHeaders(get: (name: string) => string | null, nowMs: number = Date.now()): ParsedRateLimit {
  const stdLimit = get('RateLimit-Limit');
  const standard = stdLimit != null && stdLimit.trim() !== '';
  const nowSec = Math.floor(nowMs / 1000);
  if (standard) {
    return {
      limit: num(stdLimit),
      remaining: num(get('RateLimit-Remaining')),
      resetSeconds: num(get('RateLimit-Reset')),
      policy: get('RateLimit-Policy'),
      retryAfter: num(get('Retry-After')),
      standard: true,
    };
  }
  const legacyReset = num(get('X-RateLimit-Reset'));
  return {
    limit: num(get('X-RateLimit-Limit')),
    remaining: num(get('X-RateLimit-Remaining')),
    resetSeconds: legacyReset != null ? Math.max(0, legacyReset - nowSec) : null,
    policy: null,
    retryAfter: num(get('Retry-After')),
    standard: false,
  };
}
