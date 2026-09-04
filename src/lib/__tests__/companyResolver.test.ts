import { resolveCompanyFromDomain, normalizeDomain, isValidDomain } from '@/lib/company-resolver';

describe('company-resolver', () => {
  it('is deterministic — same domain always resolves to the same dossier', () => {
    const a = resolveCompanyFromDomain('stripe.com');
    const b = resolveCompanyFromDomain('stripe.com');
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it('normalizes protocol, www, path, and case', () => {
    expect(normalizeDomain('https://www.Stripe.com/pricing?x=1')).toBe('stripe.com');
    const a = resolveCompanyFromDomain('HTTPS://WWW.stripe.com/');
    const b = resolveCompanyFromDomain('stripe.com');
    expect(a).toEqual(b);
  });

  it('derives the company name from the domain root', () => {
    const c = resolveCompanyFromDomain('datadoghq.com')!;
    expect(c.name.toLowerCase()).toContain('datadoghq');
    expect(c.domain).toBe('datadoghq.com');
  });

  it('returns a complete, well-typed dossier with provenance', () => {
    const c = resolveCompanyFromDomain('shopify.com')!;
    expect(c.id).toMatch(/^company_/);
    expect(c.employee_count).toBeGreaterThan(0);
    expect(c.tech_stack.length).toBeGreaterThanOrEqual(4);
    expect(new Set(c.tech_stack).size).toBe(c.tech_stack.length); // distinct
    expect(c.confidence).toBeGreaterThan(0);
    expect(c.confidence).toBeLessThanOrEqual(0.99);
    expect(c.provenance.length).toBeGreaterThanOrEqual(5);
    expect(c.linkedin_url).toContain('linkedin.com/company/');
    expect(c.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('flags freemail domains as personal with lower confidence', () => {
    const corp = resolveCompanyFromDomain('stripe.com')!;
    const free = resolveCompanyFromDomain('gmail.com')!;
    expect(free.is_personal_domain).toBe(true);
    expect(free.confidence).toBeLessThan(corp.confidence);
  });

  it('does not use Math.random — 100 calls stay identical', () => {
    const first = JSON.stringify(resolveCompanyFromDomain('repeat.io'));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(resolveCompanyFromDomain('repeat.io'))).toBe(first);
  });

  it('rejects invalid domains', () => {
    expect(isValidDomain('nodots')).toBe(false);
    expect(resolveCompanyFromDomain('nodots')).toBeNull();
    expect(resolveCompanyFromDomain('')).toBeNull();
    expect(resolveCompanyFromDomain('spaces here.com')).toBeNull();
  });
});
