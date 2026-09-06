import { attributeSources, resolveProvider } from '@/lib/source-catalog';
import { resolvePersonFromEmail } from '@/lib/person-resolver';

describe('source attribution (F-043)', () => {
  it('returns null when there is no provenance to attribute', () => {
    expect(attributeSources(undefined)).toBeNull();
    expect(attributeSources([])).toBeNull();
  });

  it('maps a known provenance source to its catalogued provider', () => {
    const p = resolveProvider('MCA registry');
    expect(p.name).toBe('MCA Registry');
    expect(p.category).toBe('registry');
    expect(p.reliability).toBeGreaterThan(0.9);
    expect(p.license).toMatch(/registry/i);
  });

  it('falls back to a categorized derived provider for an unlisted source', () => {
    const derived = resolveProvider('Some Model Inference');
    expect(derived.category).toBe('derived');
    const registry = resolveProvider('State Filing Registry');
    expect(registry.category).toBe('registry');
  });

  it('groups a real person result by provider with counts and categories', () => {
    const person = resolvePersonFromEmail('jane.doe@acme.com')!;
    const a = attributeSources(person.provenance)!;
    expect(a.fieldCount).toBe(person.provenance.length);
    expect(a.providerCount).toBeGreaterThan(1);
    // Every field is attributed exactly once across providers.
    const attributedFields = a.providers.flatMap((pr) => pr.fields.map((f) => f.field));
    expect(attributedFields.length).toBe(person.provenance.length);
    // Providers are sorted by field count (most first).
    for (let i = 1; i < a.providers.length; i++) {
      expect(a.providers[i - 1].fields.length).toBeGreaterThanOrEqual(a.providers[i].fields.length);
    }
    // The category tally sums to the provider count.
    expect(a.byCategory.reduce((n, c) => n + c.count, 0)).toBe(a.providerCount);
    // Each provider carries a bounded average confidence.
    a.providers.forEach((pr) => {
      expect(pr.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(pr.avgConfidence).toBeLessThanOrEqual(0.99);
    });
  });

  it('is deterministic for the same provenance', () => {
    const person = resolvePersonFromEmail('marcus@stripe.com')!;
    expect(attributeSources(person.provenance)).toEqual(attributeSources(person.provenance));
  });
});
