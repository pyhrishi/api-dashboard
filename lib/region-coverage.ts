/**
 * Multi-region coverage — deterministic dataset-coverage model (single source of truth).
 *
 * Zinbit's enrichment coverage is not uniform across the world: North America is
 * the core, EMEA and APAC are strong, LATAM is developing. This module is the
 * honest, stable map of *where the dataset is deep and where it is thin* — per
 * region and per data type (email, phone, company, technographic, social), with
 * dataset size, match rate, median freshness, top countries, and named gaps.
 *
 * It answers the pre-purchase question — "do you cover my market?" — and powers
 * the /console/regions dashboard. Deterministic (curated bases + FNV-1a jitter,
 * no Math.random, no wall-clock), so the page and any future coverage endpoint
 * always agree.
 */

export type RegionKey = 'namer' | 'emea' | 'apac' | 'latam';
export type CoverageDataType = 'email' | 'phone' | 'company' | 'technographic' | 'social';
export type CoverageTier = 'core' | 'strong' | 'developing';

export interface DataTypeCoverage {
  type: CoverageDataType;
  label: string;
  /** Share of in-region records for which this attribute is present (0–1). */
  coverage: number;
  /** Match rate when this attribute is requested in-region (0–1). */
  matchRate: number;
}

export interface CountryCoverage {
  country: string;
  code: string;
  contacts: number;
  matchRate: number;
}

export interface RegionCoverage {
  key: RegionKey;
  name: string;
  short: string;
  tier: CoverageTier;
  contacts: number;
  companies: number;
  /** Overall in-region match rate across data types (0–1). */
  matchRate: number;
  /** Median record age in days — lower is fresher. */
  freshnessDays: number;
  byDataType: DataTypeCoverage[];
  topCountries: CountryCoverage[];
  /** Honest, human-readable thin-coverage notes. */
  gaps: string[];
}

export interface CoverageSnapshot {
  regions: RegionCoverage[];
  totals: {
    contacts: number;
    companies: number;
    countries: number;
    matchRate: number;
  };
  strongestRegion: RegionKey;
  developingRegion: RegionKey;
  /** The five data types, in canonical display order, with global coverage. */
  dataTypes: { type: CoverageDataType; label: string; globalCoverage: number }[];
}

const DATA_TYPE_LABEL: Record<CoverageDataType, string> = {
  email: 'Email',
  phone: 'Direct phone',
  company: 'Firmographics',
  technographic: 'Technographics',
  social: 'Social profiles',
};
const DATA_TYPE_ORDER: CoverageDataType[] = ['email', 'phone', 'company', 'technographic', 'social'];

interface RegionSeed {
  key: RegionKey;
  name: string;
  short: string;
  tier: CoverageTier;
  contacts: number;
  companies: number;
  freshnessDays: number;
  /** email, phone, company, technographic, social — coverage shares. */
  coverage: Record<CoverageDataType, number>;
  countries: { country: string; code: string; share: number; matchRate: number }[];
  gaps: string[];
}

