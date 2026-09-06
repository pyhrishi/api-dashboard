import {
  PREVIEW_ENDPOINTS, PREVIEW_IDS, previewById, allPreviews, isEnrolled, byStability, stageLabel,
} from '@/lib/preview-program';
import { PREVIEW_RESOLVERS } from '@/lib/preview-resolvers';
import { useStore, extractTenantState, defaultTenantState } from '@/lib/store';

describe('preview program catalog', () => {
  it('is a coherent catalog', () => {
    expect(PREVIEW_ENDPOINTS.length).toBeGreaterThanOrEqual(3);
    for (const p of PREVIEW_ENDPOINTS) {
      expect(['alpha', 'beta', 'preview']).toContain(p.stage);
      expect(p.path).toMatch(/^\/preview\//);
      expect(p.whatsNew.length).toBeGreaterThan(0);
      expect(PREVIEW_RESOLVERS[p.resolverKey]).toBeInstanceOf(Function);
      expect(p.param.name).toBeTruthy();
    }
    expect(allPreviews()).toEqual(PREVIEW_ENDPOINTS);
    expect(PREVIEW_IDS).toEqual(PREVIEW_ENDPOINTS.map((p) => p.id));
  });

  it('previewById + isEnrolled + stability sort', () => {
    expect(previewById('people-search-v2')!.stage).toBe('beta');
    expect(previewById('nope')).toBeUndefined();
    expect(isEnrolled(['a', 'people-search-v2'], 'people-search-v2')).toBe(true);
    expect(isEnrolled([], 'people-search-v2')).toBe(false);
    const sorted = [...PREVIEW_ENDPOINTS].sort(byStability);
    // most-stable (preview/beta) before alpha
    expect(sorted[sorted.length - 1].stage).toBe('alpha');
    expect(stageLabel('beta')).toBe('Beta');
  });
});

describe('preview resolvers', () => {
  it('people-search-v2 resolves a person with an embedded employer', () => {
    const r = PREVIEW_RESOLVERS['people-search-v2']('jane@stripe.com') as Record<string, unknown>;
    expect(r).toBeTruthy();
    expect(r.full_name).toBeTruthy();
    expect(r.employer).toBeTruthy();
    expect(PREVIEW_RESOLVERS['people-search-v2']('')).toBeNull();
  });

  it('company-graph-v2 resolves a company with a corporate family', () => {
    const r = PREVIEW_RESOLVERS['company-graph-v2']('stripe.com') as Record<string, unknown>;
    expect(r.name).toBeTruthy();
    expect(r).toHaveProperty('corporate_family');
  });

  it('buying-signals is deterministic with a bounded intent index', () => {
    const a = PREVIEW_RESOLVERS['buying-signals']('stripe.com') as { intent_index: number; signals: unknown[] };
    expect(PREVIEW_RESOLVERS['buying-signals']('stripe.com')).toEqual(a);
    expect(a.intent_index).toBeGreaterThanOrEqual(0);
    expect(a.intent_index).toBeLessThanOrEqual(100);
    expect(a.signals.length).toBeGreaterThanOrEqual(2);
    expect(PREVIEW_RESOLVERS['buying-signals']('not a domain')).toBeNull();
  });
});

describe('preview enrollment store slice', () => {
  beforeEach(() => {
    useStore.setState({ previewOptIns: [] });
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('enrolls and leaves a preview (tenant-scoped)', () => {
    useStore.getState().enrollPreview('people-search-v2');
    expect(useStore.getState().previewOptIns).toContain('people-search-v2');
    expect(extractTenantState(useStore.getState()).previewOptIns).toContain('people-search-v2');
    expect(defaultTenantState().previewOptIns).toEqual([]);
    // idempotent
    useStore.getState().enrollPreview('people-search-v2');
    expect(useStore.getState().previewOptIns.filter((p) => p === 'people-search-v2')).toHaveLength(1);
    useStore.getState().leavePreview('people-search-v2');
    expect(useStore.getState().previewOptIns).not.toContain('people-search-v2');
  });

  it('throws on an unknown preview id', () => {
    expect(() => useStore.getState().enrollPreview('ghost')).toThrow();
  });

  it('blocks the billing role', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    expect(() => useStore.getState().enrollPreview('people-search-v2')).toThrow();
  });
});
