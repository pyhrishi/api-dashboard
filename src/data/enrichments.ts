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

export type InputKind = 'email' | 'domain' | 'phone' | 'linkedin' | 'cin' | 'din' | 'auto';
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
};

export function detectInputKind(raw: string): InputKind {
  const v = String(raw || '').trim();
  if (!v) return 'auto';
  if (RE.email.test(v)) return 'email';
  if (RE.linkedin.test(v)) return 'linkedin';
  if (RE.cin.test(v)) return 'cin';
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
    case 'din': return v.length >= 4;
    case 'auto': return v.length >= 2;
    default: return v.length > 0;
  }
}

// ── Generic result view-model ────────────────────────────────────────────────
export interface EnrichmentField { label: string; value: string; verified?: boolean; masked?: boolean; mono?: boolean; }
export interface EnrichmentProvenance { field: string; source: string; signal: string; confidence: number; }
export interface EnrichmentResult {
  kind: 'person' | 'company' | 'generic';
  title: string;
  subtitle?: string;
  avatar: string;
  badges: string[];
  fields: EnrichmentField[];
  chips?: { label: string; items: string[] };
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
export function toEnrichmentResult(data: unknown): EnrichmentResult | null {
  if (!isRecord(data)) return null;
  if (isRecord(data.person)) return personToResult(data.person as unknown as ResolvedPerson);
  if (isRecord(data.company)) return companyToResult(data.company as unknown as EnrichedCompany);
  // Phone append & verification: line_type + verification_status mark the shape.
  if (typeof data.line_type === 'string' && typeof data.verification_status === 'string') {
    return phoneToResult(data);
  }
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
