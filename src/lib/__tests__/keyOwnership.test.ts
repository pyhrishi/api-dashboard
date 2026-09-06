import {
  resolveOwner, normalizeLabel, allLabels, computeOwnership, summarizeOwnership,
  filterKeys, unownedKeys, memberLabel,
} from '@/lib/key-ownership';
import { useStore, type MockKey, type TeamMember } from '@/lib/store';

const members: TeamMember[] = [
  { id: 'usr_1', email: 'a@x.com', role: 'admin', status: 'active', joinedAt: '' },
  { id: 'usr_2', email: 'b@x.com', role: 'developer', status: 'active', joinedAt: '' },
];
const key = (over: Partial<MockKey>): MockKey => ({
  id: `k_${Math.random().toString(36).slice(2, 7)}`, name: 'K', key: 'sk_test_x', scopes: ['a'],
  createdAt: '', status: 'active', environment: 'sandbox', ...over,
});

describe('key-ownership SSOT', () => {
  it('resolves owner and normalizes labels', () => {
    expect(resolveOwner(key({ ownerId: 'usr_1' }), members)!.email).toBe('a@x.com');
    expect(resolveOwner(key({}), members)).toBeNull();
    expect(resolveOwner(key({ ownerId: 'ghost' }), members)).toBeNull(); // stale
    expect(normalizeLabel('  Prod Team!! ')).toBe('prod-team');
    expect(normalizeLabel('a'.repeat(40)).length).toBe(24);
    expect(memberLabel(members[0])).toBe('a@x.com');
  });

  it('collects distinct labels and filters', () => {
    const keys = [key({ labels: ['prod', 'team-a'] }), key({ labels: ['prod'] }), key({})];
    expect(allLabels(keys)).toEqual(['prod', 'team-a']);
    expect(filterKeys(keys, { label: 'prod' })).toHaveLength(2);
    expect(filterKeys(keys, { ownerId: 'unowned' })).toHaveLength(3);
  });

  it('summarizes ownership + unowned', () => {
    const keys = [
      key({ ownerId: 'usr_1', labels: ['prod'] }),
      key({ ownerId: 'usr_1' }),
      key({ ownerId: 'usr_2' }),
      key({}),
    ];
    const s = summarizeOwnership(keys, members);
    expect(s.total).toBe(4);
    expect(s.owned).toBe(3);
    expect(s.unowned).toBe(1);
    expect(s.labelled).toBe(1);
    expect(s.byOwner[0].owner.id).toBe('usr_1'); // most keys
    expect(s.byOwner[0].count).toBe(2);
    expect(unownedKeys(keys)).toHaveLength(1);
    expect(computeOwnership(keys, members)[0].owner!.id).toBe('usr_1');
  });
});

describe('key-ownership store actions', () => {
  beforeEach(() => {
    useStore.setState({
      activeKeys: [key({ id: 'k1', name: 'Prod' })],
      teamMembers: members,
    });
    const u = useStore.getState().user;
    if (u && u.role !== 'admin') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('sets normalized, deduped, capped labels', () => {
    useStore.getState().setKeyLabels('k1', ['Prod', 'prod', 'Team A', '', 'x'.repeat(40)]);
    const labels = useStore.getState().activeKeys.find((k) => k.id === 'k1')!.labels!;
    expect(labels).toContain('prod');
    expect(labels).toContain('team-a');
    expect(labels.filter((l) => l === 'prod')).toHaveLength(1); // deduped
    expect(labels.every((l) => l.length <= 24)).toBe(true);
  });

  it('assigns and clears an owner', () => {
    useStore.getState().assignKeyOwner('k1', 'usr_2');
    expect(useStore.getState().activeKeys.find((k) => k.id === 'k1')!.ownerId).toBe('usr_2');
    useStore.getState().assignKeyOwner('k1', null);
    expect(useStore.getState().activeKeys.find((k) => k.id === 'k1')!.ownerId).toBeUndefined();
  });

  it('rejects an unknown owner and blocks non-admins', () => {
    expect(() => useStore.getState().assignKeyOwner('k1', 'ghost')).toThrow();
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', email: 'd@x.com' }), role: 'developer' } as typeof u });
    expect(() => useStore.getState().setKeyLabels('k1', ['x'])).toThrow();
    expect(() => useStore.getState().assignKeyOwner('k1', 'usr_1')).toThrow();
  });
});
