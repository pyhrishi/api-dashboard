import { verifyPhoneForEmail } from '@/lib/phone-verifier';
import { toEnrichmentResult } from '@/data/enrichments';

describe('phone append & verification', () => {
  it('appends a verified phone deterministically (same input → same output)', () => {
    const a = verifyPhoneForEmail('jane.doe@acme.com');
    const b = verifyPhoneForEmail('jane.doe@acme.com');
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it('normalizes the email before hashing (case/whitespace-insensitive)', () => {
    expect(verifyPhoneForEmail('  Jane.Doe@ACME.com ')).toEqual(verifyPhoneForEmail('jane.doe@acme.com'));
  });

  it('returns coherent verification fields within valid ranges', () => {
    const pv = verifyPhoneForEmail('marcus@stripe.com');
    expect(pv).not.toBeNull();
    if (!pv) return;
    expect(['mobile', 'direct_dial', 'landline', 'voip']).toContain(pv.line_type);
    expect(['verified', 'unverified', 'unreachable']).toContain(pv.verification_status);
    expect(pv.dnc_safe).toBe(!pv.dnc);
    expect(pv.reachability).toBeGreaterThanOrEqual(0);
    expect(pv.reachability).toBeLessThanOrEqual(0.99);
    expect(pv.confidence).toBeGreaterThan(0);
    expect(pv.phone_national).not.toMatch(/^\+/); // national format has no country prefix
    expect(pv.verified === (pv.verification_status === 'verified')).toBe(true);
    expect(pv.provenance.map((p) => p.field)).toEqual(expect.arrayContaining(['phone', 'line_type', 'dnc']));
  });

  it('distinguishes different contacts', () => {
    const a = verifyPhoneForEmail('a@acme.com');
    const b = verifyPhoneForEmail('b@globex.com');
    expect(a?.phone).not.toEqual(b?.phone);
  });

  it('renders a phone-shaped response through toEnrichmentResult', () => {
    const pv = verifyPhoneForEmail('priya.nair@zomato.in');
    expect(pv).not.toBeNull();
    if (!pv) return;
    const vm = toEnrichmentResult({ success: true, ...pv });
    expect(vm).not.toBeNull();
    expect(vm?.fields.map((f) => f.label)).toEqual(
      expect.arrayContaining(['Phone', 'Line type', 'Carrier', 'Region', 'Reachability', 'Do-Not-Call'])
    );
    // DNC standing is surfaced as a badge either way.
    expect(vm?.badges).toEqual(expect.arrayContaining([pv.dnc_safe ? 'DNC-safe' : 'On DNC']));
    expect(vm?.confidence).toBe(pv.confidence);
    expect(vm?.provenance?.length).toBeGreaterThan(0);
  });
});
