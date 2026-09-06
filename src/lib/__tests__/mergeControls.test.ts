import { useStore } from '@/lib/store';
import { generateMergeCandidates } from '@/lib/merge-seed';

describe('merge candidate seed', () => {
  it('is deterministic with multiple >=2-member groups and stable zids', () => {
    const a = generateMergeCandidates();
    expect(generateMergeCandidates()).toEqual(a);
    const groupIds = Array.from(new Set(a.map((e) => e.groupId)));
    expect(groupIds.length).toBeGreaterThanOrEqual(3);
    groupIds.forEach((g) => expect(a.filter((e) => e.groupId === g).length).toBeGreaterThanOrEqual(2));
    a.forEach((e) => expect(e.zid).toMatch(/^zid_p_[0-9a-z]+$/));
  });
});

describe('merge & unmerge store slice', () => {
  beforeEach(() => {
    useStore.setState({ mergeableEntities: [], entityMerges: [] });
    // ensure a non-billing actor so the RBAC guard allows mutations
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
    useStore.getState().seedMergeCandidates();
  });

  it('seeds candidates idempotently', () => {
    const n = useStore.getState().mergeableEntities.length;
    expect(n).toBeGreaterThan(0);
    useStore.getState().seedMergeCandidates();
    expect(useStore.getState().mergeableEntities.length).toBe(n);
  });

  it('merges a group into the surviving canonical id, then reverts', () => {
    const ents = useStore.getState().mergeableEntities;
    const groupId = ents[0].groupId;
    const group = ents.filter((e) => e.groupId === groupId);
    const surviving = group[0];
    const others = group.slice(1);

    const id = useStore.getState().mergeEntities(surviving.id, others.map((o) => o.id), 'confirmed duplicate');
    const merge = useStore.getState().entityMerges.find((m) => m.id === id)!;
    expect(merge.status).toBe('active');
    expect(merge.canonicalZid).toBe(surviving.zid);
    expect(merge.mergedEntityIds).toHaveLength(others.length);
    expect(merge.reason).toBe('confirmed duplicate');

    useStore.getState().revertMerge(id);
    const reverted = useStore.getState().entityMerges.find((m) => m.id === id)!;
    expect(reverted.status).toBe('reverted');
    expect(reverted.revertedAt).toBeGreaterThan(0);
  });

  it('blocks merges for the billing role', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    const ents = useStore.getState().mergeableEntities;
    expect(() => useStore.getState().mergeEntities(ents[0].id, [ents[1].id], 'x')).toThrow();
  });
});
