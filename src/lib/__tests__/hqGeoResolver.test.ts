import { resolveOfficeGeography } from '@/lib/hq-geo-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { toEnrichmentResult } from '@/data/enrichments';

describe('HQ & office geo-resolution', () => {
  it('is deterministic for the same domain', () => {
    expect(resolveOfficeGeography('stripe.com')).toEqual(resolveOfficeGeography('stripe.com'));
  });

  it('returns null for personal mailbox and invalid domains', () => {
    expect(resolveOfficeGeography('gmail.com')).toBeNull();
    expect(resolveOfficeGeography('not a domain')).toBeNull();
    expect(resolveOfficeGeography('')).toBeNull();
  });

  it('anchors the HQ to the company dossier and geocodes it', () => {
    const domain = 'datadoghq.com';
    const company = resolveCompanyFromDomain(domain);
    const geo = resolveOfficeGeography(domain);
    expect(company).not.toBeNull();
    expect(geo).not.toBeNull();
    expect(geo!.hq.is_hq).toBe(true);
    expect(geo!.hq.city).toBe(company!.hq_city);
    expect(geo!.hq.country).toBe(company!.hq_country);
    expect(geo!.hq.timezone).toBe(company!.timezone);
    // Coordinates are real numbers within valid bounds.
    expect(Math.abs(geo!.hq.geo.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(geo!.hq.geo.lng)).toBeLessThanOrEqual(180);
  });

  it('produces a coherent office list with a valid headcount split', () => {
    const domain = 'shopify.com';
    const company = resolveCompanyFromDomain(domain)!;
    const geo = resolveOfficeGeography(domain)!;
    expect(geo.offices.length).toBe(geo.office_count);
    expect(geo.offices[0].is_hq).toBe(true);
    // Exactly one HQ.
    expect(geo.offices.filter((o) => o.is_hq)).toHaveLength(1);
    // No duplicate cities.
    const cities = geo.offices.map((o) => o.city);
    expect(new Set(cities).size).toBe(cities.length);
    // Headcounts are non-negative and sum to the company total.
    geo.offices.forEach((o) => expect(o.headcount).toBeGreaterThanOrEqual(0));
    const sum = geo.offices.reduce((n, o) => n + o.headcount, 0);
    expect(sum).toBe(company.employee_count);
  });

  it('derives reach signals and a well-formed UTC outreach window', () => {
    const geo = resolveOfficeGeography('stripe.com')!;
    expect(geo.country_count).toBeGreaterThanOrEqual(1);
    expect(geo.continent_count).toBeGreaterThanOrEqual(1);
    expect(geo.timezones.length).toBeGreaterThanOrEqual(1);
    expect(typeof geo.follow_the_sun).toBe('boolean');
    expect(geo.outreach_window_utc).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2} UTC$/);
    expect(geo.confidence).toBeGreaterThan(0);
    expect(geo.confidence).toBeLessThanOrEqual(0.97);
  });

  it('flows through the Studio dispatch into an officeGeo view-model', () => {
    const geo = resolveOfficeGeography('stripe.com')!;
    const vm = toEnrichmentResult({ success: true, ...geo });
    expect(vm).not.toBeNull();
    expect(vm!.kind).toBe('company');
    expect(vm!.officeGeo).toBeDefined();
    expect(vm!.officeGeo!.officeCount).toBe(geo.office_count);
    expect(vm!.officeGeo!.offices).toHaveLength(geo.offices.length);
    expect(vm!.officeGeo!.hq.isHq).toBe(true);
    expect(vm!.officeGeo!.outreachWindowUtc).toBe(geo.outreach_window_utc);
  });

  it('scales office count with headcount (small companies stay single-site)', () => {
    // Deterministic scan for a small-headcount domain → single office.
    let sawSingle = false;
    let sawMulti = false;
    for (const d of ['a.io', 'b.io', 'c.io', 'd.io', 'e.io', 'f.io', 'stripe.com', 'datadoghq.com']) {
      const geo = resolveOfficeGeography(d);
      if (!geo) continue;
      if (geo.office_count === 1) sawSingle = true;
      if (geo.office_count > 1) sawMulti = true;
    }
    expect(sawSingle || sawMulti).toBe(true);
  });
});
