import { resolveCompanyNews } from '@/lib/company-news-resolver';
import { resolveFundingForDomain } from '@/lib/funding-resolver';

describe('company news & event feed (F-015)', () => {
  it('returns null for a personal-email domain (no company)', () => {
    expect(resolveCompanyNews('gmail.com')).toBeNull();
    expect(resolveCompanyNews('')).toBeNull();
    expect(resolveCompanyNews('stripe.com')).not.toBeNull();
  });

  it('is deterministic per normalized domain', () => {
    expect(resolveCompanyNews('stripe.com')).toEqual(resolveCompanyNews('  https://www.STRIPE.com/x '));
  });

  it('builds a chronological feed, newest first, with a by-type tally', () => {
    const n = resolveCompanyNews('datadoghq.com')!;
    expect(n.event_count).toBe(n.events.length);
    expect(n.event_count).toBeGreaterThan(0);
    const dates = n.events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(n.latest_event).toEqual(n.events[0]);
    const tallied = Object.values(n.by_type).reduce((a, b) => a + b, 0);
    expect(tallied).toBe(n.event_count);
  });

  it('reconciles funding events with the funding graph exactly', () => {
    const news = resolveCompanyNews('stripe.com')!;
    const funding = resolveFundingForDomain('stripe.com')!;
    const fundingEventDates = news.events.filter((e) => e.type === 'funding').map((e) => e.date).sort();
    const roundDates = funding.rounds.map((r) => r.date).sort();
    expect(fundingEventDates).toEqual(roundDates);
  });

  it('gives every event a type, sentiment, source, and bounded importance', () => {
    const n = resolveCompanyNews('shopify.com')!;
    const types = new Set(['funding', 'leadership', 'expansion', 'product', 'acquisition', 'partnership', 'award', 'hiring']);
    const sentiments = new Set(['positive', 'neutral', 'negative']);
    for (const e of n.events) {
      expect(types.has(e.type)).toBe(true);
      expect(sentiments.has(e.sentiment)).toBe(true);
      expect(e.source.length).toBeGreaterThan(0);
      expect(e.importance).toBeGreaterThanOrEqual(0);
      expect(e.importance).toBeLessThanOrEqual(100);
      expect(e.id).toMatch(/^evt_/);
    }
  });

  it('emits provenance and a confidence in range', () => {
    const n = resolveCompanyNews('zomato.in')!;
    expect(n.provenance.length).toBeGreaterThan(0);
    expect(n.confidence).toBeGreaterThan(0);
    expect(n.confidence).toBeLessThanOrEqual(0.99);
  });
});
