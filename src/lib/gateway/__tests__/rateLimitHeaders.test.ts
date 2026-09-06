/**
 * F-130 Standard rate-limit headers — builder + parser tests.
 * Deterministic (now is injected), no network.
 */
import {
  buildRateLimitHeaders, buildRateLimitedHeaders, retryAfterSeconds, parseRateLimitHeaders,
  RATE_LIMIT_WINDOW_SEC,
} from '@/lib/gateway/rateLimitHeaders';

const NOW = 1_700_000_000_000; // fixed
const nowSec = Math.floor(NOW / 1000);

describe('buildRateLimitHeaders', () => {
  it('emits standard RateLimit-* with reset as delta-seconds + policy', () => {
    const h = buildRateLimitHeaders({ limit: 100, remaining: 87, reset: nowSec + 42 }, NOW);
    expect(h['RateLimit-Limit']).toBe('100');
    expect(h['RateLimit-Remaining']).toBe('87');
    expect(h['RateLimit-Reset']).toBe('42'); // delta, not epoch
    expect(h['RateLimit-Policy']).toBe(`100;w=${RATE_LIMIT_WINDOW_SEC}`);
  });
  it('keeps legacy X-RateLimit-* (reset stays epoch)', () => {
    const h = buildRateLimitHeaders({ limit: 100, remaining: 50, reset: nowSec + 30 }, NOW);
    expect(h['X-RateLimit-Limit']).toBe('100');
    expect(h['X-RateLimit-Remaining']).toBe('50');
    expect(h['X-RateLimit-Reset']).toBe(String(nowSec + 30)); // epoch
  });
  it('floors remaining and clamps reset delta to >= 0', () => {
    const h = buildRateLimitHeaders({ limit: 100, remaining: 3.9, reset: nowSec - 10 }, NOW);
    expect(h['RateLimit-Remaining']).toBe('3');
    expect(h['RateLimit-Reset']).toBe('0');
  });
});

describe('429 headers', () => {
  it('adds Retry-After (>= 1s, from refill rate)', () => {
    const h = buildRateLimitedHeaders({ limit: 100, remaining: 0, reset: nowSec + 1 }, NOW);
    expect(Number(h['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(h['RateLimit-Remaining']).toBe('0');
    expect(h['RateLimit-Policy']).toContain('w=');
  });
  it('retryAfterSeconds is the per-token wait, floored to 1', () => {
    expect(retryAfterSeconds({ limit: 100, remaining: 0, reset: 0 })).toBe(1); // ceil(60/100)=1
    expect(retryAfterSeconds({ limit: 6, remaining: 0, reset: 0 })).toBe(10); // ceil(60/6)=10
    expect(retryAfterSeconds({ limit: 0, remaining: 0, reset: 0 })).toBe(60);
  });
});

describe('parseRateLimitHeaders', () => {
  const asGetter = (m: Record<string, string>) => (name: string) => m[name] ?? null;

  it('prefers standard headers', () => {
    const p = parseRateLimitHeaders(asGetter({
      'RateLimit-Limit': '100', 'RateLimit-Remaining': '40', 'RateLimit-Reset': '25', 'RateLimit-Policy': '100;w=60',
    }), NOW);
    expect(p.standard).toBe(true);
    expect(p.limit).toBe(100);
    expect(p.remaining).toBe(40);
    expect(p.resetSeconds).toBe(25);
    expect(p.policy).toBe('100;w=60');
  });

  it('falls back to legacy X- headers and converts epoch reset to delta', () => {
    const p = parseRateLimitHeaders(asGetter({
      'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '10', 'X-RateLimit-Reset': String(nowSec + 15),
    }), NOW);
    expect(p.standard).toBe(false);
    expect(p.limit).toBe(100);
    expect(p.resetSeconds).toBe(15);
  });

  it('returns nulls when nothing is present', () => {
    const p = parseRateLimitHeaders(() => null, NOW);
    expect(p.limit).toBeNull();
    expect(p.standard).toBe(false);
  });

  it('round-trips build → parse', () => {
    const built = buildRateLimitHeaders({ limit: 100, remaining: 63, reset: nowSec + 12 }, NOW);
    const p = parseRateLimitHeaders((n) => built[n] ?? null, NOW);
    expect(p.limit).toBe(100);
    expect(p.remaining).toBe(63);
    expect(p.resetSeconds).toBe(12);
    expect(p.standard).toBe(true);
  });
});
