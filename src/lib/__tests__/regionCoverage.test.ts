import { getCoverageSnapshot, coverageBand, type RegionKey } from '@/lib/region-coverage';

describe('multi-region coverage', () => {
  it('is deterministic', () => {
    expect(getCoverageSnapshot()).toEqual(getCoverageSnapshot());
  });

  it('covers the four canonical regions with coherent per-type data', () => {
    const snap = getCoverageSnapshot();
    const keys = snap.regions.map((r) => r.key).sort();
    expect(keys).toEqual((['apac', 'emea', 'latam', 'namer'] as RegionKey[]).sort());
    for (const r of snap.regions) {
      expect(r.byDataType).toHaveLength(5);
      for (const d of r.byDataType) {
        expect(d.coverage).toBeGreaterThan(0);
        expect(d.coverage).toBeLessThanOrEqual(1);
        expect(d.matchRate).toBeGreaterThanOrEqual(0.5);
        expect(d.matchRate).toBeLessThanOrEqual(0.99);
      }
      expect(r.topCountries.length).toBeGreaterThanOrEqual(1);
      expect(r.contacts).toBeGreaterThan(0);
      expect(r.freshnessDays).toBeGreaterThan(0);
    }
  });

  it('reconciles totals with the region rollup', () => {
    const snap = getCoverageSnapshot();
    const contacts = snap.regions.reduce((n, r) => n + r.contacts, 0);
    const companies = snap.regions.reduce((n, r) => n + r.companies, 0);
    const countries = snap.regions.reduce((n, r) => n + r.topCountries.length, 0);
    expect(snap.totals.contacts).toBe(contacts);
    expect(snap.totals.companies).toBe(companies);
    expect(snap.totals.countries).toBe(countries);
    expect(snap.totals.matchRate).toBeGreaterThan(0);
    expect(snap.totals.matchRate).toBeLessThanOrEqual(1);
  });

  it('identifies NAMER as strongest and LATAM as developing', () => {
    const snap = getCoverageSnapshot();
    expect(snap.strongestRegion).toBe('namer');
    expect(snap.developingRegion).toBe('latam');
    const namer = snap.regions.find((r) => r.key === 'namer')!;
    const latam = snap.regions.find((r) => r.key === 'latam')!;
    expect(namer.matchRate).toBeGreaterThan(latam.matchRate);
  });

  it('exposes five global data-type coverages and bands them', () => {
    const snap = getCoverageSnapshot();
    expect(snap.dataTypes).toHaveLength(5);
    snap.dataTypes.forEach((d) => {
      expect(d.globalCoverage).toBeGreaterThan(0);
      expect(d.globalCoverage).toBeLessThanOrEqual(1);
    });
    expect(coverageBand(0.95)).toBe('high');
    expect(coverageBand(0.8)).toBe('good');
    expect(coverageBand(0.7)).toBe('fair');
    expect(coverageBand(0.6)).toBe('low');
  });
});
