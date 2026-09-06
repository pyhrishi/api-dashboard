import {
  REGIONS, REGION_IDS, allRegions, regionById, resolveRegionForKey, regionalBaseUrl,
  regionForResidency, isCrossBorder, type RegionId,
} from '@/lib/regions';
import { REGIONAL_API_HOSTS } from '@/lib/api-config';
import { useStore, extractTenantState, defaultTenantState } from '@/lib/store';

// Independent re-implementation of the gateway's home-region hash, to prove the
// SSOT matches app/api/v1/[...route]/route.ts exactly.
function gatewayRegion(apiKey: string): RegionId {
  const regions: RegionId[] = ['us-east-1', 'eu-west-1', 'ap-south-1'];
  const keyHash = Array.from(apiKey).reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 0);
  return regions[Math.abs(keyHash) % regions.length];
}

describe('regions SSOT', () => {
  it('has three coherent regions with hosts from api-config', () => {
    expect(REGION_IDS).toHaveLength(3);
    for (const id of REGION_IDS) {
      const r = REGIONS[id];
      expect(r.host).toBe(REGIONAL_API_HOSTS[id]);
      expect(r.compliance.length).toBeGreaterThan(0);
      expect(['US', 'EU', 'IN']).toContain(r.residency);
      expect(r.baselineLatencyMs).toBeGreaterThan(0);
    }
    expect(allRegions().map((r) => r.id)).toEqual(REGION_IDS);
  });

  it('resolveRegionForKey is deterministic and matches the gateway derivation', () => {
    for (const key of ['sk_live_abc', 'sk_test_xyz', 'sk_live_mumbai_key', 'sk_test_9', '']) {
      const a = resolveRegionForKey(key);
      expect(resolveRegionForKey(key)).toBe(a);
      if (key) expect(a).toBe(gatewayRegion(key));
    }
  });

  it('builds live regional base URLs and a global sandbox URL', () => {
    expect(regionalBaseUrl('eu-west-1')).toBe('https://eu.api.zinbit.zintlr.com');
    expect(regionalBaseUrl('ap-south-1')).toBe('https://in.api.zinbit.zintlr.com');
    expect(regionalBaseUrl('us-east-1', 'sandbox')).toContain('sandbox');
    expect(regionalBaseUrl('eu-west-1')).not.toContain('/v1');
  });

  it('maps residency codes to regions like the gateway', () => {
    expect(regionForResidency('EU')).toBe('eu-west-1');
    expect(regionForResidency('IN')).toBe('ap-south-1');
    expect(regionForResidency('US')).toBe('us-east-1');
    expect(REGIONS[regionForResidency('EU')].compliance).toContain('GDPR');
    expect(REGIONS[regionForResidency('IN')].compliance).toContain('DPDP');
  });

  it('detects cross-border requests against a pin', () => {
    expect(isCrossBorder('eu-west-1', 'us-east-1')).toBe(true);
    expect(isCrossBorder('eu-west-1', 'eu-west-1')).toBe(false);
    expect(isCrossBorder(null, 'us-east-1')).toBe(false); // no pin = no violation
  });

  it('regionById returns the right metadata', () => {
    expect(regionById('ap-south-1').city).toBe('Mumbai');
    expect(regionById('us-east-1').residency).toBe('US');
  });
});

describe('data-residency store slice', () => {
  beforeEach(() => {
    useStore.setState({ dataResidencyRegion: null });
    const u = useStore.getState().user;
    if (u && u.role !== 'admin') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('pins and clears the residency region (admin), tenant-scoped', () => {
    useStore.getState().setDataResidencyRegion('eu-west-1');
    expect(useStore.getState().dataResidencyRegion).toBe('eu-west-1');
    // The field flows through the tenant snapshot, so it swaps per org.
    expect(extractTenantState(useStore.getState()).dataResidencyRegion).toBe('eu-west-1');
    expect(defaultTenantState().dataResidencyRegion).toBeNull();
    useStore.getState().setDataResidencyRegion(null);
    expect(useStore.getState().dataResidencyRegion).toBeNull();
  });

  it('blocks non-admins (developer/billing) from pinning', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'D', email: 'd@x.com' }), role: 'developer' } as typeof u });
    expect(() => useStore.getState().setDataResidencyRegion('ap-south-1')).toThrow();
  });
});
