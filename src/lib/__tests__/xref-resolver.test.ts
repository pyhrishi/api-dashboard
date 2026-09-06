/**
 * F-039 Cross-reference ID mapping — resolver tests.
 * Deterministic, no network, no wall-clock.
 */
import {
  resolveCrossReference,
  detectIdSystem,
  type XrefResolution,
} from '@/lib/xref-resolver';

describe('detectIdSystem', () => {
  it('detects each supported input format', () => {
    expect(detectIdSystem('jane.doe@acme.com')).toBe('email');
    expect(detectIdSystem('stripe.com')).toBe('domain');
    expect(detectIdSystem('https://www.linkedin.com/company/stripe')).toBe('linkedin');
    expect(detectIdSystem('https://www.crunchbase.com/organization/stripe')).toBe('crunchbase');
    expect(detectIdSystem('github.com/stripe')).toBe('github');
    expect(detectIdSystem('x.com/stripe')).toBe('twitter');
    expect(detectIdSystem('@stripe')).toBe('twitter');
    expect(detectIdSystem('zid_c_abc123def456')).toBe('zinbit');
    expect(detectIdSystem('001Abc123Def456Gh')).toBe('salesforce');
    expect(detectIdSystem('123456789')).toBe('duns');
    expect(detectIdSystem('1234567')).toBe('hubspot');
    expect(detectIdSystem('SHOP')).toBe('ticker');
    expect(detectIdSystem('')).toBe('unknown');
    expect(detectIdSystem('some random company name')).toBe('unknown');
  });
});

describe('resolveCrossReference — forward', () => {
  it('resolves a domain to a company with a full ID map', () => {
    const r = resolveCrossReference('stripe.com')!;
    expect(r).not.toBeNull();
    expect(r.entity_type).toBe('company');
    expect(r.resolution_path).toBe('forward');
    expect(r.zinbit_id).toMatch(/^zid_c_/);
    // Canonical Zinbit ID is present and flagged.
    const canon = r.references.find((x) => x.canonical)!;
    expect(canon.system).toBe('zinbit');
    expect(canon.id).toBe(r.zinbit_id);
    // Spans multiple system categories.
    const cats = new Set(r.references.map((x) => x.category));
    expect(cats.has('internal')).toBe(true);
    expect(cats.has('crm')).toBe(true);
    expect(cats.has('data-provider')).toBe(true);
    // Salesforce Account IDs start 001; HubSpot is numeric.
    const sf = r.references.find((x) => x.system === 'salesforce')!;
    expect(sf.id).toMatch(/^001/);
    const hs = r.references.find((x) => x.system === 'hubspot')!;
    expect(hs.id).toMatch(/^\d+$/);
    // The domain input is marked matched.
    expect(r.references.find((x) => x.system === 'domain')!.matched).toBe(true);
  });

  it('resolves a corporate email to a person', () => {
    const r = resolveCrossReference('jane.doe@acme.com')!;
    expect(r.entity_type).toBe('person');
    expect(r.zinbit_id).toMatch(/^zid_p_/);
    expect(r.references.find((x) => x.system === 'email')!.matched).toBe(true);
    // Salesforce Contact IDs start 003.
    expect(r.references.find((x) => x.system === 'salesforce')!.id).toMatch(/^003/);
  });

  it('resolves a known ticker to its company', () => {
    const r = resolveCrossReference('SHOP')!;
    expect(r.entity_type).toBe('company');
    expect(r.canonical.toLowerCase()).toContain('shop');
    const ticker = r.references.find((x) => x.system === 'ticker')!;
    expect(ticker.id).toBe('SHOP');
    expect(ticker.matched).toBe(true);
  });

  it('resolves a company name via alias resolution', () => {
    const r = resolveCrossReference('Jaded Pixel');
    expect(r).not.toBeNull();
    expect(r!.entity_type).toBe('company');
    expect(r!.canonical.toLowerCase()).toContain('shopify');
  });
});

describe('resolveCrossReference — reverse', () => {
  it('reverse-resolves a Salesforce ID back to the same entity', () => {
    const forward = resolveCrossReference('stripe.com')!;
    const sfId = forward.references.find((x) => x.system === 'salesforce')!.id;
    const back = resolveCrossReference(sfId)!;
    expect(back).not.toBeNull();
    expect(back.resolution_path).toBe('reverse');
    expect(back.zinbit_id).toBe(forward.zinbit_id);
    expect(back.references.find((x) => x.system === 'salesforce')!.matched).toBe(true);
  });

  it('reverse-resolves a DUNS number back to the same company', () => {
    const forward = resolveCrossReference('datadoghq.com')!;
    const duns = forward.references.find((x) => x.system === 'duns')!.id;
    const back = resolveCrossReference(duns)!;
    expect(back.zinbit_id).toBe(forward.zinbit_id);
  });

  it('reverse-resolves a Zinbit ID back to its entity', () => {
    const forward = resolveCrossReference('notion.so')!;
    const back = resolveCrossReference(forward.zinbit_id)!;
    expect(back.zinbit_id).toBe(forward.zinbit_id);
    expect(back.references.find((x) => x.system === 'zinbit')!.matched).toBe(true);
  });
});

describe('determinism & edge cases', () => {
  it('is fully deterministic across calls', () => {
    const a = JSON.stringify(resolveCrossReference('stripe.com'));
    const b = JSON.stringify(resolveCrossReference('stripe.com'));
    expect(a).toBe(b);
  });

  it('returns null for empty or unresolvable input', () => {
    expect(resolveCrossReference('')).toBeNull();
    expect(resolveCrossReference('   ')).toBeNull();
    expect(resolveCrossReference('001NoSuchAccountIdXYZ')).toBeNull();
  });

  it('lists unresolved systems for a private company (no ticker)', () => {
    const r = resolveCrossReference('acme.com') as XrefResolution;
    // acme.com resolves; if private, ticker is unresolved.
    const hasTickerRef = r.references.some((x) => x.system === 'ticker');
    const hasTickerUnresolved = r.unresolved.some((x) => x.system === 'ticker');
    expect(hasTickerRef || hasTickerUnresolved).toBe(true);
  });

  it('every reference URL is either null or an absolute/scheme URL', () => {
    const r = resolveCrossReference('stripe.com')!;
    r.references.forEach((ref) => {
      if (ref.url !== null) {
        expect(/^(https?:|mailto:|tel:)/.test(ref.url)).toBe(true);
      }
    });
  });
});
