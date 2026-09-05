import { appendFirmographics } from '@/lib/firmographic-resolver';
import { toEnrichmentResult } from '@/data/enrichments';

describe('firmographic append', () => {
  it('appends firmographics deterministically (same domain → same output)', () => {
    const a = appendFirmographics('stripe.com');
    const b = appendFirmographics('stripe.com');
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it('normalizes the domain (protocol/case/path-insensitive) via the company resolver', () => {
    expect(appendFirmographics('https://Stripe.com/pricing')).toEqual(appendFirmographics('stripe.com'));
  });

  it('returns standardized NAICS/SIC codes with titles and coherent fields', () => {
    const f = appendFirmographics('datadoghq.com');
    expect(f).not.toBeNull();
    if (!f) return;
    expect(f.naics_code).toMatch(/^\d{4,6}$/);
    expect(f.sic_code).toMatch(/^\d{3,4}$/);
    expect(f.naics_title.length).toBeGreaterThan(0);
    expect(['Public', 'Private', 'VC-backed', 'PE-backed', 'Nonprofit', 'Government']).toContain(f.ownership);
    expect(['Corporation', 'LLC', 'Subsidiary', 'Partnership']).toContain(f.entity_type);
    expect(f.confidence).toBeGreaterThan(0);
    expect(f.employee_count).toBeGreaterThan(0);
    expect(f.provenance.map((p) => p.field)).toEqual(expect.arrayContaining(['naics', 'employee_band', 'ownership']));
  });

  it('renders a firmographic response through toEnrichmentResult', () => {
    const f = appendFirmographics('shopify.com');
    expect(f).not.toBeNull();
    if (!f) return;
    const vm = toEnrichmentResult({ success: true, ...f });
    expect(vm).not.toBeNull();
    expect(vm?.kind).toBe('company');
    expect(vm?.fields.map((x) => x.label)).toEqual(
      expect.arrayContaining(['NAICS', 'SIC', 'Industry', 'Employees', 'Revenue band', 'Ownership'])
    );
    expect(vm?.confidence).toBe(f.confidence);
  });
});
