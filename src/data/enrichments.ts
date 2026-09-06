/**
 * Enrichment registry — the catalog-driven backbone of the Enrichment Studio.
 *
 * Every single-input lookup endpoint becomes a *preset* here, not a bespoke page.
 * A preset references a real endpoint from src/data/endpoints.ts (the SSOT) and adds
 * only what the Studio UI needs: the input kind, an icon, a category, and examples.
 * `toEnrichmentResult` normalizes any endpoint response into one generic view-model,
 * so one renderer covers people, companies, and every flat lookup.
 */
import { getEndpointById, type Endpoint } from '@/data/endpoints';
import type { ResolvedPerson } from '@/lib/person-resolver';
import type { EnrichedCompany } from '@/lib/company-resolver';
import { scoreCompleteness, type CompletenessScore } from '@/lib/completeness-scorer';
import { zidForPerson, zidForCompany } from '@/lib/zinbit-id';

export type InputKind = 'email' | 'domain' | 'phone' | 'linkedin' | 'cin' | 'din' | 'ip' | 'title' | 'auto';
export type EnrichmentCategory = 'person' | 'company' | 'identity';

interface PresetConfig {
  id: string;
  endpointId: string;
  /** The endpoint's single required parameter name. */
  param: string;
  inputKind: InputKind;
  icon: string;
  category: EnrichmentCategory;
  examples: string[];
  /** Optional short label override; defaults to the endpoint name. */
  label?: string;
  /** Client-side transform applied to the input before it's sent (e.g. hash it). */
  transform?: 'sha256';
}

export interface EnrichmentPreset {
  id: string;
  endpointId: string;
  endpoint: Endpoint;
  param: string;
  inputKind: InputKind;
  icon: string;
  category: EnrichmentCategory;
  examples: string[];
  label: string;
  description: string;
  path: string;
  creditCost: number;
  placeholder: string;
  /** Client-side transform applied to the input before it's sent (e.g. hash it). */
  transform?: 'sha256';
}

const PRESET_CONFIG: PresetConfig[] = [
  { id: 'person', endpointId: 'people-search', param: 'email', inputKind: 'email', icon: 'UserSearch', category: 'person', examples: ['jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in'], label: 'Resolve a person' },
  { id: 'company', endpointId: 'company-enrich', param: 'domain', inputKind: 'domain', icon: 'Building2', category: 'company', examples: ['stripe.com', 'datadoghq.com', 'shopify.com'], label: 'Enrich a company' },
  { id: 'email-to-phone', endpointId: 'email-to-phone', param: 'email', inputKind: 'email', icon: 'PhoneCall', category: 'person', examples: ['jane.doe@acme.com', 'ceo@stripe.com'], label: 'Email → phone' },
  { id: 'phone-to-email', endpointId: 'phone-to-email', param: 'phone', inputKind: 'phone', icon: 'Mail', category: 'person', examples: ['+1 415 555 0132', '5551234567'], label: 'Phone → email' },
  { id: 'identity', endpointId: 'identity-resolve', param: 'query', inputKind: 'auto', icon: 'Fingerprint', category: 'identity', examples: ['jane@acme.com', 'stripe.com', 'linkedin.com/in/janedoe'], label: 'Auto-detect (identity)' },
  { id: 'domain-to-cin', endpointId: 'domain-to-cin', param: 'domain', inputKind: 'domain', icon: 'Landmark', category: 'company', examples: ['zomato.in', 'infosys.com'], label: 'Domain → CIN' },
  { id: 'cin-to-company', endpointId: 'cin-to-company-data', param: 'cin', inputKind: 'cin', icon: 'Landmark', category: 'company', examples: ['L72900KA2020PLC123456'], label: 'CIN → company data' },
  { id: 'domain-to-linkedin', endpointId: 'domain-to-linkedin', param: 'domain', inputKind: 'domain', icon: 'Globe2', category: 'company', examples: ['stripe.com', 'zomato.com'], label: 'Domain → LinkedIn' },
  { id: 'linkedin-to-profile', endpointId: 'linkedin-to-profile', param: 'linkedin_url', inputKind: 'linkedin', icon: 'UserSearch', category: 'person', examples: ['linkedin.com/in/janedoe'], label: 'LinkedIn → profile' },
  { id: 'linkedin-to-contact', endpointId: 'linkedin-to-contact', param: 'linkedin_url', inputKind: 'linkedin', icon: 'Mail', category: 'person', examples: ['linkedin.com/in/janedoe'], label: 'LinkedIn → contact' },
  { id: 'reverse', endpointId: 'reverse-enrichment', param: 'query', inputKind: 'auto', icon: 'Sparkles', category: 'identity', examples: ['jane@acme.com', 'stripe.com'], label: 'Reverse enrichment' },
  { id: 'reverse-ip', endpointId: 'ip-to-company', param: 'ip', inputKind: 'ip', icon: 'Network', category: 'identity', examples: ['52.38.104.17', '104.18.32.7', '8.8.8.8'], label: 'Reverse IP → company' },
  { id: 'email-to-social', endpointId: 'email-to-social', param: 'email', inputKind: 'email', icon: 'Share2', category: 'person', examples: ['jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in'], label: 'Social profiles' },
  { id: 'title-normalize', endpointId: 'title-normalize', param: 'title', inputKind: 'title', icon: 'Tags', category: 'person', examples: ['VP, Engineering', 'Sr. SWE II', 'Head of Growth'], label: 'Normalize a title' },
  { id: 'firmographics', endpointId: 'firmographic-append', param: 'domain', inputKind: 'domain', icon: 'BarChart3', category: 'company', examples: ['stripe.com', 'zomato.in', 'shopify.com'], label: 'Firmographic append' },
  { id: 'technographics', endpointId: 'technographic-detect', param: 'domain', inputKind: 'domain', icon: 'Cpu', category: 'company', examples: ['stripe.com', 'datadoghq.com', 'shopify.com'], label: 'Technographic detection' },
  { id: 'funding', endpointId: 'funding-signals', param: 'domain', inputKind: 'domain', icon: 'Banknote', category: 'company', examples: ['stripe.com', 'datadoghq.com', 'zomato.in'], label: 'Funding signals' },
  { id: 'offices', endpointId: 'company-offices', param: 'domain', inputKind: 'domain', icon: 'MapPin', category: 'company', examples: ['stripe.com', 'datadoghq.com', 'shopify.com'], label: 'HQ & office geo' },
  { id: 'news', endpointId: 'company-news', param: 'domain', inputKind: 'domain', icon: 'Newspaper', category: 'company', examples: ['stripe.com', 'datadoghq.com', 'zomato.in'], label: 'Company news' },
  { id: 'hashed-email', endpointId: 'hashed-email', param: 'email_sha256', inputKind: 'email', icon: 'Hash', category: 'identity', examples: ['jane.doe@acme.com', 'marcus@stripe.com', 'sarah.chen@notion.so'], label: 'Hashed-email lookup', transform: 'sha256' },
  { id: 'fuzzy', endpointId: 'fuzzy-match', param: 'query', inputKind: 'auto', icon: 'GitCompareArrows', category: 'identity', examples: ['Jhon Smith, Stipe', 'Bob Johnson, Datadog', 'Micheal Chen, notion'], label: 'Fuzzy match' },
  { id: 'dedupe', endpointId: 'records-dedupe', param: 'records', inputKind: 'auto', icon: 'Layers', category: 'identity', examples: ['John Smith, Stripe; Jhon Smith, Stipe; Jane Doe, Acme', 'Bob Johnson, Datadog; Robert Johnson, datadoghq.com; Bob Johnson, Datadog Inc'], label: 'De-duplicate records' },
  { id: 'zid', endpointId: 'identity-zid', param: 'query', inputKind: 'auto', icon: 'Fingerprint', category: 'identity', examples: ['jane.doe@acme.com', 'marcus@stripe.com', 'stripe.com'], label: 'Persistent Zinbit ID' },
  { id: 'canonicalize', endpointId: 'name-canonicalize', param: 'name', inputKind: 'auto', icon: 'SpellCheck', category: 'person', examples: ['SMITH, Bob', "mary jane o'brien", 'Dr. josé garcía jr.'], label: 'Canonicalize name' },
  { id: 'email-verify', endpointId: 'email-verify', param: 'email', inputKind: 'email', icon: 'MailCheck', category: 'person', examples: ['john@datadoghq.com', 'contact@figma.com', 'user@mailinator.com'], label: 'Verify deliverability' },
  { id: 'email-domain-auth', endpointId: 'email-domain-auth', param: 'domain', inputKind: 'domain', icon: 'ShieldCheck', category: 'company', examples: ['stripe.com', 'zomato.in', 'shopify.com'], label: 'Domain auth (SPF/DKIM/DMARC)' },
  { id: 'record-validate', endpointId: 'record-validate', param: 'email', inputKind: 'email', icon: 'BadgeCheck', category: 'person', examples: ['jane.doe@acme.com', 'ceo@stripe.com', 'info@acme.com'], label: 'Validate a record' },
  { id: 'email-disposable', endpointId: 'email-disposable', param: 'email', inputKind: 'email', icon: 'Trash2', category: 'person', examples: ['user@mailinator.com', 'signup@sneaky-tempmail.io', 'jane.doe@acme.com'], label: 'Detect disposable' },
];

