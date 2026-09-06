import {
  fingerprintRequest, checkIdempotency, storeIdempotency, getIdempotencyStats, __resetIdempotency,
} from '@/lib/gateway/idempotency';

describe('idempotency keys (F-061)', () => {
  beforeEach(() => __resetIdempotency());

  const fp = (body: unknown) => fingerprintRequest('POST', '/v1/feedback/correction', body);

  it('fingerprints deterministically and distinguishes bodies', () => {
    expect(fp({ a: 1 })).toBe(fp({ a: 1 }));
    expect(fp({ a: 1 })).not.toBe(fp({ a: 2 }));
    expect(fingerprintRequest('POST', '/x', null)).toBe(fingerprintRequest('POST', '/x', ''));
  });

  it('misses on an unseen key', () => {
    expect(checkIdempotency('sk_test_1', 'key-1', fp({ a: 1 })).status).toBe('miss');
  });

  it('replays the stored response on a retry with the same key + body — without re-billing the caller', () => {
    const fingerprint = fp({ a: 1 });
    storeIdempotency('sk_test_1', 'key-1', { payload: { ok: true }, status: 200, fingerprint, path: '/v1/feedback/correction', creditCost: 2 });
    const out = checkIdempotency('sk_test_1', 'key-1', fingerprint);
    expect(out.status).toBe('replay');
    if (out.status === 'replay') {
      expect(out.payload).toEqual({ ok: true });
      expect(out.httpStatus).toBe(200);
      expect(out.record.replayCount).toBe(1);
    }
  });

  it('returns a conflict when the same key is reused with a different body', () => {
    storeIdempotency('sk_test_1', 'key-1', { payload: { ok: true }, status: 200, fingerprint: fp({ a: 1 }), path: '/v1/feedback/correction', creditCost: 2 });
    const out = checkIdempotency('sk_test_1', 'key-1', fp({ a: 999 }));
    expect(out.status).toBe('conflict');
  });

  it('scopes keys per API key', () => {
    const fingerprint = fp({ a: 1 });
    storeIdempotency('sk_test_1', 'key-1', { payload: { ok: 1 }, status: 200, fingerprint, path: '/x', creditCost: 1 });
    expect(checkIdempotency('sk_test_2', 'key-1', fingerprint).status).toBe('miss');
  });

  it('counts replays and credits saved in the stats', () => {
    __resetIdempotency();
    const fingerprint = fp({ a: 1 });
    storeIdempotency('sk_test_1', 'key-1', { payload: { ok: 1 }, status: 200, fingerprint, path: '/v1/jobs', creditCost: 3 });
    checkIdempotency('sk_test_1', 'key-1', fingerprint); // replay 1
    checkIdempotency('sk_test_1', 'key-1', fingerprint); // replay 2
    const stats = getIdempotencyStats();
    const mine = stats.recent.find((r) => r.path === '/v1/jobs' && r.replayCount === 2);
    expect(mine).toBeDefined();
    expect(mine?.creditsSaved).toBe(6); // 2 replays × 3 credits
    // Stats include the seeded demo keys too, so assert monotonic totals.
    expect(stats.replaysServed).toBeGreaterThanOrEqual(2);
    expect(stats.creditsSaved).toBeGreaterThanOrEqual(6);
    expect(stats.ttlHours).toBe(24);
  });

  it('seeds demo keys so the console view is populated on first load', () => {
    __resetIdempotency();
    const stats = getIdempotencyStats();
    expect(stats.activeKeys).toBeGreaterThan(0);
    expect(stats.recent.every((r) => r.ttlRemainingMs >= 0)).toBe(true);
    // Keys are masked for display.
    expect(stats.recent.every((r) => !r.key.includes('::'))).toBe(true);
  });
});
