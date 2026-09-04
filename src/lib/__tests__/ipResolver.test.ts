import { resolveCompanyFromIp, isValidIp, normalizeIp } from '@/lib/ip-resolver';

describe('ip-resolver', () => {
  it('is deterministic — same IP always resolves to the same intel', () => {
    const a = resolveCompanyFromIp('52.38.104.17');
    const b = resolveCompanyFromIp('52.38.104.17');
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it('validates IPv4 and IPv6, rejects junk', () => {
    expect(isValidIp('8.8.8.8')).toBe(true);
    expect(isValidIp('2001:db8::1')).toBe(true);
    expect(isValidIp('::1')).toBe(true);
    expect(isValidIp('999.1.1.1')).toBe(false);
    expect(isValidIp('notanip')).toBe(false);
    expect(resolveCompanyFromIp('notanip')).toBeNull();
    expect(normalizeIp(' 8.8.8.8 ')).toBe('8.8.8.8');
  });

  it('classifies the network and only maps a company for corporate egress', () => {
    const intel = resolveCompanyFromIp('8.8.8.8')!;
    expect(['corporate', 'datacenter', 'vpn', 'consumer', 'mobile']).toContain(intel.ip_type);
    if (intel.is_corporate) {
      expect(intel.company).not.toBeNull();
      expect(intel.confidence).toBeGreaterThanOrEqual(0.7);
    } else {
      expect(intel.company).toBeNull();
      expect(intel.confidence).toBeLessThan(0.7);
    }
  });

  it('returns a complete, well-typed dossier with provenance', () => {
    const intel = resolveCompanyFromIp('104.18.32.7')!;
    expect(intel.id).toMatch(/^ip_/);
    expect(intel.asn).toMatch(/^AS\d+/);
    expect(intel.isp).toBeTruthy();
    expect(intel.organization).toBeTruthy();
    expect(intel.provenance.length).toBeGreaterThanOrEqual(4);
    expect(intel.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([4, 6]).toContain(intel.ip_version);
  });

  it('does not use Math.random — 100 calls stay identical', () => {
    const first = JSON.stringify(resolveCompanyFromIp('203.0.113.42'));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(resolveCompanyFromIp('203.0.113.42'))).toBe(first);
  });
});
