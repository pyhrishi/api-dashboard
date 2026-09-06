import { getHealthSnapshot } from '@/lib/health';

describe('platform health snapshot', () => {
  it('is deterministic', () => {
    expect(getHealthSnapshot()).toEqual(getHealthSnapshot());
  });

  it('returns coherent components over a 60-day window', () => {
    const s = getHealthSnapshot();
    expect(s.window_days).toBe(60);
    expect(s.components.length).toBeGreaterThanOrEqual(4);
    for (const c of s.components) {
      expect(['operational', 'degraded', 'down']).toContain(c.status);
      expect(c.history).toHaveLength(60);
      c.history.forEach((h) => expect(['operational', 'degraded', 'down']).toContain(h));
      expect(c.latency_ms).toBeGreaterThan(0);
      expect(c.uptime).toBeGreaterThanOrEqual(0);
      expect(c.uptime).toBeLessThanOrEqual(100);
      // current status equals today's (last) history entry
      expect(c.status).toBe(c.history[59]);
      // uptime reflects the operational share of the window
      const good = c.history.filter((h) => h === 'operational').length;
      expect(c.uptime).toBe(Math.round((good / 60) * 10000) / 100);
    }
  });

  it('derives overall status as the worst component and sets degraded accordingly', () => {
    const s = getHealthSnapshot();
    const anyBad = s.components.some((c) => c.status !== 'operational');
    expect(s.degraded).toBe(anyBad || s.status !== 'operational');
    if (!anyBad) {
      expect(s.status).toBe('operational');
      expect(s.degraded).toBe(false);
    }
    expect(s.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('averages component uptime for the overall figure', () => {
    const s = getHealthSnapshot();
    const mean = Math.round((s.components.reduce((n, c) => n + c.uptime, 0) / s.components.length) * 100) / 100;
    expect(s.uptime).toBe(mean);
  });
});
