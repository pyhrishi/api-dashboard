import {
  benchmarkCategory, getBenchmarkReport, benchmarkForCategory, wilsonInterval,
  ALL_CATEGORIES, pct,
} from '@/lib/accuracy-benchmark';
import { useStore } from '@/lib/store';

describe('accuracy-benchmark engine', () => {
  it('benchmarks a category deterministically with consistent, bounded scores', () => {
    const a = benchmarkCategory('email', 0);
    expect(benchmarkCategory('email', 0)).toEqual(a);
    // precision/recall are exactly what the confusion matrix yields
    expect(a.precision).toBeCloseTo(a.truePositives / (a.truePositives + a.falsePositives), 3);
    expect(a.recall).toBeCloseTo(a.truePositives / (a.truePositives + a.falseNegatives), 3);
    for (const v of [a.precision, a.recall, a.f1]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(a.sampleSize).toBe(a.truePositives + a.falseNegatives);
    expect(a.lastBenchmarked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('registry identity (IDS engine) out-precisions a pure-lookup category', () => {
    const registry = benchmarkCategory('registry_id', 0);
    const title = benchmarkCategory('title', 0);
    expect(registry.engine).toBe('ids');
    expect(registry.precision).toBeGreaterThan(title.precision);
  });

  it('produces a valid Wilson interval that brackets the point estimate', () => {
    const [lo, hi] = wilsonInterval(0.95, 1000);
    expect(lo).toBeGreaterThan(0.9);
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeLessThan(0.95);
    expect(hi).toBeGreaterThan(0.95);
    // Narrower interval with a larger sample
    const wide = wilsonInterval(0.95, 100);
    expect(hi - lo).toBeLessThan(wide[1] - wide[0]);
    expect(wilsonInterval(0.9, 0)).toEqual([0, 0]);
  });

  it('builds a full report with a coherent overall roll-up', () => {
    const report = getBenchmarkReport(0);
    expect(report.categories).toHaveLength(ALL_CATEGORIES.length);
    const totalTP = report.categories.reduce((n, c) => n + c.truePositives, 0);
    const totalFP = report.categories.reduce((n, c) => n + c.falsePositives, 0);
    expect(report.overall.precision).toBeCloseTo(totalTP / (totalTP + totalFP), 3);
    expect(report.overall.totalSamples).toBe(report.categories.reduce((n, c) => n + c.sampleSize, 0));
    expect(['excellent', 'strong', 'fair']).toContain(report.overall.grade);
  });

  it('every comparison names the incumbents and computes a lead', () => {
    const report = getBenchmarkReport(0);
    report.comparisons.forEach((cmp) => {
      expect(cmp.competitors.map((c) => c.vendor)).toEqual(
        expect.arrayContaining(['Clearbit', 'People Data Labs', 'ZoomInfo', 'Apollo']),
      );
      const best = Math.max(...cmp.competitors.map((c) => c.precision));
      expect(cmp.lead).toBeCloseTo(cmp.zinbitPrecision - best, 3);
    });
  });

  it('Zinbit leads widest on the registry category (the moat)', () => {
    const report = getBenchmarkReport(0);
    const registry = report.comparisons.find((c) => c.category === 'registry_id')!;
    const title = report.comparisons.find((c) => c.category === 'title')!;
    expect(registry.lead).toBeGreaterThan(title.lead);
  });

  it('is honest, not a clean sweep: registry keeps the moat while lookup can be competitive', () => {
    // Registry identity always leads decisively (no incumbent offers it)...
    for (const cyc of [0, 1, 2, 3]) {
      const registry = getBenchmarkReport(cyc).comparisons.find((c) => c.category === 'registry_id')!;
      expect(registry.lead).toBeGreaterThan(0.05);
    }
    // ...but on pure-lookup categories a strong incumbent reaches parity/ahead
    // somewhere across cycles, so the "Competitive" state is real.
    const anyCompetitive = [0, 1, 2, 3].some((cyc) =>
      getBenchmarkReport(cyc).comparisons.some((c) => c.lead <= 0),
    );
    expect(anyCompetitive).toBe(true);
  });

  it('a re-sample cycle can shift the numbers', () => {
    const c0 = getBenchmarkReport(0).overall;
    const c1 = getBenchmarkReport(1).overall;
    // Deterministic per cycle; totals differ because sample sizes jitter.
    expect(c0.totalSamples).not.toBe(c1.totalSamples);
  });

  it('scores a category by name and returns null for the unknown', () => {
    expect(benchmarkForCategory('phone')!.category).toBe('phone');
    expect(benchmarkForCategory('Work email')!.category).toBe('email');
    expect(benchmarkForCategory('astrology')).toBeNull();
  });

  it('formats percentages', () => {
    expect(pct(0.972)).toBe('97.2%');
    expect(pct(1)).toBe('100.0%');
  });
});

describe('accuracy-benchmark store slice', () => {
  beforeEach(() => {
    useStore.setState({ accuracyBenchmarkRuns: [] });
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('re-runs the benchmark and records a coherent run', () => {
    const run = useStore.getState().runAccuracyBenchmark();
    expect(run.totalSamples).toBeGreaterThan(0);
    expect(run.precision).toBeGreaterThan(0);
    expect(useStore.getState().accuracyBenchmarkRuns[0].id).toBe(run.id);
    expect(useStore.getState().accuracyBenchmarkRuns[0].cycle).toBe(1);
  });

  it('caps run history at 12', () => {
    for (let i = 0; i < 15; i++) useStore.getState().runAccuracyBenchmark();
    expect(useStore.getState().accuracyBenchmarkRuns.length).toBe(12);
  });

  it('blocks the billing role from re-running', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    expect(() => useStore.getState().runAccuracyBenchmark()).toThrow();
  });
});
