import {
  checkNegativeCache, recordNegativeMiss, registerNegativeHit, getNegativeCacheStats,
  __resetNegativeCache, NEGATIVE_TTL_SECONDS,
} from '@/lib/gateway/negativeCache';

beforeEach(() => __resetNegativeCache());

describe('negative-match cache', () => {
  it('misses on an unknown key', () => {
    expect(checkNegativeCache('k').hit).toBe(false);
  });

  it('records a miss and serves it back', () => {
    const payload = { success: false, error: { code: 'NOT_FOUND' } };
    recordNegativeMiss('k', payload, 404);
    const look = checkNegativeCache('k');
    expect(look.hit).toBe(true);
    expect(look.payload).toEqual(payload);
    expect(look.status).toBe(404);
  });

  it('expires an entry after its TTL', () => {
    const now = 1_000_000;
    recordNegativeMiss('k', { x: 1 }, 404, NEGATIVE_TTL_SECONDS, now);
    expect(checkNegativeCache('k', now + 1000).hit).toBe(true);
    expect(checkNegativeCache('k', now + NEGATIVE_TTL_SECONDS * 1000 + 1).hit).toBe(false);
  });

  it('does not double-count a re-recorded key', () => {
    recordNegativeMiss('k', {}, 404);
    recordNegativeMiss('k', {}, 404);
    expect(getNegativeCacheStats().total_misses_recorded).toBe(1);
  });

  it('accrues hits, credits saved, and hit rate', () => {
    recordNegativeMiss('k', {}, 404);
    registerNegativeHit('k', 2);
    registerNegativeHit('k', 2);
    const s = getNegativeCacheStats();
    expect(s.active_entries).toBe(1);
    expect(s.cache_hits_served).toBe(2);
    expect(s.credits_saved).toBe(4);
    // hit_rate = hits / (hits + recorded) = 2 / (2 + 1)
    expect(s.hit_rate).toBeCloseTo(2 / 3, 2);
    expect(s.top_entries[0].hits).toBe(2);
    expect(s.top_entries[0].credits_saved).toBe(4);
  });
});
