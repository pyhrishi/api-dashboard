/**
 * Coverage gap reporting — tenant-specific demand-vs-supply gap analysis.
 *
 * Regional Coverage (lib/region-coverage.ts) is the *supply* map: the global
 * dataset, the same for everyone — "do you cover my market?". This module is
 * the *demand* side joined against it: it takes an account's own request
 * distribution (which regions and data types its traffic actually hits) and
 * overlays it on the coverage ceiling, surfacing the segments where the account
 * spends lookups on data Zinbit is thin on — ranked by what it costs them, with
 * a concrete recommendation and an addressable-uplift number.
 *
 * Deterministic: the per-account demand profile is FNV-1a-seeded by org id (no
 * Math.random, no wall-clock), and the supply comes from the shared coverage
 * snapshot — so the gap report is stable, reproduces, and always agrees with
 * the Regional Coverage page. Switching orgs yields a different, coherent
 * profile (multi-tenant).
 */

import {
  getCoverageSnapshot,
  type RegionKey, type CoverageDataType,
} from '@/lib/region-coverage';

export type { RegionKey, CoverageDataType } from '@/lib/region-coverage';

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ExpansionStatus = 'open' | 'acknowledged';

/** One region × data-type slice of the account's traffic, scored for gap. */
export interface CoverageGap {
  /** Stable id: `${region}:${dataType}`. */
  id: string;
  region: RegionKey;
  regionName: string;
  dataType: CoverageDataType;
  dataTypeLabel: string;
  /** Monthly requests the account sends in this segment. */
  requests: number;
  matched: number;
  missed: number;
  /** matched / requests (0–1) — the account's realized match rate here. */
  matchRate: number;
  /** The dataset's in-region match ceiling for this data type (0–1). */
  ceiling: number;
  severity: GapSeverity;
  /** Credits spent on lookups that returned nothing, per month. */
  wastedCredits: number;
  /** Extra contacts the account would match if this segment reached core-region coverage. */
  addressableContacts: number;
  recommendation: string;
}

export interface CoverageGapSummary {
  /** Weighted match rate across the account's whole traffic (0–1). */
  overallMatchRate: number;
  totalRequests: number;
  totalMissed: number;
  totalWastedCredits: number;
  /** Segments at medium severity or worse. */
  gapCount: number;
  /** The single worst gap (by wasted credits), or null when well-covered. */
  biggestGap: CoverageGap | null;
  /** Total addressable contacts across all gaps if coverage were lifted. */
  addressableUplift: number;
}

export interface CoverageGapReport {
  gaps: CoverageGap[];
  summary: CoverageGapSummary;
  /** The account's dominant industry — flavors recommendations. */
  industry: string;
  period: string;
}

/** A user-submitted request to expand coverage for a gap (persisted in the store). */
export interface CoverageExpansionRequest {
  id: string;
  segmentId: string;
  region: RegionKey;
  dataType: CoverageDataType;
  note: string;
  status: ExpansionStatus;
  createdAt: number;
}

const DAY = 86_400_000;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rand = (seed: string): number => (hash(seed) % 100000) / 100000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const REGIONS: RegionKey[] = ['namer', 'emea', 'apac', 'latam'];
const DATA_TYPES: CoverageDataType[] = ['email', 'phone', 'company', 'technographic', 'social'];

/** Credits charged per successful lookup, by data type (phone/social are premium). */
const CREDIT_COST: Record<CoverageDataType, number> = { email: 1, phone: 3, company: 1, technographic: 2, social: 2 };

const INDUSTRIES = ['B2B SaaS', 'Financial Services', 'Healthcare', 'Retail & E-commerce', 'Manufacturing', 'Media & Adtech'];

interface DemandProfile {
  industry: string;
  totalRequests: number;
  regionWeights: Record<RegionKey, number>;
  dataTypeWeights: Record<CoverageDataType, number>;
}

