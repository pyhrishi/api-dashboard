/**
 * F-131 Tier-based throughput — tier model + limiter integration tests.
 * Deterministic, no network.
 */
import {
  TIER_LIMITS, TIER_ORDER, tierForKey, tierLimitForKey, nextTier,
} from '@/lib/throughput-tiers';
import { RATE_LIMIT } from '@/lib/rate-limit';
import { checkRateLimit } from '@/lib/gateway/rateLimiter';

describe('TIER_LIMITS ladder', () => {
  it('increases capacity and sustained RPS up the ladder', () => {
    const caps = TIER_ORDER.map((t) => TIER_LIMITS[t].capacity);
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    expect(caps[0]).toBeLessThan(caps[caps.length - 1]);
    const rps = TIER_ORDER.map((t) => TIER_LIMITS[t].sustainedRps);
    expect(rps[0]).toBeLessThan(rps[2]);
  });
  it('Starter reuses the F-129 baseline (flat behaviour preserved)', () => {
    expect(TIER_LIMITS.Starter.capacity).toBe(RATE_LIMIT.capacity);
    expect(TIER_LIMITS.Starter.refillPerMinute).toBe(RATE_LIMIT.refillPerMinute);
  });
  it('nextTier walks up and stops at the top', () => {
    expect(nextTier('Starter')).toBe('Growth');
    expect(nextTier('Growth')).toBe('Enterprise');
    expect(nextTier('Enterprise')).toBeNull();
  });
});

describe('tierForKey', () => {
  it('sandbox keys are always Starter (dev baseline)', () => {
    expect(tierForKey('sk_test_anything')).toBe('Starter');
    expect(tierForKey('sk_test_zzzzzzzz')).toBe('Starter');
    expect(tierForKey('')).toBe('Starter');
  });
  it('is deterministic per key', () => {
    const k = 'sk_live_abcdef123456';
    expect(tierForKey(k)).toBe(tierForKey(k));
  });
  it('distributes live keys across the ladder', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(tierForKey(`sk_live_key_${i}`));
    // Weighted, but all three tiers should appear across 200 keys.
    expect(seen.has('Starter')).toBe(true);
    expect(seen.has('Growth')).toBe(true);
    expect(seen.has('Enterprise')).toBe(true);
  });
  it('tierLimitForKey returns the matching limit', () => {
    const k = 'sk_live_sample_key_001';
    expect(tierLimitForKey(k)).toBe(TIER_LIMITS[tierForKey(k)]);
  });
});

describe('rateLimiter honors the tier', () => {
  it('sizes the bucket + reports the tier from the key', () => {
    // Find one key per tier deterministically.
    const byTier: Record<string, string> = {};
    for (let i = 0; i < 500 && Object.keys(byTier).length < 3; i++) {
      const k = `sk_live_rl_${i}`;
      byTier[tierForKey(k)] ??= k;
    }
    (['Starter', 'Growth', 'Enterprise'] as const).forEach((t) => {
      const key = byTier[t];
      if (!key) return;
      const res = checkRateLimit(key);
      expect(res.tier).toBe(t);
      expect(res.limit).toBe(TIER_LIMITS[t].capacity);
    });
  });

  it('a Starter (sandbox) key gets the baseline capacity', () => {
    const res = checkRateLimit('sk_test_baseline_check');
    expect(res.tier).toBe('Starter');
    expect(res.limit).toBe(RATE_LIMIT.capacity);
  });
});
