import { getQualitySLAReport } from '@/lib/quality-sla';

describe('quality SLA report', () => {
  it('is deterministic', () => {
    expect(getQualitySLAReport()).toEqual(getQualitySLAReport());
  });

  it('builds six metrics with coherent status + 30-day trend', () => {
    const r = getQualitySLAReport();
    expect(r.metrics).toHaveLength(6);
    for (const m of r.metrics) {
      expect(['met', 'at_risk', 'breached']).toContain(m.status);
      expect(m.history).toHaveLength(30);
      expect(m.current).toBeGreaterThan(0);
      expect(m.target).toBeGreaterThan(0);
      // status is consistent with current vs target + direction
      if (m.higherIsBetter && m.current >= m.target) expect(m.status).toBe('met');
      if (!m.higherIsBetter && m.current <= m.target) expect(m.status).toBe('met');
    }
  });

  it('derives compliance and overall status from the metrics', () => {
    const r = getQualitySLAReport();
    const met = r.metrics.filter((m) => m.status === 'met').length;
    expect(r.compliancePct).toBe(Math.round((met / r.metrics.length) * 100));
    const worst = r.metrics.some((m) => m.status === 'breached') ? 'breached'
      : r.metrics.some((m) => m.status === 'at_risk') ? 'at_risk' : 'met';
    expect(r.overallStatus).toBe(worst);
  });

  it('opens a breach for every metric not currently met', () => {
    const r = getQualitySLAReport();
    const notMet = r.metrics.filter((m) => m.status !== 'met').map((m) => m.label);
    const open = r.breaches.filter((b) => !b.resolved).map((b) => b.metric);
    expect(open.sort()).toEqual(notMet.sort());
    // curated resolved history is always present
    expect(r.breaches.some((b) => b.resolved)).toBe(true);
  });

  it('honors a supplied match rate', () => {
    const low = getQualitySLAReport({ matchRate: 0.5 });
    const mr = low.metrics.find((m) => m.key === 'match_rate')!;
    expect(mr.current).toBe(50);
    expect(mr.status).toBe('breached');
  });
});
