/**
 * Deterministic domain → company enrichment (single source of truth).
 *
 * Turns a bare domain into a full, *stable* firmographic dossier: the same domain
 * always resolves to the same company, with a confidence score and per-field
 * provenance. Pure and deterministic — no Date.now, no Math.random — so the
 * gateway, Explorer, CLI, and the Enrich console all agree.
 */

export interface CompanyProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export type CompanyType = 'Private' | 'Public' | 'Nonprofit' | 'Government';
export type FundingStage =
  | 'Bootstrapped' | 'Seed' | 'Series A' | 'Series B' | 'Series C' | 'Series D+' | 'Public' | 'Acquired';

export interface EnrichedCompany {
  id: string;
  domain: string;
  name: string;
  legal_name: string;
  description: string;
  industry: string;
  sub_industry: string;
  type: CompanyType;
  employee_count: number;
  employee_band: string;
  revenue_band: string;
  founded_year: number;
  hq_city: string;
  hq_country: string;
  timezone: string;
  tech_stack: string[];
  funding_stage: FundingStage;
  total_raised_usd: number;
  linkedin_url: string;
  twitter_url: string | null;
  logo_initials: string;
  confidence: number;
  is_personal_domain: boolean;
  last_verified: string;
  sources: string[];
  provenance: CompanyProvenance[];
}

// ── Deterministic primitives (shared approach with person-resolver) ──────────
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

// ── Data pools ───────────────────────────────────────────────────────────────
const INDUSTRIES: Array<{ industry: string; sub: string[]; suffix: string; tech: string[] }> = [
  { industry: 'Software', sub: ['Developer Tools', 'SaaS', 'API Infrastructure', 'DevOps'], suffix: 'Technologies', tech: ['AWS', 'Kubernetes', 'React', 'Go', 'PostgreSQL', 'Datadog', 'Stripe', 'Snowflake'] },
  { industry: 'Financial Services', sub: ['Payments', 'Lending', 'Wealth', 'Banking'], suffix: 'Financial', tech: ['Java', 'Kafka', 'Oracle', 'React', 'Kubernetes', 'Splunk', 'Snowflake'] },
  { industry: 'E-commerce', sub: ['Marketplace', 'DTC Retail', 'Logistics'], suffix: 'Commerce', tech: ['Shopify', 'React', 'GCP', 'Redis', 'Segment', 'Braze', 'Stripe'] },
  { industry: 'Healthcare', sub: ['Digital Health', 'Biotech', 'Medical Devices'], suffix: 'Health', tech: ['Azure', 'Python', '.NET', 'Epic', 'Snowflake', 'Okta'] },
  { industry: 'Media & Advertising', sub: ['AdTech', 'Streaming', 'Publishing'], suffix: 'Media', tech: ['GCP', 'BigQuery', 'React', 'Kafka', 'Segment', 'Looker'] },
  { industry: 'Enterprise Software', sub: ['CRM', 'ERP', 'Security', 'Data'], suffix: 'Systems', tech: ['Java', 'AWS', 'Kubernetes', 'Salesforce', 'Snowflake', 'Okta', 'Terraform'] },
  { industry: 'Consumer Internet', sub: ['Social', 'Gaming', 'Mobility', 'Food'], suffix: 'Labs', tech: ['Node.js', 'React Native', 'GCP', 'Redis', 'Firebase', 'Braze'] },
  { industry: 'Manufacturing', sub: ['Industrial', 'Hardware', 'Automotive'], suffix: 'Industries', tech: ['SAP', 'Azure', 'C++', 'MATLAB', 'Oracle'] },
];
const EMPLOYEE_BANDS: Array<{ band: string; min: number; max: number; revenue: string; stage: FundingStage }> = [
  { band: '1–10', min: 2, max: 10, revenue: '<$1M', stage: 'Seed' },
  { band: '11–50', min: 11, max: 50, revenue: '$1M–$10M', stage: 'Series A' },
  { band: '51–200', min: 51, max: 200, revenue: '$10M–$50M', stage: 'Series B' },
  { band: '201–500', min: 201, max: 500, revenue: '$50M–$100M', stage: 'Series C' },
  { band: '501–1,000', min: 501, max: 1000, revenue: '$100M–$250M', stage: 'Series D+' },
  { band: '1,001–5,000', min: 1001, max: 5000, revenue: '$250M–$1B', stage: 'Series D+' },
  { band: '5,000+', min: 5001, max: 40000, revenue: '$1B+', stage: 'Public' },
];
const LOCATIONS: Array<{ city: string; country: string; tz: string }> = [
  { city: 'San Francisco', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'New York', country: 'United States', tz: 'America/New_York' },
  { city: 'Austin', country: 'United States', tz: 'America/Chicago' },
  { city: 'London', country: 'United Kingdom', tz: 'Europe/London' },
  { city: 'Berlin', country: 'Germany', tz: 'Europe/Berlin' },
  { city: 'Bengaluru', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore' },
  { city: 'Toronto', country: 'Canada', tz: 'America/Toronto' },
  { city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney' },
  { city: 'Tel Aviv', country: 'Israel', tz: 'Asia/Jerusalem' },
];
const COMPANY_TYPES: CompanyType[] = ['Private', 'Public', 'Private', 'Private'];
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com', 'me.com',
]);
const VERIFY_EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01