/** Build a deterministic, realistic monthly demand profile for an account. */
function demandProfile(orgId: string): DemandProfile {
  const industry = INDUSTRIES[hash(`ind:${orgId}`) % INDUSTRIES.length];

  // Total monthly requests: 40k–240k.
  const totalRequests = 40_000 + Math.round(rand(`vol:${orgId}`) * 200_000);

  // A "home" region gets the lion's share; the rest taper. Deterministic per org.
  const homeIdx = hash(`home:${orgId}`) % REGIONS.length;
  const regionRaw: Record<RegionKey, number> = { namer: 0, emea: 0, apac: 0, latam: 0 };
  REGIONS.forEach((r, i) => {
    const base = i === homeIdx ? 0.5 : 0.12;
    regionRaw[r] = base + rand(`rw:${orgId}:${r}`) * 0.25;
  });
  const regionWeights = normalize(regionRaw);

  // Data-type mix: email/company are always heavy; phone/technographic/social vary.
  const dtRaw: Record<CoverageDataType, number> = {
    email: 0.9 + rand(`dt:${orgId}:email`) * 0.2,
    company: 0.7 + rand(`dt:${orgId}:company`) * 0.3,
    phone: 0.2 + rand(`dt:${orgId}:phone`) * 0.6,
    technographic: 0.15 + rand(`dt:${orgId}:tech`) * 0.5,
    social: 0.1 + rand(`dt:${orgId}:social`) * 0.4,
  };
  const dataTypeWeights = normalize(dtRaw);

  return { industry, totalRequests, regionWeights, dataTypeWeights };
}

function normalize<K extends string>(raw: Record<K, number>): Record<K, number> {
  const total = Object.values(raw).reduce((n: number, v) => n + (v as number), 0) || 1;
  const out = {} as Record<K, number>;
  (Object.keys(raw) as K[]).forEach((k) => { out[k] = raw[k] / total; });
  return out;
}

function severityFor(matchRate: number, missed: number): GapSeverity {
  // A gap is worse the lower the match rate AND the more volume it misses.
  const shortfall = 1 - matchRate;
  if (shortfall >= 0.28 && missed >= 3000) return 'critical';
  if (shortfall >= 0.18 && missed >= 1500) return 'high';
  if (shortfall >= 0.1 && missed >= 500) return 'medium';
  return 'low';
}

function recommend(region: RegionKey, regionName: string, dataType: CoverageDataType, ceiling: number, tier: string): string {
  if (dataType === 'phone' && ceiling < 0.8) {
    return `Enable email-first fallback for ${regionName} — direct-dial coverage is thin here; route misses to verified email.`;
  }
  if ((dataType === 'technographic' || dataType === 'social') && ceiling < 0.85) {
    return `Supplement ${dataTypeLabelOf(dataType)} with firmographics in ${regionName}, where company data is deeper.`;
  }
  if (tier === 'developing' || ceiling < 0.8) {
    return `Request a coverage expansion for ${regionName} ${dataTypeLabelOf(dataType)} — your demand outpaces current supply.`;
  }
  if (ceiling < 0.9) {
    return `Add a re-verification pass for ${regionName} ${dataTypeLabelOf(dataType)} to recover recently-decayed records.`;
  }
  return `${regionName} ${dataTypeLabelOf(dataType)} is well-covered — no action needed.`;
}

function dataTypeLabelOf(t: CoverageDataType): string {
  const snap = getCoverageSnapshot();
  return snap.dataTypes.find((d) => d.type === t)?.label ?? t;
}

/**
 * Analyze an account's coverage gaps: join its demand profile against the
 * global supply ceiling, score each region × data-type segment, and rank by the
 * credits it wastes. Deterministic per org.
 */
