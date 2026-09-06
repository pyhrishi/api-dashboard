import { resolveCompanyTimeseries } from '@/lib/company-timeseries-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';

describe('historical time-series attributes (F-022)', () => {
  it('returns null for personal / unrecognized domains', () => {
    expect(resolveCompanyTimeseries('jane@gmail.com')).toBeNull();
    expect(resolveCompanyTimeseries('')).toBeNull();
  });

  it('produces a coherent monthly series anchored to current firmographics', () => {
    const ts = resolveCompanyTimeseries('stripe.com')!;
    expect(ts).not.toBeNull();
    expect(ts.months).toBe(24);
    expect(ts.attributes.length).toBeGreaterThanOrEqual(4);
    const head = ts.attributes.find((a) => a.attribute === 'headcount')!;
    // Every series has `months` points, oldest → newest.
    expect(head.points).toHaveLength(24);
    // The newest point equals the live firmographic headcount.
    const company = resolveCompanyFromDomain('stripe.com')!;
    expect(head.points[head.points.length - 1].value).toBe(company.employee_count);
    expect(head.current).toBe(company.employee_count);
  });

  it('estimated revenue tracks headcount month-for-month', () => {
    const ts = resolveCompanyTimeseries('shopify.com')!;
    const head = ts.attributes.find((a) => a.attribute === 'headcount')!;
    const rev = ts.attributes.find((a) => a.attribute === 'est_revenue_usd')!;
    expect(rev.unit).toBe('USD');
    // Same number of points, and revenue is a positive multiple of headcount each month.
    expect(rev.points).toHaveLength(head.points.length);
    rev.points.forEach((p, i) => {
      if (head.points[i].value > 0) expect(p.value).toBeGreaterThan(head.points[i].value);
    });
  });

  it('months are consecutive and end on the reference month', () => {
    const ts = resolveCompanyTimeseries('datadoghq.com')!;
    const months = ts.attributes[0].points.map((p) => p.month);
    expect(months[months.length - 1]).toBe('2026-09');
    expect(months[0]).toBe(ts.from_month);
    // No gaps: each month is one after the previous.
    for (let i = 1; i < months.length; i++) {
      const [py, pm] = months[i - 1].split('-').map(Number);
      const [cy, cm] = months[i].split('-').map(Number);
      expect(cy * 12 + cm).toBe(py * 12 + pm + 1);
    }
  });

  it('computes 12-month + MoM growth and a trend consistent with them', () => {
    ['stripe.com', 'datadoghq.com', 'shopify.com', 'notion.so'].forEach((d) => {
      const ts = resolveCompanyTimeseries(d)!;
      ts.attributes.forEach((a) => {
        const expected = a.growth_12mo_pct >= 40 && a.avg_mom_pct >= 3 ? 'accelerating'
          : a.growth_12mo_pct >= 8 ? 'growing'
          : a.growth_12mo_pct <= -5 ? 'declining' : 'flat';
        expect(a.trend).toBe(expected);
      });
      // Momentum mirrors the headcount trend.
      expect(ts.momentum).toBe(ts.attributes.find((a) => a.attribute === 'headcount')!.trend);
    });
  });

  it('respects a custom window, clamped to 6..36', () => {
    expect(resolveCompanyTimeseries('stripe.com', 12)!.months).toBe(12);
    expect(resolveCompanyTimeseries('stripe.com', 999)!.months).toBe(36);
    expect(resolveCompanyTimeseries('stripe.com', 1)!.months).toBe(6);
  });

  it('is deterministic and domain-normalized', () => {
    expect(resolveCompanyTimeseries('shopify.com')).toEqual(resolveCompanyTimeseries('shopify.com'));
    expect(resolveCompanyTimeseries('https://www.shopify.com/x')).toEqual(resolveCompanyTimeseries('shopify.com'));
  });
});