/** Build the full preset list, merging each config with its endpoint from the catalog. */
export function getEnrichmentPresets(): EnrichmentPreset[] {
  const presets: EnrichmentPreset[] = [];
  for (const c of PRESET_CONFIG) {
    const endpoint = getEndpointById(c.endpointId);
    if (!endpoint) continue; // endpoint retired — preset silently drops
    const paramDef = endpoint.parameters.find((p) => p.name === c.param);
    presets.push({
      ...c,
      endpoint,
      label: c.label ?? endpoint.name,
      description: endpoint.description,
      path: endpoint.path,
      creditCost: endpoint.creditCost,
      // A transform preset takes a friendly input (e.g. an email) that's hashed
      // before it's sent, so its placeholder tracks the input, not the wire param.
      placeholder: c.transform ? (c.examples[0] ?? 'Enter a value') : (paramDef?.placeholder ?? paramDef?.example ?? 'Enter a value'),
    });
  }
  return presets;
}

export function getPresetById(id: string): EnrichmentPreset | undefined {
  return getEnrichmentPresets().find((p) => p.id === id);
}

// ── Input detection + validation ─────────────────────────────────────────────
const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  linkedin: /linkedin\.com\//i,
  phone: /^\+?[\d\s().-]{7,}$/,
  cin: /^[LUu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6}$/,
  domain: /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i,
  ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/,
  ipv6: /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/,
};

export function detectInputKind(raw: string): InputKind {
  const v = String(raw || '').trim();
  if (!v) return 'auto';
  if (RE.email.test(v)) return 'email';
  if (RE.linkedin.test(v)) return 'linkedin';
  if (RE.cin.test(v)) return 'cin';
  if (RE.ipv4.test(v) || RE.ipv6.test(v)) return 'ip';
  if (RE.phone.test(v) && /\d{7,}/.test(v.replace(/\D/g, ''))) return 'phone';
  if (RE.domain.test(v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])) return 'domain';
  return 'auto';
}

export function validateInput(kind: InputKind, raw: string): boolean {
  const v = String(raw || '').trim();
  if (!v) return false;
  switch (kind) {
    case 'email': return RE.email.test(v);
    case 'linkedin': return RE.linkedin.test(v);
    case 'phone': return RE.phone.test(v) && v.replace(/\D/g, '').length >= 7;
    case 'cin': return v.length >= 8;
    case 'domain': return RE.domain.test(v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);
    case 'ip': return RE.ipv4.test(v) || RE.ipv6.test(v);
    case 'title': return v.length >= 2;
    case 'din': return v.length >= 4;
    case 'auto': return v.length >= 2;
    default: return v.length > 0;
  }
}

