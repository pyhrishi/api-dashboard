import { checkDomainAuth } from '@/lib/email-domain-auth';

describe('email domain authentication (SPF/DKIM/DMARC)', () => {
  it('is deterministic per domain', () => {
    expect(checkDomainAuth('stripe.com')).toEqual(checkDomainAuth('stripe.com'));
  });

  it('normalizes protocol, www, path, and email-address input to the domain', () => {
    const base = checkDomainAuth('stripe.com');
    expect(checkDomainAuth('https://www.Stripe.com/pricing')).toEqual(base);
    expect(checkDomainAuth('jane.doe@stripe.com')).toEqual(base);
  });

  it('returns null for input with no resolvable domain', () => {
    expect(checkDomainAuth('')).toBeNull();
    expect(checkDomainAuth('not-a-domain')).toBeNull();
  });

  it('produces a coherent posture within valid ranges', () => {
    const r = checkDomainAuth('datadoghq.com');
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(['Strong', 'Partial', 'Weak', 'None']).toContain(r.grade);
    expect(['none', 'quarantine', 'reject']).toContain(r.dmarc.policy);
    // A domain is spoofable exactly when DMARC does not quarantine/reject.
    const enforced = r.dmarc.present && (r.dmarc.policy === 'quarantine' || r.dmarc.policy === 'reject');
    expect(r.spoofable).toBe(!enforced);
    // grade tracks score
    if (r.score >= 80) expect(r.grade).toBe('Strong');
    if (r.score < 25) expect(r.grade).toBe('None');
  });

  it('surfaces all three checks with records and provenance', () => {
    const r = checkDomainAuth('shopify.com');
    expect(r?.checks.map((c) => c.key)).toEqual(['spf', 'dkim', 'dmarc']);
    r?.checks.forEach((c) => {
      expect(['pass', 'partial', 'fail']).toContain(c.status);
      expect(c.record.length).toBeGreaterThan(0);
    });
    expect(r?.provenance.map((p) => p.field)).toEqual(expect.arrayContaining(['spf', 'dkim', 'dmarc']));
  });

  it('distinguishes different domains', () => {
    const a = checkDomainAuth('acme.com');
    const b = checkDomainAuth('globex.com');
    expect(a?.score !== b?.score || a?.dmarc.policy !== b?.dmarc.policy).toBe(true);
  });
});
