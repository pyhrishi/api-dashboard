import { toEnrichmentResult, freshnessAgeLabel } from '@/data/enrichments';

describe('field-level freshness timestamps', () => {
  const sample = { name: 'Acme Corp', industry: 'Software', region: 'US', founded: 2015 };

  it('stamps every result field with a verified date and a tier', () => {
    const vm = toEnrichmentResult(sample);
    expect(vm).not.toBeNull();
    if (!vm) return;
    expect(vm.fields.length).toBeGreaterThan(0);
    for (const f of vm.fields) {
      expect(f.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['fresh', 'aging', 'stale']).toContain(f.freshness);
      // never in the future relative to the fixed demo clock (2026-09-06)
      expect(Date.parse(`${f.verifiedAt}T00:00:00Z`)).toBeLessThanOrEqual(Date.UTC(2026, 8, 6));
    }
  });

  it('is deterministic (same input → same per-field freshness)', () => {
    expect(toEnrichmentResult(sample)).toEqual(toEnrichmentResult(sample));
  });

  it('varies freshness across fields (not one date for the whole record)', () => {
    const vm = toEnrichmentResult(sample);
    const dates = new Set((vm?.fields ?? []).map((f) => f.verifiedAt));
    expect(dates.size).toBeGreaterThan(1);
  });

  it('maps a tier consistently to its age', () => {
    const vm = toEnrichmentResult(sample);
    for (const f of vm?.fields ?? []) {
      const days = Math.round((Date.UTC(2026, 8, 6) - Date.parse(`${f.verifiedAt}T00:00:00Z`)) / 86400000);
      const expected = days <= 30 ? 'fresh' : days <= 90 ? 'aging' : 'stale';
      expect(f.freshness).toBe(expected);
    }
  });

  it('formats a human age label relative to the fixed clock', () => {
    expect(freshnessAgeLabel('2026-09-06')).toBe('today');
    expect(freshnessAgeLabel('2026-08-25')).toBe('12d ago');
    expect(freshnessAgeLabel('2026-07-06')).toBe('2mo ago');
  });
});
