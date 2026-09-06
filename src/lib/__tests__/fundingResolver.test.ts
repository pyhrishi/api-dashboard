import { resolveFundingForDomain } from '@/lib/funding-resolver';

describe('funding & investment signals (F-009)', () => {
  it('returns null for an unresolvable domain and a no-funding profile for personal domains', () => {
    expect(resolveFundingForDomain('')).toBeNull();
    const personal = resolveFundingForDomain('gmail.com')!;
    expect(personal.has_funding).toBe(false);
    expect(personal.rounds).toHaveLength(0);
    expect(personal.total_raised_usd).toBe(0);
    expect(personal.no_funding_reason).toBeTruthy();
  });

  it('is deterministic per normalized domain', () => {
    expect(resolveFundingForDomain('stripe.com')).toEqual(resolveFundingForDomain('  https://www.STRIPE.com/pricing '));
  });

  it('builds a round history capped by the firmographic stage, oldest-first', () => {
    const f = resolveFundingForDomain('stripe.com')!;
    expect(f.has_funding).toBe(true);
    expect(f.rounds.length).toBeGreaterThan(0);
    // Rounds ascend the ladder and dates increase.
    const order = ['Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E'];
    const idxs = f.rounds.map((r) => order.indexOf(r.stage));
    for (let i = 1; i < idxs.length; i++) {
      expect(idxs[i]).toBeGreaterThan(idxs[i - 1]);
      expect(new Date(f.rounds[i].date).getTime()).toBeGreaterThan(new Date(f.rounds[i - 1].date).getTime());
    }
  });

  it('keeps totals and the last round internally consistent', () => {
    const f = resolveFundingForDomain('datadoghq.com')!;
    const summed = f.rounds.reduce((n, r) => n + r.amount_usd, 0);
    expect(f.total_raised_usd).toBe(summed);
    expect(f.last_round).toEqual(f.rounds[f.rounds.length - 1]);
    expect(f.latest_valuation_usd).toBe(f.last_round!.valuation_usd);
    expect(f.total_raised_usd).toBeGreaterThan(0);
  });

  it('dedupes the investor roster and always includes each round lead', () => {
    const f = resolveFundingForDomain('shopify.com')!;
    expect(new Set(f.investors).size).toBe(f.investors.length);
    expect(f.investor_count).toBe(f.investors.length);
    for (const r of f.rounds) {
      expect(r.investors).toContain(r.lead_investor);
      expect(f.investors).toContain(r.lead_investor);
    }
  });

  it('emits provenance and a confidence in range', () => {
    const f = resolveFundingForDomain('figma.com')!;
    expect(f.provenance.length).toBeGreaterThan(0);
    expect(f.confidence).toBeGreaterThan(0);
    expect(f.confidence).toBeLessThanOrEqual(0.99);
  });
});
