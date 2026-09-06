import { resolveBuyerIntent } from '@/lib/intent-resolver';

describe('buyer intent signals (F-012)', () => {
  it('returns null for personal / unrecognized domains', () => {
    expect(resolveBuyerIntent('jane@gmail.com')).toBeNull();
    expect(resolveBuyerIntent('gmail.com')).toBeNull();
    expect(resolveBuyerIntent('')).toBeNull();
  });

  it('resolves a coherent intent profile for a real company', () => {
    const r = resolveBuyerIntent('stripe.com')!;
    expect(r).not.toBeNull();
    expect(r.company).toBeTruthy();
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.score).toBeLessThanOrEqual(99);
    expect(['hot', 'warm', 'cool', 'cold']).toContain(r.tier);
    expect(r.topics.length).toBeGreaterThanOrEqual(3);
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.recommended_action).toBeTruthy();
  });

  it('tier is consistent with the score bands', () => {
    ['stripe.com', 'datadoghq.com', 'zomato.in', 'shopify.com', 'notion.so'].forEach((d) => {
      const r = resolveBuyerIntent(d)!;
      const expected = r.score >= 75 ? 'hot' : r.score >= 50 ? 'warm' : r.score >= 25 ? 'cool' : 'cold';
      expect(r.tier).toBe(expected);
      expect(r.in_market).toBe(r.tier === 'hot' || r.tier === 'warm');
    });
  });

  it('ranks topics by score descending, each with a trend matching its delta', () => {
    const r = resolveBuyerIntent('datadoghq.com')!;
    for (let i = 1; i < r.topics.length; i++) {
      expect(r.topics[i - 1].score).toBeGreaterThanOrEqual(r.topics[i].score);
    }
    r.topics.forEach((t) => {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(t.score).toBeLessThanOrEqual(100);
      const expected = t.delta >= 18 ? 'surging' : t.delta >= 6 ? 'rising' : t.delta <= -6 ? 'cooling' : 'steady';
      expect(t.trend).toBe(expected);
    });
  });

  it('sorts signals by weight descending and reuses the real resolvers', () => {
    const r = resolveBuyerIntent('stripe.com')!;
    for (let i = 1; i < r.signals.length; i++) {
      expect(r.signals[i - 1].weight).toBeGreaterThanOrEqual(r.signals[i].weight);
    }
    // Categories come from the contributing evidence.
    const cats = r.signals.map((s) => s.category);
    expect(cats).toContain('hiring');
    expect(cats).toContain('engagement');
  });

  it('is deterministic — same domain, same profile', () => {
    expect(resolveBuyerIntent('shopify.com')).toEqual(resolveBuyerIntent('shopify.com'));
    // Normalization: protocol/www/path do not change the result.
    expect(resolveBuyerIntent('https://www.shopify.com/pricing')).toEqual(resolveBuyerIntent('shopify.com'));
  });
});
