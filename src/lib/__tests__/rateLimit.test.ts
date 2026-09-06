import {
  RATE_LIMIT, refillPerSecond, simulateBurst, summarizeBurst, fillPct, retryAfterSeconds, rateSummary,
} from '@/lib/rate-limit';

describe('token-bucket rate limit (F-129)', () => {
  it('exposes coherent constants', () => {
    expect(RATE_LIMIT.capacity).toBeGreaterThan(0);
    expect(RATE_LIMIT.refillPerMinute).toBeGreaterThan(0);
    expect(refillPerSecond).toBeCloseTo(RATE_LIMIT.refillPerMinute / 60, 5);
    expect(rateSummary()).toContain('burst up to');
  });

  it('a fast burst drains the bucket then throttles (429s), deterministically', () => {
    const cap = RATE_LIMIT.capacity;
    const steps = simulateBurst(cap + 20, 1000, cap); // ~1ms apart — refill negligible
    expect(simulateBurst(cap + 20, 1000, cap)).toEqual(steps); // deterministic
    const s = summarizeBurst(steps);
    // roughly `cap` allowed, the rest throttled (a hair more allowed from tiny refill)
    expect(s.allowed).toBeGreaterThanOrEqual(cap);
    expect(s.allowed).toBeLessThanOrEqual(cap + 2);
    expect(s.throttled).toBeGreaterThan(0);
    expect(s.total).toBe(cap + 20);
    expect(s.firstThrottle).not.toBeNull();
    expect(steps[0].allowed).toBe(true);
    expect(steps[0].remaining).toBe(cap - 1);
  });

  it('a burst slower than the refill rate is never throttled', () => {
    // 1 req/sec, refill ~1.67 tokens/sec → the bucket keeps up.
    const s = summarizeBurst(simulateBurst(300, 1));
    expect(s.throttled).toBe(0);
    expect(s.firstThrottle).toBeNull();
  });

  it('fillPct and retryAfterSeconds', () => {
    expect(fillPct(RATE_LIMIT.capacity)).toBe(100);
    expect(fillPct(0)).toBe(0);
    expect(fillPct(RATE_LIMIT.capacity / 2)).toBe(50);
    expect(retryAfterSeconds()).toBeGreaterThanOrEqual(1);
  });

  it('handles empty / clamped inputs', () => {
    expect(simulateBurst(0, 1000)).toEqual([]);
    expect(simulateBurst(5000, 1000).length).toBe(1000); // clamped
  });
});
