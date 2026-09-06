import {
  parseRetryAfter, backoffDelay, shouldRetry, isRetryableStatus, retryTimeline, totalBackoff,
  fetchWithRetry, DEFAULT_POLICY, type RetryPolicy,
} from '@/lib/retry-after';

const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfter('30', NOW)).toBe(30_000);
    expect(parseRetryAfter('0', NOW)).toBe(0);
  });
  it('parses an HTTP-date to ms-from-now, clamping the past to 0', () => {
    const future = new Date(NOW + 45_000).toUTCString();
    expect(parseRetryAfter(future, NOW)).toBe(45_000);
    const past = new Date(NOW - 10_000).toUTCString();
    expect(parseRetryAfter(past, NOW)).toBe(0);
  });
  it('returns null for absent/invalid', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('backoff + retry decisions', () => {
  it('is deterministic exponential backoff, capped, honouring Retry-After', () => {
    expect(backoffDelay(0)).toBe(backoffDelay(0)); // deterministic
    // grows with the retry index
    expect(backoffDelay(2)).toBeGreaterThan(backoffDelay(0));
    // capped at maxDelayMs
    expect(backoffDelay(20)).toBeLessThanOrEqual(DEFAULT_POLICY.maxDelayMs);
    // Retry-After is honoured (capped)
    expect(backoffDelay(0, DEFAULT_POLICY, 3_000)).toBe(3_000);
    expect(backoffDelay(0, DEFAULT_POLICY, 999_999)).toBe(DEFAULT_POLICY.maxDelayMs);
  });

  it('retries 429 and 5xx but not 4xx, respecting maxAttempts', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(shouldRetry(429, 0)).toBe(true);
    expect(shouldRetry(400, 0)).toBe(false);
    expect(shouldRetry(429, DEFAULT_POLICY.maxAttempts - 1)).toBe(false); // out of retries
  });
});

describe('retryTimeline', () => {
  it('has maxAttempts-1 steps, honours Retry-After first, and accumulates', () => {
    const steps = retryTimeline(DEFAULT_POLICY, 2_000);
    expect(steps).toHaveLength(DEFAULT_POLICY.maxAttempts - 1);
    expect(steps[0].honoredRetryAfter).toBe(true);
    expect(steps[0].delayMs).toBe(2_000);
    expect(steps[0].attempt).toBe(2);
    for (let i = 1; i < steps.length; i++) expect(steps[i].cumulativeMs).toBeGreaterThan(steps[i - 1].cumulativeMs);
    expect(totalBackoff(steps)).toBe(steps[steps.length - 1].cumulativeMs);
  });
});

describe('fetchWithRetry', () => {
  const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 2000, multiplier: 2 };
  const noSleep = async () => {};
  // Minimal Response stand-in — fetchWithRetry only reads .status + .headers.get.
  const res = (status: number, retryAfter?: string): Response =>
    ({ status, headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) } }) as unknown as Response;

  it('retries a 429 then succeeds', async () => {
    let call = 0;
    const fakeFetch = async () => { call++; return call < 3 ? res(429, '1') : res(200); };
    const out = await fetchWithRetry('/x', {}, policy, noSleep, fakeFetch);
    expect(out.response!.status).toBe(200);
    expect(out.attempts).toBe(3);
    expect(out.waited).toHaveLength(2); // waited twice before the 200
    expect(out.waited[0]).toBe(1000); // honoured Retry-After: 1s
  });

  it('gives up after maxAttempts on persistent 429', async () => {
    const out = await fetchWithRetry('/x', {}, policy, noSleep, async () => res(429));
    expect(out.response!.status).toBe(429);
    expect(out.attempts).toBe(policy.maxAttempts);
  });

  it('does not retry a 400', async () => {
    const out = await fetchWithRetry('/x', {}, policy, noSleep, async () => res(400));
    expect(out.attempts).toBe(1);
    expect(out.waited).toHaveLength(0);
  });
});
