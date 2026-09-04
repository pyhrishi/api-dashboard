import { discoverSocialProfiles } from '@/lib/social-resolver';

describe('social profile discovery', () => {
  it('discovers profiles deterministically (same input → same output)', () => {
    const a = discoverSocialProfiles('jane.doe@acme.com');
    const b = discoverSocialProfiles('jane.doe@acme.com');
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it('normalizes the email before hashing (case/whitespace-insensitive)', () => {
    expect(discoverSocialProfiles('  Jane.Doe@ACME.com ')).toEqual(discoverSocialProfiles('jane.doe@acme.com'));
  });

  it('always returns a verified LinkedIn as the single primary profile', () => {
    const sd = discoverSocialProfiles('marcus@stripe.com');
    expect(sd).not.toBeNull();
    if (!sd) return;
    const primaries = sd.profiles.filter((p) => p.primary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].platform).toBe('LinkedIn');
    expect(primaries[0].verified).toBe(true);
  });

  it('keeps every profile coherent and within valid ranges', () => {
    const sd = discoverSocialProfiles('priya.nair@zomato.in');
    expect(sd).not.toBeNull();
    if (!sd) return;
    expect(sd.platform_count).toBe(sd.profiles.length);
    expect(sd.profiles.length).toBeGreaterThanOrEqual(1);
    for (const p of sd.profiles) {
      expect(p.handle.length).toBeGreaterThan(0);
      expect(p.url).toMatch(/^https?:\/\//);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(0.99);
      if (p.followers !== undefined) expect(p.followers).toBeGreaterThanOrEqual(0);
    }
    expect(sd.provenance.map((x) => x.field)).toEqual(
      expect.arrayContaining(['linkedin', 'cross_platform', 'activity'])
    );
  });

  it('distinguishes different contacts', () => {
    const a = discoverSocialProfiles('a@acme.com');
    const b = discoverSocialProfiles('b@globex.com');
    expect(a?.profiles[0].url).not.toEqual(b?.profiles[0].url);
  });
});