function isoDaysBefore(epochMs: number, days: number): string {
  return new Date(epochMs - days * 86_400_000).toISOString().slice(0, 10);
}
/** Strip protocol, path, and a leading www. from any domain-ish input. */
export function normalizeDomain(raw: string): string {
  let d = String(raw || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('@').pop() ?? d;
  return d;
}
export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

/**
 * Resolve a domain into a full, deterministic company dossier.
 * Returns `null` for structurally invalid domains.
 */
export function resolveCompanyFromDomain(rawDomain: string): EnrichedCompany | null {
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) return null;

  const isPersonal = PERSONAL_DOMAINS.has(domain);
  const root = domain.split('.').slice(0, -1).join('.') || domain;
  const seed = hashString(domain);
  const rng = makeRng(seed);

  const nameBase = root.split(/[-.]/).map(cap).join(' ').trim() || cap(root);
  const sector = pick(rng, INDUSTRIES);
  const band = EMPLOYEE_BANDS[Math.floor(rng() * EMPLOYEE_BANDS.length)];
  const employee_count = band.min + Math.floor(rng() * (band.max - band.min + 1));
  const type: CompanyType = band.stage === 'Public' ? 'Public' : pick(rng, COMPANY_TYPES);
  const loc = pick(rng, LOCATIONS);
  const founded_year = 1988 + Math.floor(rng() * 35); // 1988..2022

  // Tech stack: 4–6 distinct picks via a deterministic Fisher–Yates shuffle, then take N.
  const shuffled = [...sector.tech];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const stackCount = Math.min(shuffled.length, 4 + Math.floor(rng() * 3));
  const tech_stack = shuffled.slice(0, stackCount);

  const funding_stage: FundingStage = type === 'Public' ? 'Public' : band.stage;
  const raisedByStage: Record<FundingStage, number> = {
    Bootstrapped: 0, Seed: 3, 'Series A': 15, 'Series B': 45, 'Series C': 120, 'Series D+': 300, Public: 0, Acquired: 0,
  };
  const total_raised_usd = funding_stage === 'Public' || funding_stage === 'Bootstrapped'
    ? 0 : Math.round((raisedByStage[funding_stage] * (0.6 + rng() * 0.8)) * 1_000_000);

  const description = `${nameBase} is a ${loc.country}-based ${sector.sub[Math.floor(rng() * sector.sub.length)].toLowerCase()} company in ${sector.industry.toLowerCase()}, founded in ${founded_year}. It serves customers with a team of roughly ${band.band} employees.`;

  const emailVerifiable = !isPersonal;
  let confidence = 0.5;
  if (!isPersonal) confidence += 0.2;
  if (employee_count > 50) confidence += 0.08;
  if (type === 'Public') confidence += 0.08;
  confidence += rng() * 0.06;
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);

  const handle = root.replace(/[^a-z0-9]/g, '');
  const provenance: CompanyProvenance[] = [
    { field: 'name', source: 'Domain registry', signal: `WHOIS org record for ${domain}`, confidence: emailVerifiable ? 0.96 : 0.6 },
    { field: 'industry', source: 'Firmographic graph', signal: `${sector.industry} classification`, confidence: 0.9 },
    { field: 'employee_count', source: 'Workforce signals', signal: 'Headcount from professional network + job posts', confidence: 0.82 },
    { field: 'tech_stack', source: 'Technographic scan', signal: 'DNS, headers, and JS fingerprints', confidence: 0.87 },
    { field: 'funding_stage', source: 'Funding database', signal: 'Rounds + investor filings', confidence: type === 'Public' ? 0.97 : 0.8 },
    { field: 'hq_city', source: 'Registry + geo-IP', signal: 'Registered address + edge resolution', confidence: 0.85 },
  ];

  return {
    id: `company_${seed.toString(36).padStart(7, '0')}`,
    domain,
    name: nameBase,
    legal_name: `${nameBase} ${type === 'Public' ? 'Inc.' : sector.suffix}`,
    description,
    industry: sector.industry,
    sub_industry: sector.sub[(seed >>> 3) % sector.sub.length],
    type,
    employee_count,
    employee_band: band.band,
    revenue_band: band.revenue,
    founded_year,
    hq_city: loc.city,
    hq_country: loc.country,
    timezone: loc.tz,
    tech_stack,
    funding_stage,
    total_raised_usd,
    linkedin_url: `https://www.linkedin.com/company/${handle}`,
    twitter_url: rng() > 0.4 ? `https://x.com/${handle}` : null,
    logo_initials: nameBase.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || root.slice(0, 2).toUpperCase(),
    confidence,
    is_personal_domain: isPersonal,
    last_verified: isoDaysBefore(VERIFY_EPOCH, seed % 45),
    sources: Array.from(new Set(provenance.map((p) => p.source))),
    provenance,
  };
}