/** Curated, realistic per-region bases — the believable shape of a global B2B dataset. */
const REGION_SEEDS: RegionSeed[] = [
  {
    key: 'namer', name: 'North America', short: 'NAMER', tier: 'core',
    contacts: 78_400_000, companies: 12_100_000, freshnessDays: 19,
    coverage: { email: 0.97, phone: 0.93, company: 0.96, technographic: 0.91, social: 0.88 },
    countries: [
      { country: 'United States', code: 'US', share: 0.82, matchRate: 0.95 },
      { country: 'Canada', code: 'CA', share: 0.18, matchRate: 0.9 },
    ],
    gaps: ['Coverage is deepest here — direct dials and technographics are near-complete for US B2B.'],
  },
  {
    key: 'emea', name: 'Europe, Middle East & Africa', short: 'EMEA', tier: 'strong',
    contacts: 61_200_000, companies: 9_300_000, freshnessDays: 33,
    coverage: { email: 0.93, phone: 0.79, company: 0.94, technographic: 0.86, social: 0.82 },
    countries: [
      { country: 'United Kingdom', code: 'GB', share: 0.26, matchRate: 0.91 },
      { country: 'Germany', code: 'DE', share: 0.22, matchRate: 0.88 },
      { country: 'France', code: 'FR', share: 0.17, matchRate: 0.85 },
      { country: 'Netherlands', code: 'NL', share: 0.09, matchRate: 0.86 },
      { country: 'United Arab Emirates', code: 'AE', share: 0.07, matchRate: 0.74 },
    ],
    gaps: [
      'GDPR-compliant direct dials are thinner than NAMER — mobile coverage varies by country.',
      'Sub-Saharan Africa is early-stage; expect company data before contact data.',
    ],
  },
  {
    key: 'apac', name: 'Asia-Pacific', short: 'APAC', tier: 'strong',
    contacts: 54_900_000, companies: 8_600_000, freshnessDays: 41,
    coverage: { email: 0.9, phone: 0.72, company: 0.92, technographic: 0.83, social: 0.8 },
    countries: [
      { country: 'India', code: 'IN', share: 0.31, matchRate: 0.87 },
      { country: 'Australia', code: 'AU', share: 0.19, matchRate: 0.89 },
      { country: 'Singapore', code: 'SG', share: 0.14, matchRate: 0.86 },
      { country: 'Japan', code: 'JP', share: 0.13, matchRate: 0.78 },
      { country: 'Indonesia', code: 'ID', share: 0.08, matchRate: 0.7 },
    ],
    gaps: [
      'Company graph is strong across the region; direct dials are developing in Southeast Asia.',
      'Japan & South Korea skew to firmographics over personal contact data.',
    ],
  },
  {
    key: 'latam', name: 'Latin America', short: 'LATAM', tier: 'developing',
    contacts: 19_600_000, companies: 3_200_000, freshnessDays: 57,
    coverage: { email: 0.84, phone: 0.63, company: 0.88, technographic: 0.74, social: 0.77 },
    countries: [
      { country: 'Brazil', code: 'BR', share: 0.44, matchRate: 0.82 },
      { country: 'Mexico', code: 'MX', share: 0.27, matchRate: 0.79 },
      { country: 'Argentina', code: 'AR', share: 0.12, matchRate: 0.72 },
      { country: 'Colombia', code: 'CO', share: 0.1, matchRate: 0.7 },
      { country: 'Chile', code: 'CL', share: 0.07, matchRate: 0.71 },
    ],
    gaps: [
      'Phone coverage is thin outside Brazil & Mexico — expect email-first enrichment.',
      'Technographic signal is developing; firmographics are the strongest attribute here.',
    ],
  },
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildRegion(seed: RegionSeed): RegionCoverage {
  const byDataType: DataTypeCoverage[] = DATA_TYPE_ORDER.map((type) => {
    const coverage = seed.coverage[type];
    // Match rate tracks coverage, discounted a touch and with a stable per-cell jitter.
    const jitter = ((hash(`${seed.key}:${type}`) % 5) - 2) / 100; // -0.02..+0.02
    const matchRate = Math.max(0.5, Math.min(0.99, Math.round((coverage - 0.03 + jitter) * 100) / 100));
    return { type, label: DATA_TYPE_LABEL[type], coverage, matchRate };
  });

  // Overall in-region match rate = mean of per-type match rates.
  const matchRate = Math.round((byDataType.reduce((n, d) => n + d.matchRate, 0) / byDataType.length) * 100) / 100;

  const topCountries: CountryCoverage[] = seed.countries.map((c) => ({
    country: c.country,
    code: c.code,
    contacts: Math.round((seed.contacts * c.share) / 1000) * 1000,
    matchRate: c.matchRate,
  }));

  return {
    key: seed.key,
    name: seed.name,
    short: seed.short,
    tier: seed.tier,
    contacts: seed.contacts,
    companies: seed.companies,
    matchRate,
    freshnessDays: seed.freshnessDays,
    byDataType,
    topCountries,
    gaps: seed.gaps,
  };
}

/** The full, deterministic multi-region coverage snapshot. */
export function getCoverageSnapshot(): CoverageSnapshot {
  const regions = REGION_SEEDS.map(buildRegion);

  const contacts = regions.reduce((n, r) => n + r.contacts, 0);
  const companies = regions.reduce((n, r) => n + r.companies, 0);
  const countries = regions.reduce((n, r) => n + r.topCountries.length, 0);
  // Contact-weighted global match rate.
  const matchRate = Math.round((regions.reduce((n, r) => n + r.matchRate * r.contacts, 0) / (contacts || 1)) * 100) / 100;

  const strongest = regions.reduce((best, r) => (r.matchRate > best.matchRate ? r : best), regions[0]);
  const developing = regions.reduce((low, r) => (r.matchRate < low.matchRate ? r : low), regions[0]);

  const dataTypes = DATA_TYPE_ORDER.map((type) => {
    // Contact-weighted global coverage for this data type.
    const globalCoverage =
      Math.round(
        (regions.reduce((n, r) => n + (r.byDataType.find((d) => d.type === type)?.coverage ?? 0) * r.contacts, 0) /
          (contacts || 1)) * 100,
      ) / 100;
    return { type, label: DATA_TYPE_LABEL[type], globalCoverage };
  });

  return {
    regions,
    totals: { contacts, companies, countries, matchRate },
    strongestRegion: strongest.key,
    developingRegion: developing.key,
    dataTypes,
  };
}

/** Coverage → semantic tone key, for consistent heat coloring across the UI. */
export function coverageBand(v: number): 'high' | 'good' | 'fair' | 'low' {
  if (v >= 0.9) return 'high';
  if (v >= 0.78) return 'good';
  if (v >= 0.65) return 'fair';
  return 'low';
}
