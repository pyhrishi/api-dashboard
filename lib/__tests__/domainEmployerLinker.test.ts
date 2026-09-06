import { linkDomainToEmployer } from '@/lib/domain-employer-linker';

describe('linkDomainToEmployer', () => {
  it('is deterministic and accepts a domain or an email', () => {
    expect(linkDomainToEmployer('stripe.com')).toEqual(linkDomainToEmployer('stripe.com'));
    const viaEmail = linkDomainToEmployer('jane@stripe.com');
    expect(viaEmail?.domain).toBe('stripe.com');
    expect(viaEmail?.input_email).toBe('jane@stripe.com');
  });

  it('returns null for an unparseable input', () => {
    expect(linkDomainToEmployer('not a domain')).toBeNull();
    expect(linkDomainToEmployer('')).toBeNull();
  });

  it('links a corporate domain to its employer as primary', () => {
    const r = linkDomainToEmployer('datadoghq.com')!;
    expect(r.domain_type).toBe('corporate');
    expect(r.is_employer_domain).toBe(true);
    expect(r.employer).not.toBeNull();
    expect(r.employer!.relationship).toBe('primary');
    expect(r.employer!.canonical_domain).toBe('datadoghq.com');
  });

  it('flags a free/personal mailbox with no employer', () => {
    const r = linkDomainToEmployer('someone@gmail.com')!;
    expect(r.domain_type).toBe('personal_esp');
    expect(r.is_employer_domain).toBe(false);
    expect(r.employer).toBeNull();
    expect(r.guidance).toMatch(/personal mailbox/i);
  });

  it('flags a disposable domain and refuses to attribute an employer', () => {
    const r = linkDomainToEmployer('user@mailinator.com')!;
    expect(r.domain_type).toBe('disposable');
    expect(r.is_employer_domain).toBe(false);
    expect(r.employer).toBeNull();
  });

  it('classifies educational and government TLDs as their own employer', () => {
    const edu = linkDomainToEmployer('prof@mit.edu')!;
    expect(edu.domain_type).toBe('educational');
    expect(edu.is_employer_domain).toBe(true);
    const gov = linkDomainToEmployer('clerk@irs.gov')!;
    expect(gov.domain_type).toBe('government');
    expect(gov.is_employer_domain).toBe(true);
  });

  it('always includes at least one signal and a confidence in range', () => {
    for (const d of ['stripe.com', 'gmail.com', 'mailinator.com', 'mit.edu', 'shopify.com']) {
      const r = linkDomainToEmployer(d)!;
      expect(r.signals.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      const validTypes = ['corporate', 'subsidiary', 'personal_esp', 'disposable', 'educational', 'government', 'parked', 'unknown'];
      expect(validTypes).toContain(r.domain_type);
      // employer presence is consistent with is_employer_domain (except gov/edu can be null if unresolved)
      if (r.domain_type === 'corporate' || r.domain_type === 'subsidiary') {
        expect(r.employer).not.toBeNull();
      }
      if (r.domain_type === 'personal_esp' || r.domain_type === 'disposable') {
        expect(r.employer).toBeNull();
      }
    }
  });
});
