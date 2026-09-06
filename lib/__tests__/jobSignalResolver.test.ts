import { resolveJobGrowthSignals, type JobGrowthSignals } from '@/lib/job-signal-resolver';

const DOMAINS = ['acme.com', 'stripe.com', 'shopify.com', 'datadog.com', 'figma.com', 'notion.so'];

function all(): JobGrowthSignals[] {
  return DOMAINS.map((d) => resolveJobGrowthSignals(d)).filter((s): s is JobGrowthSignals => s !== null);
}

describe('resolveJobGrowthSignals', () => {
  it('is deterministic', () => {
    expect(resolveJobGrowthSignals('acme.com')).toEqual(resolveJobGrowthSignals('acme.com'));
  });

  it('returns null for a personal domain', () => {
    expect(resolveJobGrowthSignals('gmail.com')).toBeNull();
  });

  it('produces a coherent hiring profile', () => {
    for (const s of all()) {
      expect(s.open_roles).toBeGreaterThan(0);
      expect(s.growth_score).toBeGreaterThanOrEqual(0);
      expect(s.growth_score).toBeLessThanOrEqual(100);
      expect(['surging', 'growing', 'steady', 'slowing', 'frozen']).toContain(s.hiring_velocity);
      expect(['hyper-growth', 'high-growth', 'moderate', 'flat']).toContain(s.growth_tier);
      expect(s.by_department.length).toBeGreaterThan(0);
      expect(s.signals.length).toBeGreaterThan(0);
    }
  });

  it('conserves open roles across the department breakdown', () => {
    for (const s of all()) {
      const deptSum = s.by_department.reduce((n, d) => n + d.open, 0);
      expect(deptSum).toBe(s.open_roles);
      // department shares are sorted descending by open count
      for (let i = 1; i < s.by_department.length; i++) {
        expect(s.by_department[i - 1].open).toBeGreaterThanOrEqual(s.by_department[i].open);
      }
    }
  });

  it('keeps location openings within the total', () => {
    for (const s of all()) {
      const locSum = s.locations.reduce((n, l) => n + l.open, 0);
      expect(locSum).toBeLessThanOrEqual(s.open_roles);
      expect(s.locations.length).toBeGreaterThan(0);
    }
  });

  it('seniority mix sums to ~100%', () => {
    for (const s of all()) {
      const sum = s.seniority_mix.reduce((n, m) => n + m.pct, 0);
      expect(sum).toBeGreaterThanOrEqual(97);
      expect(sum).toBeLessThanOrEqual(103);
    }
  });
});
