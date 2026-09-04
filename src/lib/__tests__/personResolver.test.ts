import { resolvePersonFromEmail } from '@/lib/person-resolver';

describe('person-resolver', () => {
  it('is deterministic — same email always resolves to the same profile', () => {
    const a = resolvePersonFromEmail('jane.doe@acme.com');
    const b = resolvePersonFromEmail('jane.doe@acme.com');
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it('normalizes case and whitespace before resolving', () => {
    const a = resolvePersonFromEmail('  Jane.Doe@ACME.com ');
    const b = resolvePersonFromEmail('jane.doe@acme.com');
    expect(a).toEqual(b);
    expect(a?.email).toBe('jane.doe@acme.com');
  });

  it('derives a structured name from a dotted local part', () => {
    const p = resolvePersonFromEmail('jane.doe@acme.com')!;
    expect(p.first_name).toBe('Jane');
    expect(p.last_name).toBe('Doe');
    expect(p.full_name).toBe('Jane Doe');
  });

  it('derives the company from the domain for corporate emails', () => {
    const p = resolvePersonFromEmail('marcus@stripe.com')!;
    expect(p.is_personal_email).toBe(false);
    expect(p.company.toLowerCase()).toContain('stripe');
    expect(p.company_domain).toBe('stripe.com');
  });

  it('flags freemail domains as personal with lower confidence', () => {
    const corp = resolvePersonFromEmail('sam@stripe.com')!;
    const free = resolvePersonFromEmail('sam@gmail.com')!;
    expect(free.is_personal_email).toBe(true);
    expect(free.company).toBe('Independent');
    expect(free.confidence).toBeLessThan(corp.confidence);
  });

  it('returns a complete, well-typed profile with provenance', () => {
    const p = resolvePersonFromEmail('priya.nair@zomato.in')!;
    expect(p.id).toMatch(/^person_/);
    expect(p.confidence).toBeGreaterThan(0);
    expect(p.confidence).toBeLessThanOrEqual(0.99);
    expect(p.phone).toBeTruthy();
    expect(p.linkedin_url).toContain('linkedin.com');
    expect(p.provenance.length).toBeGreaterThanOrEqual(5);
    expect(p.sources.length).toBeGreaterThan(0);
    // last_verified is a stable ISO date, never in the future of the demo epoch.
    expect(p.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not use Math.random — 100 calls stay identical', () => {
    const first = JSON.stringify(resolvePersonFromEmail('repeat@corp.io'));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(resolvePersonFromEmail('repeat@corp.io'))).toBe(first);
    }
  });

  it('rejects structurally invalid input', () => {
    expect(resolvePersonFromEmail('not-an-email')).toBeNull();
    expect(resolvePersonFromEmail('missing@domain')).toBeNull();
    expect(resolvePersonFromEmail('@nolocal.com')).toBeNull();
    expect(resolvePersonFromEmail('')).toBeNull();
  });
});
