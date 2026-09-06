import { resolveCompanyAlias } from '@/lib/company-alias-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';

describe('company alias resolution (F-031)', () => {
  it('resolves a former name to the canonical company', () => {
    const r = resolveCompanyAlias('Jaded Pixel');
    expect(r.resolved?.domain).toBe('shopify.com');
    expect(r.matchType).toBe('exact');
    expect(r.aliasType).toBe('former');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('resolves ticker, legal name, DBA, and abbreviation aliases', () => {
    expect(resolveCompanyAlias('SHOP').resolved?.domain).toBe('shopify.com');
    expect(resolveCompanyAlias('SHOP').aliasType).toBe('ticker');
    expect(resolveCompanyAlias('Stripe, Inc.').resolved?.domain).toBe('stripe.com');
    expect(resolveCompanyAlias('Stripe, Inc.').aliasType).toBe('legal');
    expect(resolveCompanyAlias('strp').resolved?.domain).toBe('stripe.com');
    expect(resolveCompanyAlias('strp').aliasType).toBe('abbreviation');
  });

  it('resolves a domain input directly', () => {
    const r = resolveCompanyAlias('stripe.com');
    expect(r.matchType).toBe('domain');
    expect(r.resolved?.domain).toBe('stripe.com');
    expect(resolveCompanyAlias('https://www.stripe.com/pricing').resolved?.domain).toBe('stripe.com');
  });

  it('fuzzy-matches a typo above the threshold', () => {
    const r = resolveCompanyAlias('Shopfiy'); // transposed
    expect(r.resolved?.domain).toBe('shopify.com');
    expect(r.matchType).toBe('fuzzy');
    expect(r.confidence).toBeGreaterThanOrEqual(0.86);
    expect(r.confidence).toBeLessThan(1);
  });

  it('normalizes case and punctuation', () => {
    expect(resolveCompanyAlias('stripe inc').resolved?.domain).toBe('stripe.com');
    expect(resolveCompanyAlias('  ZEIT  ').resolved?.domain).toBe('vercel.com');
  });

  it('returns none with candidates for an unknown company', () => {
    const r = resolveCompanyAlias('totally unknown holdings xyz');
    expect(r.matchType).toBe('none');
    expect(r.resolved).toBeNull();
    expect(Array.isArray(r.candidates)).toBe(true);
  });

  it('handles empty input safely', () => {
    const r = resolveCompanyAlias('');
    expect(r.matchType).toBe('none');
    expect(r.resolved).toBeNull();
  });

  it('resolves to a company that is actually enrichable (coherent)', () => {
    const r = resolveCompanyAlias('Foodiebay');
    expect(r.resolved).not.toBeNull();
    const company = resolveCompanyFromDomain(r.resolved!.domain);
    expect(company?.name).toBe(r.resolved!.name);
  });

  it('is deterministic', () => {
    expect(resolveCompanyAlias('ZEIT')).toEqual(resolveCompanyAlias('ZEIT'));
  });
});
