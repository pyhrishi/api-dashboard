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
  { id: 'email-verify', endpointId: 'email-verify', param: 'email', inputKind: 'email', icon: 'MailCheck', category: 'person', examples: ['john@datadoghq.com', 'contact@figma.com', 'user@mailinator.com'], label: 'Verify deliverability' },
  { id: 'email-domain-auth', endpointId: 'email-domain-auth', param: 'domain', inputKind: 'domain', icon: 'ShieldCheck', category: 'company', examples: ['stripe.com', 'zomato.in', 'shopify.com'], label: 'Domain auth (SPF/DKIM/DMARC)' },
  { id: 'record-validate', endpointId: 'record-validate', param: 'email', inputKind: 'email', icon: 'BadgeCheck', category: 'person', examples: ['jane.doe@acme.com', 'ceo@stripe.com', 'info@acme.com'], label: 'Validate a record' },
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
      placeholder: paramDef?.placeholder ?? paramDef?.example ?? 'Enter a value',
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
    ],
    confidence: p.confidence, provenance: p.provenance, lastVerified: p.last_verified,
    links: [{ label: 'LinkedIn', href: p.linkedin_url }, ...(p.github_url ? [{ label: 'GitHub', href: p.github_url }] : []), ...(p.twitter_url ? [{ label: 'X', href: p.twitter_url }] : [])],
    raw: p,
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
    ],
    chips: { label: 'Tech stack', items: c.tech_stack },
    confidence: c.confidence, provenance: c.provenance, lastVerified: c.last_verified,
    links: [{ label: 'LinkedIn', href: c.linkedin_url }, ...(c.twitter_url ? [{ label: 'X', href: c.twitter_url }] : [])],
    raw: c,
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

/** Normalize any endpoint response into one view-model, then stamp per-field freshness. */
export function toEnrichmentResult(data: unknown): EnrichmentResult | null {
  const vm = buildEnrichmentResult(data);
  return vm ? withFieldFreshness(vm) : null;
}

function buildEnrichmentResult(data: unknown): EnrichmentResult | null {
  if (!isRecord(data)) return null;
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
  // Email deliverability: a `verdict` + numeric `score` + a `checks` array mark the shape.
  if (typeof data.verdict === 'string' && typeof data.score === 'number' && Array.isArray(data.checks)) return deliverabilityToResult(data);
  // Email domain authentication: a `spoofable` verdict + a `dmarc` object mark the shape.
  if (typeof data.spoofable === 'boolean' && isRecord(data.dmarc)) return domainAuthToResult(data);
  // Cross-field validation: a `rules` array + numeric `integrity_score` mark the shape.
  if (Array.isArray(data.rules) && typeof data.integrity_score === 'number') return validationToResult(data);
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
