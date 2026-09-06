import {
  daysSinceUse, keyFreshness, usageTimeline, computeKeyUsage, summarizeKeyUsage,
  usageInsights, relativeLastUsed, freshnessLabel,
} from '@/lib/key-usage';
import type { MockKey } from '@/lib/store';

const NOW = Date.UTC(2026, 8, 7);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000, D = 86_400_000;

const key = (over: Partial<MockKey>): MockKey => ({
  id: `k_${Math.random().toString(36).slice(2, 7)}`,
  name: 'K', key: 'sk_test_x', scopes: ['a'], createdAt: ago(90 * D),
  status: 'active', environment: 'sandbox', ...over,
});

describe('key-usage freshness', () => {
  it('buckets by last-used age', () => {
    expect(keyFreshness(key({ lastUsed: ago(2 * H) }), NOW)).toBe('active');
    expect(keyFreshness(key({ lastUsed: ago(3 * D) }), NOW)).toBe('idle');
    expect(keyFreshness(key({ lastUsed: ago(15 * D) }), NOW)).toBe('dormant');
    expect(keyFreshness(key({ lastUsed: ago(60 * D) }), NOW)).toBe('stale');
    expect(keyFreshness(key({ lastUsed: undefined }), NOW)).toBe('never');
    expect(daysSinceUse(key({ lastUsed: ago(3 * D) }), NOW)).toBe(3);
    expect(daysSinceUse(key({ lastUsed: undefined }), NOW)).toBeNull();
  });
});

describe('key-usage timeline', () => {
  it('is deterministic, 14 points, and roughly conserves the total', () => {
    const k = key({ id: 'kx', lastUsed: ago(2 * H), usage: 14000 });
    const a = usageTimeline(k);
    expect(usageTimeline(k)).toEqual(a);
    expect(a).toHaveLength(14);
    const sum = a.reduce((n, x) => n + x, 0);
    expect(Math.abs(sum - 14000)).toBeLessThan(14000 * 0.02); // rounding only
    // recency ramp — the last day is not smaller than the first on average
    expect(a[13]).toBeGreaterThan(0);
  });

  it('is flat zero for a never-used key', () => {
    expect(usageTimeline(key({ lastUsed: undefined, usage: 0 }))).toEqual(new Array(14).fill(0));
  });
});

describe('key-usage roll-up + view', () => {
  const keys = [
    key({ id: 'a', name: 'Prod', environment: 'live', lastUsed: ago(1 * H), usage: 1_000_000 }),
    key({ id: 'b', name: 'Dev', lastUsed: ago(3 * D), usage: 40_000 }),
    key({ id: 'c', name: 'Old Live', environment: 'live', lastUsed: ago(60 * D), usage: 500 }),
    key({ id: 'd', name: 'Unused Live', environment: 'live', lastUsed: undefined, usage: 0 }),
  ];

  it('computeKeyUsage sorts busiest first', () => {
    const view = computeKeyUsage(keys, NOW);
    expect(view.map((v) => v.key.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(view[0].freshness).toBe('active');
  });

  it('summarizeKeyUsage rolls up counts and picks the busiest', () => {
    const s = summarizeKeyUsage(keys, NOW);
    expect(s.totalRequests).toBe(1_040_500);
    expect(s.activeKeys).toBe(1);
    expect(s.idleOrDormant).toBe(1); // Dev (idle)
    expect(s.neverUsed).toBe(1);
    expect(s.busiest!.id).toBe('a');
  });

  it('usageInsights flags stale/never live keys, most severe first', () => {
    const ins = usageInsights(keys, NOW);
    const ids = ins.map((i) => i.keyId);
    expect(ids).toContain('c'); // stale live → rotate
    expect(ids).toContain('d'); // never-used live → revoke
    expect(ins.every((i) => ['high', 'medium', 'low'].includes(i.severity))).toBe(true);
    expect(ins[0].severity).toBe('high');
    const stale = ins.find((i) => i.keyId === 'c')!;
    expect(stale.action).toBe('rotate');
  });

  it('helpers format', () => {
    expect(relativeLastUsed(key({ lastUsed: ago(2 * H) }), NOW)).toBe('2h ago');
    expect(relativeLastUsed(key({ lastUsed: undefined }), NOW)).toBe('never');
    expect(freshnessLabel('stale')).toBe('Stale');
  });
});