// ── Generic result view-model ────────────────────────────────────────────────
export type FieldFreshness = 'fresh' | 'aging' | 'stale';
export interface EnrichmentField { label: string; value: string; verified?: boolean; masked?: boolean; mono?: boolean; verifiedAt?: string; freshness?: FieldFreshness; }
export interface EnrichmentProvenance { field: string; source: string; signal: string; confidence: number; }
/** One discovered social account, structured for the rich per-platform card grid. */
export interface SocialProfileView {
  platform: string;
  handle: string;
  url: string;
  verified: boolean;
  confidence: number;
  /** The strongest account — drives ordering and a subtle highlight. */
  primary: boolean;
  /** Follower / reputation signal where the platform has one. */
  metric?: { label: string; value: string };
  headline?: string;
}
/** Badge tone, mirrored from components/ui StatusBadge (kept local — this is a data module). */
export type ResultTone = 'success' | 'warning' | 'error' | 'info' | 'teal' | 'neutral';
/** One deliverability check result, for the signal breakdown list. */
export interface DeliverabilityCheckView {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  detail: string;
}
/** Structured email-deliverability result — rendered as a scored panel + checklist. */
export interface DeliverabilityView {
  verdict: 'deliverable' | 'risky' | 'undeliverable' | 'unknown';
  score: number;
  provider: string;
  domain: string;
  didYouMean: string | null;
  flags: { label: string; tone: ResultTone }[];
  checks: DeliverabilityCheckView[];
}
/** Structured disposable-detection result — rendered as a tone-coded verdict panel. */
export interface DisposableView {
  verdict: 'disposable' | 'suspected' | 'trusted';
  category: string;
  confidence: number;
  reason: string;
  matchedOn: string;
  domain: string;
  tone: ResultTone;
}
/** One detected technology, for the category-grouped technographic grid. */
export interface TechDetectionView {
  name: string;
  category: string;
  vendor: string;
  method: string;
  confidence: number;
  premium: boolean;
  firstDetected: string;
  lastDetected: string;
}
/** One category rollup of the detected stack. */
export interface TechCategoryView {
  category: string;
  count: number;
  items: TechDetectionView[];
}
/** One derived GTM signal from the stack mix. */
export interface TechSignalView {
  label: string;
  detail: string;
  tone: ResultTone;
}
/** Structured technographic profile — rendered as a category-grouped stack + signals. */
export interface TechnographicView {
  total: number;
  sophistication: number;
  spendBand: string;
  categories: TechCategoryView[];
  signals: TechSignalView[];
}
/** One funding round, for the timeline (F-009). */
export interface FundingRoundView {
  stage: string;
  date: string;
  amount: string;
  lead: string;
  valuation: string | null;
  investors: string[];
}
/** Structured funding profile — rendered as a round timeline + investor roster. */
export interface FundingView {
  hasFunding: boolean;
  noFundingReason: string | null;
  stage: string;
  totalRaised: string;
  latestValuation: string | null;
  rounds: FundingRoundView[];
  investors: string[];
}
/** One office location, for the geo footprint map/list. */
export interface OfficeLocationView {
  type: string;
  label: string;
  address: string;
  city: string;
  country: string;
  countryCode: string;
  continent: string;
  timezone: string;
  utcOffsetMinutes: number;
  lat: number;
  lng: number;
  headcount: number;
  isHq: boolean;
}
/** Structured HQ & office geography (F-013) — rendered as a geo footprint. */
export interface OfficeGeographyView {
  hq: OfficeLocationView;
  offices: OfficeLocationView[];
  officeCount: number;
  countryCount: number;
  continentCount: number;
  followTheSun: boolean;
  outreachWindowUtc: string;
}
/** One company event, for the news feed timeline (F-015). */
export interface CompanyEventView {
  id: string;
  type: string;
  date: string;
  headline: string;
  summary: string;
  source: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  importance: number;
}
/** Structured company news feed — rendered as an event timeline with type filters. */
export interface NewsFeedView {
  events: CompanyEventView[];
  eventCount: number;
  byType: { type: string; count: number }[];
}
/** One ranked fuzzy-match candidate (F-024). */
export interface FuzzyCandidateView {
  fullName: string;
  title: string;
  company: string;
  email: string;
  nameSimilarity: number;
  companySimilarity: number;
  matchProbability: number;
  best: boolean;
}
/** Structured probabilistic fuzzy-match result — rendered as a ranked candidate list. */
export interface FuzzyMatchView {
  verdict: 'strong' | 'likely' | 'weak' | 'no_match';
  interpreted: { name: string; company: string };
  candidates: FuzzyCandidateView[];
}
/** Structured name-canonicalization result (F-030) — parsed forms + change log. */
export interface NameCanonicalView {
  canonical: string;
  ascii: string;
  formal: string;
  components: { prefix: string | null; first: string; middle: string | null; last: string; suffix: string | null };
  changes: string[];
  nicknameExpanded: boolean;
  hadDiacritics: boolean;
  reordered: boolean;
}
/** One member of a de-duplication cluster. */
export interface DedupMemberView {
  name: string;
  company: string;
  isGolden: boolean;
  similarity: number;
}
/** One de-duplication cluster: a golden record + its merged members. */
export interface DedupClusterView {
  golden: { name: string; company: string };
  size: number;
  confidence: number;
  members: DedupMemberView[];
}
/** Structured entity de-duplication result (F-026) — rendered as clustered golden records. */
export interface DedupView {
  inputCount: number;
  uniqueCount: number;
  duplicateCount: number;
  dedupRate: number;
  clusters: DedupClusterView[];
}
export interface EnrichmentResult {
  kind: 'person' | 'company' | 'generic';
  title: string;
  subtitle?: string;
  avatar: string;
  badges: string[];
  fields: EnrichmentField[];
  chips?: { label: string; items: string[] };
  /** Structured cross-platform footprint — rendered as a rich card grid when present. */
  social?: { profiles: SocialProfileView[] };
  /** Structured email-deliverability breakdown — rendered as a scored panel when present. */
  deliverability?: DeliverabilityView;
  /** Structured disposable-detection verdict (F-051) — rendered as a tone-coded panel. */
  disposable?: DisposableView;
  /** Structured technographic profile (F-006) — rendered as a category-grouped stack. */
  technographic?: TechnographicView;
  /** Structured funding profile (F-009) — rendered as a round timeline + investor roster. */
  funding?: FundingView;
  /** Structured HQ & office geography (F-013) — rendered as a geo footprint. */
  officeGeo?: OfficeGeographyView;
  /** Structured company news feed (F-015) — rendered as an event timeline. */
  news?: NewsFeedView;
  /** Structured fuzzy-match result (F-024) — rendered as a ranked candidate list. */
  fuzzy?: FuzzyMatchView;
  /** Structured name-canonicalization result (F-030) — rendered as parsed forms + a change log. */
  nameCanonical?: NameCanonicalView;
  /** Structured entity de-duplication result (F-026) — rendered as clustered golden records. */
  dedupe?: DedupView;
  /** How filled-out the returned record is (F-048) — present only for field-bearing records. */
  completeness?: CompletenessScore;
  confidence?: number;
  provenance?: EnrichmentProvenance[];
  lastVerified?: string;
  links?: { label: string; href: string }[];
  raw: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const initialsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || s.slice(0, 2).toUpperCase();
const titleCase = (s: string) => s.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function personToResult(p: ResolvedPerson): EnrichmentResult {
  return {
    kind: 'person', title: p.full_name, subtitle: `${p.title} · ${p.department}`, avatar: initialsOf(p.full_name),
    badges: [p.seniority, p.is_personal_email ? 'Personal email' : p.company].filter(Boolean),
    fields: [
      { label: 'Email', value: p.email, verified: p.email_verified, masked: true, mono: true },
      { label: 'Phone', value: p.phone, verified: p.phone_verified, masked: true, mono: true },
      { label: 'Company', value: `${p.company} · ${p.company_domain}` },
      { label: 'Location', value: `${p.location} · ${p.timezone}` },
      { label: 'Zinbit ID', value: zidForPerson(p), mono: true },
    ],
    confidence: p.confidence, provenance: p.provenance, lastVerified: p.last_verified,
    links: [{ label: 'LinkedIn', href: p.linkedin_url }, ...(p.github_url ? [{ label: 'GitHub', href: p.github_url }] : []), ...(p.twitter_url ? [{ label: 'X', href: p.twitter_url }] : [])],
    raw: p,
  };
}

/** Hashed-email (SHA-256) match: decorate the resolved person with the privacy provenance. */
function hashedEmailToResult(d: Record<string, unknown>): EnrichmentResult {
  const base = personToResult(d.person as unknown as ResolvedPerson);
  const hash = typeof d.email_sha256 === 'string' ? d.email_sha256 : '';
  const shortHash = hash ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : '—';
  return {
    ...base,
    badges: ['SHA-256 match', ...base.badges],
    fields: [
      { label: 'Matched via', value: 'SHA-256 hashed identifier', verified: true },
      { label: 'Hash', value: shortHash, mono: true },
      { label: 'Plaintext sent', value: 'Never — resolved from the hash alone' },
      ...base.fields,
    ],
    raw: d,
  };
}

function companyToResult(c: EnrichedCompany): EnrichmentResult {
  const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : n > 0 ? `$${n.toLocaleString()}` : '—');
  return {
    kind: 'company', title: c.name, subtitle: `${c.legal_name} · ${c.domain}`, avatar: c.logo_initials,
    badges: [c.type, c.is_personal_domain ? 'Personal domain' : c.industry].filter(Boolean),
    fields: [
      { label: 'Headcount', value: `${c.employee_count.toLocaleString()} · ${c.employee_band}` },
      { label: 'Revenue band', value: c.revenue_band },
      { label: 'Founded', value: String(c.founded_year) },
      { label: 'Headquarters', value: `${c.hq_city}, ${c.hq_country}` },
      { label: 'Industry', value: `${c.industry} · ${c.sub_industry}` },
      { label: 'Funding', value: `${c.funding_stage}${c.total_raised_usd ? ` · ${money(c.total_raised_usd)} raised` : ''}` },
      { label: 'Zinbit ID', value: zidForCompany(c), mono: true },
    ],
    chips: { label: 'Tech stack', items: c.tech_stack },
    confidence: c.confidence, provenance: c.provenance, lastVerified: c.last_verified,
    links: [{ label: 'LinkedIn', href: c.linkedin_url }, ...(c.twitter_url ? [{ label: 'X', href: c.twitter_url }] : [])],
    raw: c,
  };
}

