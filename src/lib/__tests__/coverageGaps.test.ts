import {
  analyzeCoverageGaps, gapReportForAccount, makeExpansionRequest,
  gapSeverityRank, isRealGap,
} from '@/lib/coverage-gaps';
import { getCoverageSnapshot } from '@/lib/region-coverage';
import { useStore, extractTenantState, defaultTenantState } from '@/lib/store';

describe('coverage-gaps engine', () => {
  it('is deterministic per org and coherent internally', () => {
    const a = analyzeCoverageGaps('org_1');
    expect(analyzeCoverageGaps('org_1')).toEqual(a);
    a.gaps.forEach((g) => {
      expect(g.matched + g.missed).toBe(g.requests);
      expect(g.matchRate).toBeGreaterThanOrEqual(0);
      expect(g.matchRate).toBeLessThanOrEqual(1);
      expect(g.wastedCredits).toBe(g.missed * (g.dataType === 'phone' ? 3 : g.dataType === 'email' || g.dataType === 'company' ? 1 : 2));
      expect(g.recommendation.length).toBeGreaterThan(0);
    });
  });

  it('different orgs get different demand profiles', () => {
    const a = analyzeCoverageGaps('org_1');
    const b = analyzeCoverageGaps('org_99');
    expect(a.summary.totalRequests).not.toBe(b.summary.totalRequests);
  });

  it('gaps are ranked by wasted credits, descending', () => {
    const { gaps } = analyzeCoverageGaps('org_1');
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].wastedCredits).toBeGreaterThanOrEqual(gaps[i].wastedCredits);
    }
  });

  it("each gap's ceiling matches the shared coverage snapshot (single source of truth)", () => {
    const snap = getCoverageSnapshot();
    const { gaps } = analyzeCoverageGaps('org_1');
    gaps.forEach((g) => {
      const region = snap.regions.find((r) => r.key === g.region)!;
      const cell = region.byDataType.find((d) => d.type === g.dataType)!;
      expect(g.ceiling).toBe(cell.matchRate);
      expect(g.matched).toBe(Math.round(g.requests * g.ceiling));
    });
  });

  it('thin-supply segments produce a higher severity than core-region email', () => {
    const { gaps } = analyzeCoverageGaps('org_1');
    const latamPhone = gaps.find((g) => g.id === 'latam:phone');
    const namerEmail = gaps.find((g) => g.id === 'namer:email');
    if (latamPhone && namerEmail) {
      expect(gapSeverityRank(latamPhone.severity)).toBeGreaterThanOrEqual(gapSeverityRank(namerEmail.severity));
      expect(namerEmail.severity).toBe('low'); // near-complete US email coverage isn't a gap
    }
  });

  it('summary rolls up coherently and biggestGap is the worst real gap', () => {
    const { summary, gaps } = analyzeCoverageGaps('org_1');
    expect(summary.totalRequests).toBe(gaps.reduce((n, g) => n + g.requests, 0));
    expect(summary.totalMissed).toBe(gaps.reduce((n, g) => n + g.missed, 0));
    expect(summary.overallMatchRate).toBeGreaterThan(0);
    expect(summary.overallMatchRate).toBeLessThanOrEqual(1);
    const realGaps = gaps.filter(isRealGap);
    expect(summary.gapCount).toBe(gaps.filter((g) => g.severity !== 'low').length);
    if (realGaps.length > 0) {
      expect(summary.biggestGap).not.toBeNull();
      // biggest by wasted credits among real gaps
      const worst = realGaps.reduce((m, g) => (g.wastedCredits > m.wastedCredits ? g : m), realGaps[0]);
      expect(summary.biggestGap!.wastedCredits).toBe(worst.wastedCredits);
    }
  });

  it('phone recommendation in a thin region suggests email-first fallback', () => {
    const { gaps } = analyzeCoverageGaps('org_1');
    const thinPhone = gaps.find((g) => g.dataType === 'phone' && g.ceiling < 0.8);
    if (thinPhone) expect(thinPhone.recommendation.toLowerCase()).toContain('email-first');
  });

  it('the gateway account report resolves to a stable demo org', () => {
    expect(gapReportForAccount()).toEqual(analyzeCoverageGaps('org_1'));
  });

  it('builds an expansion request with a stable shape', () => {
    const gap = analyzeCoverageGaps('org_1').gaps[0];
    const req = makeExpansionRequest(gap, '  need this  ', 1000);
    expect(req.segmentId).toBe(gap.id);
    expect(req.region).toBe(gap.region);
    expect(req.note).toBe('need this'); // trimmed
    expect(req.status).toBe('open');
    expect(req.createdAt).toBe(1000);
  });
});

describe('coverage-gaps store slice', () => {
  beforeEach(() => {
    useStore.setState({ coverageExpansionRequests: [], activeOrganizationId: 'org_1' });
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('records an expansion request for a real segment', () => {
    const gap = analyzeCoverageGaps('org_1').gaps[0];
    const id = useStore.getState().requestCoverageExpansion(gap.id, 'expand APAC');
    const reqs = useStore.getState().coverageExpansionRequests;
    expect(reqs[0].id).toBe(id);
    expect(reqs[0].segmentId).toBe(gap.id);
  });

  it('throws on an unknown segment', () => {
    expect(() => useStore.getState().requestCoverageExpansion('atlantis:phone', 'x')).toThrow();
  });

  it('is tenant-scoped: requests flow through the tenant snapshot and default empty per org', () => {
    const gap = analyzeCoverageGaps('org_1').gaps[0];
    useStore.getState().requestCoverageExpansion(gap.id, 'expand');
    // The field is part of the extracted tenant state, so switchOrganization swaps it per-org...
    expect(extractTenantState(useStore.getState()).coverageExpansionRequests).toHaveLength(1);
    // ...and a fresh tenant starts with none (no cross-org leak).
    expect(defaultTenantState().coverageExpansionRequests).toEqual([]);
  });

  it('blocks the billing role', () => {
    const gap = analyzeCoverageGaps('org_1').gaps[0];
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    expect(() => useStore.getState().requestCoverageExpansion(gap.id, 'x')).toThrow();
  });
});