export function analyzeCoverageGaps(orgId: string): CoverageGapReport {
  const profile = demandProfile(orgId);
  const snap = getCoverageSnapshot();
  const regionByKey = new Map(snap.regions.map((r) => [r.key, r]));
  // The best achievable ceiling per data type (core region) — the uplift target.
  const bestCeiling: Record<CoverageDataType, number> = {} as Record<CoverageDataType, number>;
  DATA_TYPES.forEach((t) => {
    bestCeiling[t] = Math.max(...snap.regions.map((r) => r.byDataType.find((d) => d.type === t)?.matchRate ?? 0));
  });

  const gaps: CoverageGap[] = [];
  for (const region of REGIONS) {
    const rc = regionByKey.get(region);
    if (!rc) continue;
    for (const dataType of DATA_TYPES) {
      const requests = Math.round(profile.totalRequests * profile.regionWeights[region] * profile.dataTypeWeights[dataType]);
      if (requests < 200) continue; // ignore negligible segments
      const cell = rc.byDataType.find((d) => d.type === dataType);
      const ceiling = cell?.matchRate ?? 0.5;
      const matched = Math.round(requests * ceiling);
      const missed = requests - matched;
      const matchRate = Math.round((matched / requests) * 1000) / 1000;
      const wastedCredits = missed * CREDIT_COST[dataType];
      const upliftRate = clamp01(bestCeiling[dataType] - ceiling);
      const addressableContacts = Math.round(requests * upliftRate);
      const severity = severityFor(matchRate, missed);

      gaps.push({
        id: `${region}:${dataType}`,
        region,
        regionName: rc.short,
        dataType,
        dataTypeLabel: cell?.label ?? dataType,
        requests,
        matched,
        missed,
        matchRate,
        ceiling,
        severity,
        wastedCredits,
        addressableContacts,
        recommendation: recommend(region, rc.short, dataType, ceiling, rc.tier),
      });
    }
  }

  gaps.sort(byImpact);

  const totalRequests = gaps.reduce((n, g) => n + g.requests, 0);
  const totalMatched = gaps.reduce((n, g) => n + g.matched, 0);
  const totalMissed = gaps.reduce((n, g) => n + g.missed, 0);
  const totalWastedCredits = gaps.reduce((n, g) => n + g.wastedCredits, 0);
  const addressableUplift = gaps.reduce((n, g) => n + g.addressableContacts, 0);
  const realGaps = gaps.filter((g) => g.severity === 'critical' || g.severity === 'high' || g.severity === 'medium');

  return {
    gaps,
    summary: {
      overallMatchRate: totalRequests > 0 ? Math.round((totalMatched / totalRequests) * 1000) / 1000 : 0,
      totalRequests,
      totalMissed,
      totalWastedCredits,
      gapCount: realGaps.length,
      biggestGap: realGaps[0] ?? null,
      addressableUplift,
    },
    industry: profile.industry,
    period: 'Trailing 30 days',
  };
}

/** Rank: worst wasted-credit segments first, then by raw missed volume. */
const byImpact = (a: CoverageGap, b: CoverageGap): number =>
  b.wastedCredits - a.wastedCredits || b.missed - a.missed;

const SEVERITY_RANK: Record<GapSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
export const gapSeverityRank = (s: GapSeverity): number => SEVERITY_RANK[s];
export const isRealGap = (g: CoverageGap): boolean => g.severity !== 'low';

/** The gap report for the API gateway (a stable demo account). */
export function gapReportForAccount(orgId = 'org_1'): CoverageGapReport {
  return analyzeCoverageGaps(orgId);
}

/** Build a fresh expansion-request record (id + timestamp assigned by the store). */
export function makeExpansionRequest(gap: CoverageGap, note: string, now: number = Date.now()): CoverageExpansionRequest {
  return {
    id: `cxr_${now.toString(36)}${(hash(`${gap.id}:${now}`) % 1000).toString(36)}`,
    segmentId: gap.id,
    region: gap.region,
    dataType: gap.dataType,
    note: note.trim(),
    status: 'open',
    createdAt: now,
  };
}

export const relativeDays = (ts: number, now: number = Date.now()): number => Math.floor((now - ts) / DAY);