/** Persistent Zinbit ID (F-028): the stable canonical entity ID + its unifying aliases. */
function zidToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const zid = str('zinbit_id');
  const type = str('entity_type') === 'company' ? 'company' : 'person';
  const canonical = str('canonical') || zid || 'Entity';

  const rawAliases = Array.isArray(d.aliases) ? (d.aliases as Record<string, unknown>[]) : [];
  const aliases = rawAliases
    .map((a) => ({ type: typeof a.type === 'string' ? a.type : '', value: typeof a.value === 'string' ? a.value : '' }))
    .filter((a) => a.value);

  const fields: EnrichmentField[] = [
    { label: 'Zinbit ID', value: zid || '—', mono: true, verified: true },
    { label: 'Entity type', value: type },
    { label: 'Derived from', value: str('derived_from') || '—' },
    { label: 'First seen', value: str('first_seen') || '—' },
  ];

  return {
    kind: type === 'company' ? 'company' : 'person',
    title: canonical,
    subtitle: str('display') || `Persistent ID · ${type}`,
    avatar: initialsOf(canonical),
    badges: [type, 'Persistent ID'],
    fields,
    chips: aliases.length ? { label: `Unifies ${aliases.length} identifier${aliases.length === 1 ? '' : 's'}`, items: aliases.map((a) => `${a.type}: ${a.value}`) } : undefined,
    confidence: num('confidence'),
    raw: d,
  };
}

/** Flatten any primitive-valued response into fields — the fallback renderer. */
function genericToResult(data: Record<string, unknown>): EnrichmentResult {
  const fields: EnrichmentField[] = [];
  let confidence: number | undefined;
  let title = '';
  for (const [k, v] of Object.entries(data)) {
    if (k === 'success') continue;
    if (k === 'confidence' && typeof v === 'number') { confidence = v; continue; }
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue; // skip nested; rich adapters handle those
    const value = String(v);
    if (!title && /name|company|email|domain/i.test(k)) title = value;
    fields.push({ label: titleCase(k), value, mono: /email|phone|url|cin|din|id|domain/i.test(k) });
  }
  if (!title) title = fields[0]?.value ?? 'Result';
  return { kind: 'generic', title, avatar: initialsOf(title), badges: [], fields, confidence, raw: data };
}

/** Phone append & verification: line type, live status, carrier, DNC, reachability. */
function phoneToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const bool = (k: string) => d[k] === true;
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);

  const phone = str('phone') || str('phone_national');
  const lineLabel = titleCase(str('line_type'));
  const statusLabel = titleCase(str('verification_status'));
  const reach = num('reachability');

  const badges = [
    statusLabel,
    lineLabel,
    bool('dnc_safe') ? 'DNC-safe' : 'On DNC',
  ].filter(Boolean);

  const fields: EnrichmentField[] = [
    { label: 'Phone', value: phone, verified: bool('verified'), masked: true, mono: true },
    { label: 'Line type', value: lineLabel || '—' },
    { label: 'Carrier', value: str('carrier') || '—' },
    { label: 'Region', value: [str('region'), str('country')].filter(Boolean).join(' · ') || '—' },
    { label: 'Reachability', value: reach !== undefined ? `${Math.round(reach * 100)}%` : '—' },
    { label: 'Do-Not-Call', value: bool('dnc') ? 'On registry — do not auto-dial' : 'Clear to dial' },
  ];

  const provenance = Array.isArray(d.provenance)
    ? (d.provenance as EnrichmentProvenance[])
    : undefined;

  return {
    kind: 'person',
    title: phone || 'Phone',
    subtitle: [str('carrier'), lineLabel].filter(Boolean).join(' · ') || undefined,
    avatar: 'PH',
    badges,
    fields,
    confidence: num('confidence'),
    provenance,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Normalize any endpoint response body's `data` into one view-model. */
/** Reverse IP → company intelligence: the company behind an IP plus network context. */
function ipToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const isCorporate = d.is_corporate === true;
  const company = isRecord(d.company) ? (d.company as unknown as EnrichedCompany) : null;
  const ipType = str('ip_type');
  const typeLabel = titleCase(ipType);
  const title = isCorporate && company ? company.name : (str('organization') || str('ip'));
  const badges = [typeLabel, isCorporate ? 'Corporate visitor' : 'Not a company'].filter(Boolean);
  const fields: EnrichmentField[] = [
    { label: 'IP', value: str('ip'), mono: true },
    { label: 'Type', value: typeLabel || '—' },
    { label: 'Organization', value: str('organization') || '—' },
    { label: 'ISP', value: str('isp') || '—' },
    { label: 'ASN', value: str('asn') || '—', mono: true },
    { label: 'Hostname', value: str('hostname') || '—', mono: true },
    { label: 'Location', value: [str('city'), str('country')].filter(Boolean).join(', ') || '—' },
  ];
  if (isCorporate && company) {
    fields.push({ label: 'Company', value: `${company.industry} · ${company.employee_band} employees` });
  }
  const provenance = Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined;
  return {
    kind: isCorporate ? 'company' : 'generic',
    title, subtitle: isCorporate && company ? `${company.domain} · ${company.industry}` : `${typeLabel} network`,
    avatar: isCorporate && company ? company.logo_initials : initialsOf(title),
    badges, fields,
    confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
    provenance,
    lastVerified: str('last_verified') || undefined,
    links: isCorporate && company ? [{ label: 'LinkedIn', href: company.linkedin_url }] : undefined,
    raw: d,
  };
}

/** Social profile discovery: a person's cross-platform professional footprint. */
function socialToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const profiles = Array.isArray(d.profiles) ? (d.profiles as Record<string, unknown>[]) : [];
  const name = str('full_name') || 'Social profiles';

  const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

  // Reputation-style platforms label their count differently from follower graphs.
  const metricLabel = (platform: string) => (platform === 'Stack Overflow' ? 'reputation' : 'followers');

  const views: SocialProfileView[] = profiles.map((p) => {
    const platform = typeof p.platform === 'string' ? p.platform : 'Profile';
    const followers = typeof p.followers === 'number' ? p.followers : undefined;
    const headline = typeof p.headline === 'string' ? p.headline : undefined;
    return {
      platform,
      handle: typeof p.handle === 'string' ? p.handle : '',
      url: typeof p.url === 'string' ? p.url : '',
      verified: p.verified === true,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      primary: p.primary === true,
      metric: followers !== undefined ? { label: metricLabel(platform), value: fmtCount(followers) } : undefined,
      // "Reputation" duplicates the metric label — surface only real headlines.
      headline: headline && headline !== 'Reputation' ? headline : undefined,
    };
  });
  // Strongest account first, then by confidence — deterministic ordering.
  views.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || b.confidence - a.confidence);

  const verifiedCount = views.filter((v) => v.verified).length;

  return {
    kind: 'person',
    title: name,
    subtitle: `${views.length} social profile${views.length === 1 ? '' : 's'} discovered across the professional web`,
    avatar: initialsOf(name),
    badges: [
      `${views.length} platform${views.length === 1 ? '' : 's'}`,
      verifiedCount > 0 ? `${verifiedCount} verified` : '',
    ].filter(Boolean),
    fields: [],
    social: { profiles: views },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Job title normalization: canonical title + seniority / function / management level. */
function titleToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const canonical = str('canonical_title') || 'Title';
  const input = str('input');
  const seniority = str('seniority');
  const fn = str('function');
  const decision = d.is_decision_maker === true;

  const badges = [seniority, fn, decision ? 'Decision-maker' : ''].filter(Boolean);
  const fields: EnrichmentField[] = [
    { label: 'Seniority', value: seniority || '—' },
    { label: 'Function', value: fn || '—' },
    { label: 'Department', value: str('department') || '—' },
    { label: 'Management level', value: str('management_level') || '—' },
    { label: 'Decision-maker', value: decision ? 'Yes' : 'No' },
    { label: 'Normalized from', value: input || '—', mono: true },
  ];

  return {
    kind: 'person',
    title: canonical,
    subtitle: input ? `Normalized from "${input}"` : undefined,
    avatar: initialsOf(canonical),
    badges,
    fields,
    confidence: num('confidence'),
    provenance: Array.isArray(d.matched_signals) ? (d.matched_signals as EnrichmentProvenance[]) : undefined,
    raw: d,
  };
}

