/**
 * Regional API endpoints (F-070) — the single source of truth for Zinbit's
 * regional edge.
 *
 * The global host (api.zinbit.zintlr.com) smart-routes to the nearest edge;
 * these region-pinned hosts guarantee a request is served — and data processed —
 * in one region, for latency and for data-residency compliance (GDPR in the EU,
 * DPDP in India, CCPA in the US). The region ids match the gateway's internal
 * regions exactly, and `resolveRegionForKey` mirrors the gateway's deterministic
 * home-region derivation (same key hash), so the console and the real gateway
 * always agree on where a key is served.
 *
 * Deterministic: no Math.random, no wall-clock in region resolution.
 */

import { REGIONAL_API_HOSTS, API_SANDBOX_BASE_URL } from '@/lib/api-config';

export type RegionId = 'us-east-1' | 'eu-west-1' | 'ap-south-1';
/** The residency codes the gateway understands (keyRecord.dataResidency). */
export type ResidencyCode = 'US' | 'EU' | 'IN';

export interface RegionMeta {
  id: RegionId;
  host: string;
  label: string;
  city: string;
  country: string;
  countryCode: string;
  /** Residency code the gateway enforces for a key pinned here. */
  residency: ResidencyCode;
  /** Compliance frameworks guaranteed for data processed in-region. */
  compliance: string[];
  /** Typical baseline round-trip latency (ms) from this edge — for the demo. */
  baselineLatencyMs: number;
  description: string;
}

/** Canonical order — matches the gateway's `regions` array (index-sensitive). */
export const REGION_IDS: RegionId[] = ['us-east-1', 'eu-west-1', 'ap-south-1'];

export const REGIONS: Record<RegionId, RegionMeta> = {
  'us-east-1': {
    id: 'us-east-1',
    host: REGIONAL_API_HOSTS['us-east-1'],
    label: 'US East (N. Virginia)',
    city: 'N. Virginia',
    country: 'United States',
    countryCode: 'US',
    residency: 'US',
    compliance: ['SOC 2', 'CCPA'],
    baselineLatencyMs: 42,
    description: 'Primary North American edge — deepest coverage and lowest latency for US B2B traffic.',
  },
  'eu-west-1': {
    id: 'eu-west-1',
    host: REGIONAL_API_HOSTS['eu-west-1'],
    label: 'EU West (Ireland)',
    city: 'Dublin',
    country: 'Ireland',
    countryCode: 'IE',
    residency: 'EU',
    compliance: ['SOC 2', 'GDPR'],
    baselineLatencyMs: 58,
    description: 'European edge — data stays in the EU with GDPR-compliant processing and masking on live keys.',
  },
  'ap-south-1': {
    id: 'ap-south-1',
    host: REGIONAL_API_HOSTS['ap-south-1'],
    label: 'Asia Pacific (Mumbai)',
    city: 'Mumbai',
    country: 'India',
    countryCode: 'IN',
    residency: 'IN',
    compliance: ['SOC 2', 'DPDP'],
    baselineLatencyMs: 74,
    description: 'India edge — DPDP-compliant residency, the strongest registry-backed identity coverage for APAC.',
  },
};

export const regionById = (id: RegionId): RegionMeta => REGIONS[id];
export const allRegions = (): RegionMeta[] => REGION_IDS.map((id) => REGIONS[id]);

/**
 * The home region for an API key — the region the gateway will serve it from.
 * MUST match the gateway's derivation (app/api/v1/[...route]/route.ts):
 * a stable per-key hash into the region list, so it's stable per account and
 * the console agrees with the real routing.
 */
export function resolveRegionForKey(apiKey: string): RegionId {
  if (!apiKey) return 'us-east-1';
  const keyHash = Array.from(apiKey).reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 0);
  return REGION_IDS[Math.abs(keyHash) % REGION_IDS.length];
}

/** The live regional base URL for a region (no `/v1` — paths carry it). Sandbox is global. */
export function regionalBaseUrl(id: RegionId, environment: 'live' | 'sandbox' = 'live'): string {
  return environment === 'sandbox' ? API_SANDBOX_BASE_URL : `https://${REGIONS[id].host}`;
}

/** Map a residency pin to its region (the gateway's dataResidency → region rule). */
export function regionForResidency(residency: ResidencyCode): RegionId {
  return residency === 'EU' ? 'eu-west-1' : residency === 'IN' ? 'ap-south-1' : 'us-east-1';
}

/**
 * Would a request forced to `target` violate a residency pin? The gateway
 * returns 451 when a key pinned to one region is forced to another.
 */
export function isCrossBorder(pinned: RegionId | null, target: RegionId): boolean {
  return pinned !== null && pinned !== target;
}

/** Compliance frameworks a region guarantees, formatted for display. */
export const complianceFor = (id: RegionId): string[] => REGIONS[id].compliance;
