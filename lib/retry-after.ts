/**
 * Graceful 429 with retry-after (F-134) — the client-side retry model (SSOT).
 *
 * When the gateway returns 429 (rate-limited) or a 5xx, a well-behaved client
 * shouldn't hammer it — it should back off. If the response carries a
 * `Retry-After`, the client should honour it exactly; otherwise it falls back
 * to exponential backoff with jitter, capped. This module is the single source
 * of truth for that policy: parsing Retry-After (seconds or HTTP-date),
 * computing the next delay, deciding whether to retry, building a retry
 * timeline for the console visualizer, and a `fetchWithRetry` wrapper.
 *
 * Deterministic where it matters: the jitter is seeded (no Math.random) so the
 * visualizer reproduces; a real client can pass its own jitter if it wants
 * true randomness.
 */

export interface RetryPolicy {
  /** Total attempts, including the first (so 5 = 1 try + 4 retries). */
  maxAttempts: number;
  /** Base backoff before the first retry (ms). */
  baseDelayMs: number;
  /** Cap on any single delay (ms). */
  maxDelayMs: number;
  /** Exponential multiplier per retry. */
  multiplier: number;
}

export const DEFAULT_POLICY: RetryPolicy = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 30_000, multiplier: 2 };

/** Statuses worth retrying: rate-limited or transient server errors. */
export const isRetryableStatus = (status: number): boolean => status === 429 || (status >= 500 && status < 600);

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** Deterministic jitter fraction in [0,1) for a given retry index. */
const jitterFraction = (retryIndex: number): number => (fnv1a(`retry:${retryIndex}`) % 1000) / 1000;

/**
 * Parse a `Retry-After` header into milliseconds from `now`. Accepts an integer
 * number of seconds or an HTTP-date. Returns null when absent/invalid, and
 * clamps negatives (a past date) to 0.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return Math.max(0, parseInt(trimmed, 10) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/**
 * The delay before the retry at `retryIndex` (0 = first retry). If the server
 * gave a `Retry-After` (retryAfterMs), honour it (capped); otherwise exponential
 * backoff (base·multiplier^index) with equal-jitter, capped at maxDelayMs.
 */
export function backoffDelay(retryIndex: number, policy: RetryPolicy = DEFAULT_POLICY, retryAfterMs: number | null = null): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, policy.maxDelayMs);
  const exp = policy.baseDelayMs * Math.pow(policy.multiplier, Math.max(0, retryIndex));
  const capped = Math.min(exp, policy.maxDelayMs);
  // Equal jitter: half fixed, half jittered — smooths thundering herds.
  return Math.round(capped / 2 + (capped / 2) * jitterFraction(retryIndex));
}

/** Should we retry after this response, given how many retries we've done? */
export function shouldRetry(status: number, retryIndex: number, policy: RetryPolicy = DEFAULT_POLICY): boolean {
  return isRetryableStatus(status) && retryIndex < policy.maxAttempts - 1;
}

export interface RetryStep {
  /** 1-based attempt number this delay precedes. */
  attempt: number;
  delayMs: number;
  cumulativeMs: number;
  honoredRetryAfter: boolean;
}

/**
 * The full retry schedule for the visualizer: the delay before each retry.
 * `retryAfterMs`, when given, is honoured on the FIRST retry (as a 429 would),
 * then exponential backoff takes over.
 */
export function retryTimeline(policy: RetryPolicy = DEFAULT_POLICY, retryAfterMs: number | null = null): RetryStep[] {
  const steps: RetryStep[] = [];
  let cumulative = 0;
  for (let i = 0; i < policy.maxAttempts - 1; i++) {
    const honored = i === 0 && retryAfterMs != null;
    const delay = backoffDelay(i, policy, honored ? retryAfterMs : null);
    cumulative += delay;
    steps.push({ attempt: i + 2, delayMs: delay, cumulativeMs: cumulative, honoredRetryAfter: honored });
  }
  return steps;
}

/** Total worst-case time spent backing off across all retries (ms). */
export const totalBackoff = (steps: RetryStep[]): number => (steps.length ? steps[steps.length - 1].cumulativeMs : 0);

export interface FetchWithRetryResult {
  response: Response | null;
  attempts: number;
  /** Per-retry delays actually waited (ms). */
  waited: number[];
  error?: string;
}

/**
 * A minimal retrying fetch: on a retryable status it waits (honouring
 * Retry-After, else backoff) and tries again, up to the policy's attempts.
 * `sleep` is injectable for tests. Returns the last response.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  policy: RetryPolicy = DEFAULT_POLICY,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = (i, x) => fetch(i, x),
): Promise<FetchWithRetryResult> {
  const waited: number[] = [];
  let response: Response | null = null;
  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      response = await fetchImpl(input, init);
    } catch (e) {
      if (attempt >= policy.maxAttempts - 1) return { response: null, attempts: attempt + 1, waited, error: e instanceof Error ? e.message : 'network error' };
      const delay = backoffDelay(attempt, policy);
      waited.push(delay);
      await sleep(delay);
      continue;
    }
    if (!shouldRetry(response.status, attempt, policy)) return { response, attempts: attempt + 1, waited };
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    const delay = backoffDelay(attempt, policy, retryAfterMs);
    waited.push(delay);
    await sleep(delay);
  }
  return { response, attempts: policy.maxAttempts, waited };
}