/** Firmographic append: standardized classification codes for a company. */
function firmographicToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const company = str('company') || str('domain') || 'Company';
  const emp = num('employee_count');
  const founded = num('founded_year');

  const fields: EnrichmentField[] = [
    { label: 'NAICS', value: [str('naics_code'), str('naics_title')].filter(Boolean).join(' · ') || '—', mono: true },
    { label: 'SIC', value: [str('sic_code'), str('sic_title')].filter(Boolean).join(' · ') || '—', mono: true },
    { label: 'Industry', value: [str('industry'), str('sub_industry')].filter(Boolean).join(' · ') || '—' },
    { label: 'Employees', value: emp !== undefined ? `${emp.toLocaleString()} · ${str('employee_band')}` : (str('employee_band') || '—') },
    { label: 'Revenue band', value: str('revenue_band') || '—' },
    { label: 'Ownership', value: [str('ownership'), str('entity_type')].filter(Boolean).join(' · ') || '—' },
    { label: 'Founded', value: founded !== undefined ? String(founded) : '—' },
    { label: 'HQ country', value: str('hq_country') || '—' },
  ];

  return {
    kind: 'company',
    title: company,
    subtitle: str('domain') || undefined,
    avatar: initialsOf(company),
    badges: [str('ownership'), str('industry')].filter(Boolean),
    fields,
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Technographic detection: a company's categorized tech stack + derived GTM signals. */
function technographicToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const company = str('company') || str('domain') || 'Company';

  const rawDetections = Array.isArray(d.detections) ? (d.detections as Record<string, unknown>[]) : [];
  const detections: TechDetectionView[] = rawDetections.map((t) => ({
    name: typeof t.name === 'string' ? t.name : '',
    category: typeof t.category === 'string' ? t.category : 'Other',
    vendor: typeof t.vendor === 'string' ? t.vendor : '',
    method: typeof t.method === 'string' ? t.method : '',
    confidence: typeof t.confidence === 'number' ? t.confidence : 0,
    premium: t.premium === true,
    firstDetected: typeof t.first_detected === 'string' ? t.first_detected : '',
    lastDetected: typeof t.last_detected === 'string' ? t.last_detected : '',
  }));

  const rawCategories = Array.isArray(d.categories) ? (d.categories as Record<string, unknown>[]) : [];
  const categories: TechCategoryView[] = rawCategories.map((c) => {
    const category = typeof c.category === 'string' ? c.category : 'Other';
    return { category, count: typeof c.count === 'number' ? c.count : 0, items: detections.filter((x) => x.category === category) };
  });

  const signalToneByKind: Record<string, ResultTone> = {
    modernization: 'teal', adoption: 'info', gtm: 'success', security: 'success', gap: 'warning',
  };
  const rawSignals = Array.isArray(d.signals) ? (d.signals as Record<string, unknown>[]) : [];
  const signals: TechSignalView[] = rawSignals.map((s) => ({
    label: typeof s.label === 'string' ? s.label : '',
    detail: typeof s.detail === 'string' ? s.detail : '',
    tone: signalToneByKind[typeof s.kind === 'string' ? s.kind : ''] ?? 'neutral',
  }));

  const total = num('total') ?? detections.length;
  const sophistication = num('sophistication') ?? 0;
  const spendBand = str('estimated_stack_spend') || '—';

  const fields: EnrichmentField[] = [
    { label: 'Technologies', value: String(total) },
    { label: 'Categories', value: String(categories.length) },
    { label: 'Sophistication', value: `${sophistication}/100` },
    { label: 'Est. stack spend', value: spendBand },
    { label: 'Industry', value: str('industry') || '—' },
    { label: 'GTM signals', value: String(signals.length) },
  ];

  return {
    kind: 'company',
    title: company,
    subtitle: str('domain') || undefined,
    avatar: initialsOf(company),
    badges: [str('industry'), `${total} technologies`].filter(Boolean),
    fields,
    technographic: { total, sophistication, spendBand, categories, signals },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Funding & investment signals (F-009): a round timeline + investors + valuation. */
function fundingToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const company = str('company') || str('domain') || 'Company';
  const money = (n: number | null | undefined) =>
    n == null || n <= 0 ? null : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${n.toLocaleString()}`;

  const hasFunding = d.has_funding === true;
  const rawRounds = Array.isArray(d.rounds) ? (d.rounds as Record<string, unknown>[]) : [];
  const rounds: FundingRoundView[] = rawRounds.map((r) => ({
    stage: typeof r.stage === 'string' ? r.stage : '',
    date: typeof r.date === 'string' ? r.date : '',
    amount: money(typeof r.amount_usd === 'number' ? r.amount_usd : 0) ?? '—',
    lead: typeof r.lead_investor === 'string' ? r.lead_investor : '',
    valuation: money(typeof r.valuation_usd === 'number' ? r.valuation_usd : null),
    investors: Array.isArray(r.investors) ? (r.investors as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  }));
  const investors = Array.isArray(d.investors) ? (d.investors as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const totalRaised = money(num('total_raised_usd')) ?? '$0';
  const latestValuation = money(num('latest_valuation_usd'));
  const stage = str('funding_stage') || '—';

  return {
    kind: 'company',
    title: company,
    subtitle: str('domain') || undefined,
    avatar: initialsOf(company),
    badges: hasFunding ? [stage, `${rounds.length} round${rounds.length === 1 ? '' : 's'}`] : [stage, 'No VC funding'],
    fields: [],
    funding: {
      hasFunding,
      noFundingReason: str('no_funding_reason') || null,
      stage,
      totalRaised,
      latestValuation,
      rounds,
      investors,
    },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** HQ & office geo-resolution (F-013): a geocoded HQ + office footprint. */
function officeGeoToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const company = str('company') || str('domain') || 'Company';

  const toOffice = (o: Record<string, unknown>): OfficeLocationView => {
    const geo = isRecord(o.geo) ? (o.geo as Record<string, unknown>) : {};
    const s = (k: string, src: Record<string, unknown> = o) => (typeof src[k] === 'string' ? (src[k] as string) : '');
    const n = (k: string, src: Record<string, unknown> = o) => (typeof src[k] === 'number' ? (src[k] as number) : 0);
    const parts = [s('street'), s('city'), s('region'), s('postal_code'), s('country')].filter(Boolean);
    return {
      type: s('type'),
      label: s('label'),
      address: parts.join(', '),
      city: s('city'),
      country: s('country'),
      countryCode: s('country_code'),
      continent: s('continent'),
      timezone: s('timezone'),
      utcOffsetMinutes: n('utc_offset_minutes'),
      lat: n('lat', geo),
      lng: n('lng', geo),
      headcount: n('headcount'),
      isHq: o.is_hq === true,
    };
  };

  const rawOffices = Array.isArray(d.offices) ? (d.offices as Record<string, unknown>[]) : [];
  const offices = rawOffices.map(toOffice);
  const hq = isRecord(d.hq) ? toOffice(d.hq as Record<string, unknown>) : (offices[0] ?? null);
  const officeCount = num('office_count') ?? offices.length;
  const countryCount = num('country_count') ?? 0;
  const continentCount = num('continent_count') ?? 0;
  const followTheSun = d.follow_the_sun === true;
  const outreachWindowUtc = str('outreach_window_utc') || '—';

  const fields: EnrichmentField[] = hq
    ? [
        { label: 'HQ', value: `${hq.city}, ${hq.country}` },
        { label: 'HQ address', value: hq.address || '—' },
        { label: 'Coordinates', value: `${hq.lat.toFixed(4)}, ${hq.lng.toFixed(4)}`, mono: true },
        { label: 'HQ timezone', value: hq.timezone || '—', mono: true },
        { label: 'Offices', value: `${officeCount} · ${countryCount} countr${countryCount === 1 ? 'y' : 'ies'}` },
        { label: 'Best window', value: outreachWindowUtc },
      ]
    : [];

  return {
    kind: 'company',
    title: company,
    subtitle: str('domain') || undefined,
    avatar: initialsOf(company),
    badges: [`${officeCount} office${officeCount === 1 ? '' : 's'}`, followTheSun ? 'Follow-the-sun' : `${countryCount} countr${countryCount === 1 ? 'y' : 'ies'}`].filter(Boolean),
    fields,
    officeGeo: hq
      ? { hq, offices, officeCount, countryCount, continentCount, followTheSun, outreachWindowUtc }
      : undefined,
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Company news & event feed (F-015): a chronological trigger-event timeline. */
function newsToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const company = str('company') || str('domain') || 'Company';

  const rawEvents = Array.isArray(d.events) ? (d.events as Record<string, unknown>[]) : [];
  const events: CompanyEventView[] = rawEvents.map((e) => {
    const sentiment = typeof e.sentiment === 'string' ? e.sentiment : 'neutral';
    return {
      id: typeof e.id === 'string' ? e.id : '',
      type: typeof e.type === 'string' ? e.type : 'event',
      date: typeof e.date === 'string' ? e.date : '',
      headline: typeof e.headline === 'string' ? e.headline : '',
      summary: typeof e.summary === 'string' ? e.summary : '',
      source: typeof e.source === 'string' ? e.source : '',
      sentiment: (['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : 'neutral') as CompanyEventView['sentiment'],
      importance: typeof e.importance === 'number' ? e.importance : 0,
    };
  });
  const byTypeRaw = isRecord(d.by_type) ? (d.by_type as Record<string, unknown>) : {};
  const byType = Object.entries(byTypeRaw)
    .map(([type, count]) => ({ type, count: typeof count === 'number' ? count : 0 }))
    .sort((a, b) => b.count - a.count);
  const eventCount = num('event_count') ?? events.length;

  const latest = events[0];
  return {
    kind: 'company',
    title: company,
    subtitle: latest ? `Latest: ${latest.headline}` : str('domain') || undefined,
    avatar: initialsOf(company),
    badges: [`${eventCount} event${eventCount === 1 ? '' : 's'}`, ...(latest ? [latest.type] : [])],
    fields: [],
    news: { events, eventCount, byType },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Probabilistic fuzzy matching (F-024): ranked candidates for a messy name + company. */
function fuzzyToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const verdictRaw = str('verdict');
  const verdict = (['strong', 'likely', 'weak', 'no_match'].includes(verdictRaw) ? verdictRaw : 'no_match') as FuzzyMatchView['verdict'];
  const interp = isRecord(d.interpreted) ? (d.interpreted as Record<string, unknown>) : {};
  const interpreted = {
    name: typeof interp.name === 'string' ? interp.name : '',
    company: typeof interp.company === 'string' ? interp.company : '',
  };
  const bestEmail = isRecord(d.best_match) ? (d.best_match as Record<string, unknown>).email : undefined;

  const rawCandidates = Array.isArray(d.candidates) ? (d.candidates as Record<string, unknown>[]) : [];
  const candidates: FuzzyCandidateView[] = rawCandidates.map((c) => ({
    fullName: typeof c.full_name === 'string' ? c.full_name : '',
    title: typeof c.title === 'string' ? c.title : '',
    company: typeof c.company === 'string' ? c.company : '',
    email: typeof c.email === 'string' ? c.email : '',
    nameSimilarity: typeof c.name_similarity === 'number' ? c.name_similarity : 0,
    companySimilarity: typeof c.company_similarity === 'number' ? c.company_similarity : 0,
    matchProbability: typeof c.match_probability === 'number' ? c.match_probability : 0,
    best: typeof c.email === 'string' && c.email === bestEmail,
  }));

  const verdictLabel = verdict === 'no_match' ? 'No match' : verdict.charAt(0).toUpperCase() + verdict.slice(1);
  const query = isRecord(d.query) ? (d.query as Record<string, unknown>) : {};
  const queryName = typeof query.name === 'string' ? query.name : interpreted.name;

  return {
    kind: 'person',
    title: interpreted.name || queryName || 'Fuzzy match',
    subtitle: `Interpreted "${queryName}" → ${interpreted.name}${interpreted.company ? ` · ${interpreted.company}` : ''}`,
    avatar: initialsOf(interpreted.name || queryName || 'FM'),
    badges: [verdictLabel, `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`],
    fields: [],
    fuzzy: { verdict, interpreted, candidates },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    raw: d,
  };
}

/** Name canonicalization (F-030): parsed forms + a change log for a messy name. */
function nameCanonicalToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const canonical = str('canonical') || 'Name';
  const comp = isRecord(d.components) ? (d.components as Record<string, unknown>) : {};
  const cstr = (k: string) => (typeof comp[k] === 'string' ? (comp[k] as string) : null);
  const components = {
    prefix: cstr('prefix'), first: cstr('first') ?? '', middle: cstr('middle'),
    last: cstr('last') ?? '', suffix: cstr('suffix'),
  };
  const changes = Array.isArray(d.changes) ? (d.changes as unknown[]).filter((x): x is string => typeof x === 'string') : [];

  return {
    kind: 'person',
    title: canonical,
    subtitle: str('input') && str('input') !== canonical ? `Canonicalized from "${str('input')}"` : undefined,
    avatar: initialsOf(canonical),
    badges: [d.reordered === true ? 'Reordered' : '', d.nickname_expanded === true ? 'Nickname' : '', d.had_diacritics === true ? 'Accents' : ''].filter(Boolean),
    fields: [],
    nameCanonical: {
      canonical,
      ascii: str('ascii') || canonical,
      formal: str('formal') || canonical,
      components,
      changes,
      nicknameExpanded: d.nickname_expanded === true,
      hadDiacritics: d.had_diacritics === true,
      reordered: d.reordered === true,
    },
    confidence: num('confidence'),
    raw: d,
  };
}

/** Entity de-duplication (F-026): a messy record list collapsed into golden records. */
function dedupToResult(d: Record<string, unknown>): EnrichmentResult {
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);

  const rawClusters = Array.isArray(d.clusters) ? (d.clusters as Record<string, unknown>[]) : [];
  const clusters: DedupClusterView[] = rawClusters.map((c) => {
    const golden = isRecord(c.golden) ? (c.golden as Record<string, unknown>) : {};
    const rawMembers = Array.isArray(c.members) ? (c.members as Record<string, unknown>[]) : [];
    return {
      golden: {
        name: typeof golden.name === 'string' ? golden.name : '',
        company: typeof golden.company === 'string' ? golden.company : '',
      },
      size: typeof c.size === 'number' ? c.size : rawMembers.length,
      confidence: typeof c.confidence === 'number' ? c.confidence : 0,
      members: rawMembers.map((m) => ({
        name: typeof m.name === 'string' ? m.name : '',
        company: typeof m.company === 'string' ? m.company : '',
        isGolden: m.is_golden === true,
        similarity: typeof m.similarity === 'number' ? m.similarity : 0,
      })),
    };
  });

  const inputCount = num('input_count');
  const uniqueCount = num('unique_count');
  const duplicateCount = num('duplicate_count');
  const dedupRate = num('dedup_rate');

  const fields: EnrichmentField[] = [
    { label: 'Input records', value: String(inputCount) },
    { label: 'Golden records', value: String(uniqueCount) },
    { label: 'Duplicates removed', value: String(duplicateCount) },
    { label: 'Dedup rate', value: `${Math.round(dedupRate * 100)}%` },
  ];

  return {
    kind: 'generic',
    title: 'De-duplication result',
    subtitle: `${inputCount} records → ${uniqueCount} golden${duplicateCount > 0 ? ` · ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} merged` : ''}`,
    avatar: 'DD',
    badges: [`${uniqueCount} golden`, duplicateCount > 0 ? `${duplicateCount} merged` : 'No duplicates'],
    fields,
    dedupe: { inputCount, uniqueCount, duplicateCount, dedupRate, clusters },
    raw: d,
  };
}

/** Email deliverability scoring: a 0-100 reachability score + a decomposed signal breakdown. */
function deliverabilityToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const bool = (k: string) => d[k] === true;

  const email = str('email');
  const verdictRaw = str('verdict');
  const verdict = (['deliverable', 'risky', 'undeliverable', 'unknown'].includes(verdictRaw) ? verdictRaw : 'unknown') as DeliverabilityView['verdict'];
  const score = num('score') ?? 0;
  const domain = str('domain');
  const provider = str('provider') || '—';
  const didYouMean = str('did_you_mean') || null;

  const verdictLabel = verdict.charAt(0).toUpperCase() + verdict.slice(1);

  // Flag chips — only the ones that apply, each toned by how it affects sending.
  const flags: { label: string; tone: ResultTone }[] = [];
  if (bool('is_disposable')) flags.push({ label: 'Disposable', tone: 'error' });
  if (bool('is_catch_all')) flags.push({ label: 'Catch-all', tone: 'warning' });
  if (bool('is_role_based')) flags.push({ label: 'Role-based', tone: 'warning' });
  if (bool('is_greylisted')) flags.push({ label: 'Greylisted', tone: 'warning' });
  if (bool('is_free_provider')) flags.push({ label: 'Free provider', tone: 'info' });
  // Only surface the positive "confirmed" chip when it doesn't contradict the verdict.
  if (verdict !== 'undeliverable' && bool('mx_found') && bool('smtp_check') && !bool('is_catch_all')) {
    flags.push({ label: 'Mailbox confirmed', tone: 'success' });
  }

  const rawChecks = Array.isArray(d.checks) ? (d.checks as Record<string, unknown>[]) : [];
  const checks: DeliverabilityCheckView[] = rawChecks.map((c) => {
    const s = typeof c.status === 'string' ? c.status : 'info';
    return {
      key: typeof c.key === 'string' ? c.key : '',
      label: typeof c.label === 'string' ? c.label : '',
      status: (['pass', 'warn', 'fail', 'info'].includes(s) ? s : 'info') as DeliverabilityCheckView['status'],
      detail: typeof c.detail === 'string' ? c.detail : '',
    };
  });

  return {
    kind: 'person',
    title: email || 'Email',
    subtitle: `${verdictLabel} · ${provider}${domain ? ` · ${domain}` : ''}`,
    avatar: 'AT', // rendered as an @-style badge in the Studio
    badges: [verdictLabel],
    fields: [],
    deliverability: { verdict, score, provider, domain, didYouMean, flags, checks },
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Disposable email detection (F-051): a tone-coded verdict on a throwaway mailbox. */
function disposableToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const email = str('email');
  const domain = str('domain');
  const verdictRaw = str('verdict');
  const verdict = (['disposable', 'suspected', 'trusted'].includes(verdictRaw) ? verdictRaw : 'trusted') as DisposableView['verdict'];
  const verdictLabel = verdict.charAt(0).toUpperCase() + verdict.slice(1);
  const tone: ResultTone = verdict === 'disposable' ? 'error' : verdict === 'suspected' ? 'warning' : 'success';
  const category = str('category').replace(/-/g, ' ');
  const matchedOn = str('matched_on').replace(/-/g, ' ');

  return {
    kind: 'person',
    title: email || 'Email',
    subtitle: domain ? `${verdictLabel} · ${domain}` : verdictLabel,
    avatar: 'AT',
    badges: [verdictLabel],
    fields: [],
    disposable: {
      verdict, category: category || 'unknown', confidence: num('confidence') ?? 0,
      reason: str('reason'), matchedOn: matchedOn || 'no signal', domain, tone,
    },
    confidence: num('confidence'),
    raw: d,
  };
}

/** Email domain authentication: SPF/DKIM/DMARC posture as a scored company card. */
function domainAuthToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const sub = (k: string): Record<string, unknown> => (isRecord(d[k]) ? (d[k] as Record<string, unknown>) : {});
  const domain = str('domain') || 'Domain';
  const grade = str('grade');
  const score = num('score');
  const spoofable = d.spoofable === true;

  const spf = sub('spf');
  const dkim = sub('dkim');
  const dmarc = sub('dmarc');
  const selectors = Array.isArray(dkim.selectors) ? (dkim.selectors as unknown[]).filter((s): s is string => typeof s === 'string') : [];

  const fields: EnrichmentField[] = [
    { label: 'SPF', value: spf.present ? `Policy ${typeof spf.policy === 'string' ? spf.policy : '—'}` : 'Missing', mono: true },
    { label: 'DKIM', value: dkim.present ? (selectors.length ? `${selectors.length} selector${selectors.length === 1 ? '' : 's'}: ${selectors.join(', ')}` : 'Published') : 'Missing', mono: true },
    { label: 'DMARC', value: dmarc.present ? `p=${typeof dmarc.policy === 'string' ? dmarc.policy : '—'}${typeof dmarc.pct === 'number' ? `, pct=${dmarc.pct}` : ''}` : 'Missing', mono: true },
    { label: 'Anti-spoofing', value: score !== undefined ? `${score}/100 · ${grade || '—'}` : (grade || '—') },
    { label: 'Spoofable', value: spoofable ? 'Yes — no DMARC enforcement' : 'No — DMARC enforced' },
  ];

  return {
    kind: 'company',
    title: domain,
    subtitle: `Email authentication posture${grade ? ` · ${grade}` : ''}`,
    avatar: 'DNS',
    badges: [grade ? `${grade} auth` : '', spoofable ? 'Spoofable' : 'Protected'].filter(Boolean),
    fields,
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

/** Cross-field validation: a per-rule consistency report with an integrity score. */
function validationToResult(d: Record<string, unknown>): EnrichmentResult {
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  const subject = str('subject') || str('email') || 'Record';
  const verdict = str('verdict');
  const score = num('integrity_score');
  const consistent = d.consistent === true;
  const rules = Array.isArray(d.rules) ? (d.rules as Record<string, unknown>[]) : [];
  const verdictLabel =
    verdict === 'consistent' ? 'Consistent' :
    verdict === 'minor_issues' ? 'Minor issues' :
    verdict === 'inconsistent' ? 'Inconsistent' : (verdict || '—');
  const sym = (s: string) => (s === 'pass' ? '✓' : s === 'warn' ? '!' : '✕');

  const fields: EnrichmentField[] = [
    { label: 'Verdict', value: `${verdictLabel}${score !== undefined ? ` · ${score}/100 integrity` : ''}`, verified: consistent },
    ...rules.map((r) => {
      const status = typeof r.status === 'string' ? r.status : '';
      const label = typeof r.label === 'string' ? r.label : 'Rule';
      const detail = typeof r.detail === 'string' ? r.detail : '';
      return { label, value: `${sym(status)} ${status.toUpperCase()} — ${detail}`, verified: status === 'pass' };
    }),
  ];

  return {
    kind: 'person',
    title: subject,
    subtitle: `Cross-field validation${score !== undefined ? ` · ${score}/100 integrity` : ''}`,
    avatar: initialsOf(subject),
    badges: [verdictLabel, consistent ? 'No conflicts' : 'Conflicts found'].filter(Boolean),
    fields,
    confidence: num('confidence'),
    provenance: Array.isArray(d.provenance) ? (d.provenance as EnrichmentProvenance[]) : undefined,
    lastVerified: str('last_verified') || undefined,
    raw: d,
  };
}

// ── Field-level freshness (F-040) ────────────────────────────────────────────
/** Fixed demo "today" for deterministic freshness — never Date.now (it would drift on re-render). */
const FRESHNESS_NOW = Date.UTC(2026, 8, 6);
function fnvHash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Deterministic per-field last-verified date + tier from a stable seed. */
function fieldFreshness(seed: string): { verifiedAt: string; freshness: FieldFreshness } {
  const daysAgo = fnvHash(seed) % 160; // 0..159 days
  const verifiedAt = new Date(FRESHNESS_NOW - daysAgo * 86400000).toISOString().slice(0, 10);
  const freshness: FieldFreshness = daysAgo <= 30 ? 'fresh' : daysAgo <= 90 ? 'aging' : 'stale';
  return { verifiedAt, freshness };
}

/** Human "12d ago" / "3mo ago" for a per-field verified date, relative to the fixed demo clock. */
export function freshnessAgeLabel(verifiedAt: string): string {
  const days = Math.max(0, Math.round((FRESHNESS_NOW - Date.parse(`${verifiedAt}T00:00:00Z`)) / 86400000));
  if (days === 0) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** Stamp every result field with a deterministic per-field last-verified date + tier (F-040). */
function withFieldFreshness(vm: EnrichmentResult): EnrichmentResult {
  const base = vm.title || 'result';
  return {
    ...vm,
    fields: vm.fields.map((f) => (f.verifiedAt ? f : { ...f, ...fieldFreshness(`${base}|${f.label}|${f.value}`) })),
  };
}

/** Rate how filled-out a field-bearing record is (F-048). Structured-only results score null. */
function withCompleteness(vm: EnrichmentResult): EnrichmentResult {
  const completeness = scoreCompleteness(vm.fields);
  return completeness ? { ...vm, completeness } : vm;
}

/** Normalize any endpoint response into one view-model, then stamp per-field freshness + completeness. */
export function toEnrichmentResult(data: unknown): EnrichmentResult | null {
  const vm = buildEnrichmentResult(data);
  return vm ? withCompleteness(withFieldFreshness(vm)) : null;
}

function buildEnrichmentResult(data: unknown): EnrichmentResult | null {
  if (!isRecord(data)) return null;
  // Hashed-email match: a `person` + a `email_sha256` marker — decorate before the plain person branch.
  if (data.matched === true && isRecord(data.person) && typeof data.email_sha256 === 'string') return hashedEmailToResult(data);
  if (isRecord(data.person)) return personToResult(data.person as unknown as ResolvedPerson);
  if (isRecord(data.company)) return companyToResult(data.company as unknown as EnrichedCompany);
  // Phone append & verification: line_type + verification_status mark the shape.
  if (typeof data.line_type === 'string' && typeof data.verification_status === 'string') {
    return phoneToResult(data);
  }
  if (isRecord(data.ip_intel)) return ipToResult(data.ip_intel as Record<string, unknown>);
  // Social profile discovery: a `profiles` array + platform_count mark the shape.
  if (Array.isArray(data.profiles) && typeof data.platform_count === 'number') return socialToResult(data);
  // Job title normalization: canonical_title + seniority mark the shape.
  if (typeof data.canonical_title === 'string' && typeof data.seniority === 'string') return titleToResult(data);
  // Firmographic append: naics_code + sic_code mark the shape.
  if (typeof data.naics_code === 'string' && typeof data.sic_code === 'string') return firmographicToResult(data);
  // Technographic detection: a `detections` array + numeric `sophistication` mark the shape.
  if (Array.isArray(data.detections) && typeof data.sophistication === 'number') return technographicToResult(data);
  // Funding & investment signals: a `rounds` array + a `funding_stage` mark the shape.
  if (Array.isArray(data.rounds) && typeof data.funding_stage === 'string') return fundingToResult(data);
  // HQ & office geo-resolution: an `offices` array + an `hq` object mark the shape.
  if (Array.isArray(data.offices) && isRecord(data.hq)) return officeGeoToResult(data);
  // Company news & event feed: an `events` array + a numeric `event_count` mark the shape.
  if (Array.isArray(data.events) && typeof data.event_count === 'number') return newsToResult(data);
  // Probabilistic fuzzy matching: a `candidates` array + a `verdict` mark the shape.
  if (Array.isArray(data.candidates) && typeof data.verdict === 'string' && isRecord(data.interpreted)) return fuzzyToResult(data);
  // Name canonicalization: a `components` object + a `canonical` string + a `changes` array.
  if (isRecord(data.components) && typeof data.canonical === 'string' && Array.isArray(data.changes)) return nameCanonicalToResult(data);
  // Entity de-duplication: a `clusters` array + numeric `dedup_rate` mark the shape.
  if (Array.isArray(data.clusters) && typeof data.dedup_rate === 'number') return dedupToResult(data);
  // Persistent Zinbit ID: a `zinbit_id` string + an `aliases` array mark the shape.
  if (typeof data.zinbit_id === 'string' && Array.isArray(data.aliases)) return zidToResult(data);
  // Email deliverability: a `verdict` + numeric `score` + a `checks` array mark the shape.
  if (typeof data.verdict === 'string' && typeof data.score === 'number' && Array.isArray(data.checks)) return deliverabilityToResult(data);
  // Email domain authentication: a `spoofable` verdict + a `dmarc` object mark the shape.
  if (typeof data.spoofable === 'boolean' && isRecord(data.dmarc)) return domainAuthToResult(data);
  // Cross-field validation: a `rules` array + numeric `integrity_score` mark the shape.
  if (Array.isArray(data.rules) && typeof data.integrity_score === 'number') return validationToResult(data);
  // Disposable detection: `is_disposable` + a `matched_on` provenance marker.
  if (typeof data.is_disposable === 'boolean' && typeof data.matched_on === 'string' && typeof data.category === 'string') return disposableToResult(data);
  // identity-resolve / reverse: { type, resolved_from, profile }
  if (isRecord(data.profile)) {
    const profile = data.profile as Record<string, unknown>;
    const flat = genericToResult(profile);
    flat.kind = data.type === 'company' ? 'company' : 'person';
    flat.subtitle = typeof data.resolved_from === 'string' ? `Resolved from ${data.resolved_from}` : undefined;
    return flat;
  }
  return genericToResult(data);
}
