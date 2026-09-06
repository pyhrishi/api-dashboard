import {
  deriveKeyPairs, unpairedKeys, buildKeyPair, generatePairSecret, completenessLabel,
} from '@/lib/key-pairs';
import { useStore, type MockKey } from '@/lib/store';

const k = (over: Partial<MockKey>): MockKey => ({
  id: `k_${Math.random().toString(36).slice(2, 7)}`,
  name: 'K', key: 'sk_test_x', scopes: ['a'], createdAt: new Date().toISOString(),
  status: 'active', environment: 'sandbox', ...over,
});

describe('key-pairs SSOT', () => {
  it('derives complete / partial pairs and ignores unpaired keys', () => {
    const keys = [
      k({ pairId: 'p1', environment: 'sandbox', name: 'Prod' }),
      k({ pairId: 'p1', environment: 'live', name: 'Prod' }),
      k({ pairId: 'p2', environment: 'sandbox', name: 'Staging' }),
      k({ environment: 'live', name: 'Loose' }), // no pairId
    ];
    const pairs = deriveKeyPairs(keys);
    expect(pairs).toHaveLength(2);
    const p1 = pairs.find((p) => p.pairId === 'p1')!;
    expect(p1.completeness).toBe('complete');
    expect(p1.test).toBeTruthy();
    expect(p1.live).toBeTruthy();
    const p2 = pairs.find((p) => p.pairId === 'p2')!;
    expect(p2.completeness).toBe('test_only');
    expect(unpairedKeys(keys).map((x) => x.name)).toEqual(['Loose']);
  });

  it('flags a degraded pair when a side is revoked', () => {
    const pairs = deriveKeyPairs([
      k({ pairId: 'p', environment: 'sandbox' }),
      k({ pairId: 'p', environment: 'live', status: 'revoked' }),
    ]);
    expect(pairs[0].degraded).toBe(true);
  });

  it('buildKeyPair makes a matched pair with correct prefixes', () => {
    const { pairId, test, live } = buildKeyPair('  Prod  ', ['identity:read']);
    expect(test.pairId).toBe(pairId);
    expect(live.pairId).toBe(pairId);
    expect(test.name).toBe('  Prod  '); // store trims; builder preserves
    expect(test.key.startsWith('sk_test_')).toBe(true);
    expect(live.key.startsWith('sk_live_')).toBe(true);
    expect(test.scopes).toEqual(['identity:read']);
    expect(test.scopes).not.toBe(live.scopes); // independent arrays
  });

  it('generatePairSecret + completenessLabel', () => {
    expect(generatePairSecret('live').startsWith('sk_live_')).toBe(true);
    expect(generatePairSecret('sandbox').startsWith('sk_test_')).toBe(true);
    expect(completenessLabel('complete')).toBe('Test + Live');
    expect(completenessLabel('live_only')).toBe('Live only');
  });
});

describe('key-pairs store actions', () => {
  beforeEach(() => {
    useStore.setState({ activeKeys: [] });
    const u = useStore.getState().user;
    if (u && u.role !== 'admin') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('creates a matched test+live pair regardless of current mode', () => {
    useStore.setState({ environment: 'sandbox' });
    const pairId = useStore.getState().createKeyPair('Prod', ['identity:read', 'search:execute']);
    const keys = useStore.getState().activeKeys.filter((x) => x.pairId === pairId);
    expect(keys).toHaveLength(2);
    expect(keys.map((x) => x.environment).sort()).toEqual(['live', 'sandbox']);
    const pairs = deriveKeyPairs(useStore.getState().activeKeys);
    expect(pairs.find((p) => p.pairId === pairId)!.completeness).toBe('complete');
  });

  it('revokes both sides of a pair together', () => {
    const pairId = useStore.getState().createKeyPair('Prod', ['a']);
    useStore.getState().revokeKeyPair(pairId);
    const keys = useStore.getState().activeKeys.filter((x) => x.pairId === pairId);
    expect(keys.every((x) => x.status === 'revoked')).toBe(true);
  });

  it('blocks non-admins', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'D', email: 'd@x.com' }), role: 'developer' } as typeof u });
    expect(() => useStore.getState().createKeyPair('X', ['a'])).toThrow();
  });

  it('rejects a blank name', () => {
    expect(() => useStore.getState().createKeyPair('   ', ['a'])).toThrow();
  });
});
