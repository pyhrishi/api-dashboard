/**
 * Cross-reference ID mapping (F-039) — the ID Rosetta Stone.
 *
 * Given ANY identifier from ANY system — a corporate email, a company domain, a
 * company name / ticker, a LinkedIn URL, a Crunchbase permalink, a Salesforce or
 * HubSpot record ID, a DUNS number, an Apollo/PDL id, a GitHub org, an X handle,
 * or a Zinbit ID — resolve to the one canonical entity and return that entity's
 * identifier in EVERY other system, each with a resolvable public URL where one
 * exists, all unified under a single persistent Zinbit ID.
 *
 * Forward-resolvable inputs (email → person, domain / name / ticker → company)
 * resolve directly. Opaque, non-reversible IDs (a bare Salesforce/HubSpot/DUNS/
 * Apollo id, a Zinbit ID, a raw handle) are reverse-resolved by scanning a curated
 * anchor set and matching the input against each anchor's computed reference map —
 * so the graph is genuinely navigable in both directions across the demo corpus.
 *
 * Every synthetic ID is a frozen, deterministic function of the entity's identity
 * (FNV-1a — no Math.random, no wall-clock), so the same entity always maps to the
 * same IDs, and real fields (LinkedIn / X / GitHub URLs, ticker) come straight from
 * the resolvers so the map stays coherent with the rest of the platform.
 */

import { resolvePersonFromEmail, type ResolvedPerson } from '@/lib/person-resolver';
import {
  resolveCompanyFromDomain,
  normalizeDomain,
  isValidDomain,
  type EnrichedCompany,
} from '@/lib/company-resolver';
import { resolveCompanyAlias } from '@/lib/company-alias-resolver';
import { zidForPerson, zidForCompany } from '@/lib/zinbit-id';
import { sha256Hex } from '@/lib/sha256';
import { normalizeEmailForHash } from '@/lib/hashed-email-resolver';

export type SystemCategory =
  | 'internal'
  | 'data-provider'
  | 'crm'
  | 'social'
  | 'registry'
  | 'financial';

export type IdSystem =
  | 'zinbit'
  | 'domain'
  | 'website'
  | 'email'
  | 'hashed_email'
  | 'phone'
  | 'linkedin'
  | 'twitter'
  | 'github'
  | 'crunchbase'
  | 'clearbit'
  | 'apollo'
  | 'pdl'
  | 'salesforce'
  | 'hubspot'
  | 'duns'
  | 'ticker';

export interface CrossReference {
  system: IdSystem;
  /** Human label for the system, e.g. "Salesforce Account". */
  label: string;
  category: SystemCategory;
  /** The identifier value in that system. */
  id: string;
  /** A resolvable public URL, or null when the system exposes no public page. */
  url: string | null;
  /** True for the primary key this platform assigns (the Zinbit ID). */
  canonical: boolean;
  /** True for the reference that the input was matched on. */
  matched: boolean;
  /** 0..1 — how confident we are in this mapping. */
  confidence: number;
}

export interface UnresolvedSystem {
  system: IdSystem;
  label: string;
  category: SystemCategory;
  /** Why no ID was emitted (e.g. "No public profile on record"). */
  reason: string;
}

export interface XrefResolution {
  input: string;
  /** The system the input was detected as. */
  input_system: IdSystem | 'unknown';
  entity_type: 'person' | 'company';
  zinbit_id: string;
  canonical: string;
  display: string;
  /** How the entity was reached — 'forward' (direct) or 'reverse' (anchor scan). */
  resolution_path: 'forward' | 'reverse';
  references: CrossReference[];
  unresolved: UnresolvedSystem[];
  /** Overall confidence in the entity resolution. */
  confidence: number;
}

// ── Deterministic primitives ────────────────────────────────────────────────

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HEX = '0123456789abcdef';

/** A stable base-62 string of `len` chars from a salted key. */
function b62(key: string, len: number): string {
  let out = '';
  let h = fnv(key);
  for (let i = 0; i < len; i++) {
    if (i % 5 === 0) h = fnv(`${key}:${i}`);
    out += B62[(h >>> ((i % 5) * 6)) % 62];
  }
  return out;
}

/** A stable hex string of `len` chars from a salted key. */
function hex(key: string, len: number): string {
  let out = '';
  let h = fnv(key);
  for (let i = 0; i < len; i++) {
    if (i % 8 === 0) h = fnv(`${key}#${i}`);
    out += HEX[(h >>> ((i % 8) * 4)) & 0xf];
  }
  return out;
}

/** A stable numeric string of `digits` length (no leading zero). */
function digitsOf(key: string, digits: number): string {
  let out = '';
  let h = fnv(key);
  for (let i = 0; i < digits; i++) {
    if (i % 9 === 0) h = fnv(`${key}~${i}`);
    let d = (h >>> ((i % 9) * 3)) % 10;
    if (i === 0 && d === 0) d = 1 + (h % 9);
    out += String(d);
  }
  return out;
}

function slugify(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Curated real tickers (public companies in the demo corpus) ───────────────
// Only public companies carry a ticker; the map keeps them real where we know
// them and doubles as the reverse index for a ticker input.
const KNOWN_TICKERS: Record<string, string> = {
  'shopify.com': 'SHOP',
  'datadoghq.com': 'DDOG',
  'zomato.in': 'ETERNAL',
};

// Anchors that reverse-resolution scans for opaque IDs. Kept aligned to the
// alias registry + the example identities used across the console.
const ANCHOR_DOMAINS = [
  'stripe.com', 'shopify.com', 'datadoghq.com', 'notion.so', 'figma.com',
  'zomato.in', 'vercel.com', 'acme.com',
];
const ANCHOR_EMAILS = [
  'jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in',
];

// ── Reference builders ──────────────────────────────────────────────────────

const SYSTEM_LABELS: Record<IdSystem, string> = {
  zinbit: 'Zinbit ID', domain: 'Domain', website: 'Website', email: 'Email',
  hashed_email: 'Hashed email', phone: 'Phone', linkedin: 'LinkedIn',
  twitter: 'X (Twitter)', github: 'GitHub', crunchbase: 'Crunchbase',
  clearbit: 'Clearbit', apollo: 'Apollo', pdl: 'People Data Labs',
  salesforce: 'Salesforce', hubspot: 'HubSpot', duns: 'D&B DUNS', ticker: 'Ticker',
};

function companyKey(c: EnrichedCompany): string {
  return `domain:${normalizeDomain(c.domain)}`;
}

/** The full deterministic cross-reference set for a company. */
function buildCompanyReferences(c: EnrichedCompany): {
  references: CrossReference[];
  unresolved: UnresolvedSystem[];
} {
  const key = companyKey(c);
  const zid = zidForCompany(c);
  const slug = slugify(c.name) || normalizeDomain(c.domain).split('.')[0];
  const references: CrossReference[] = [];
  const unresolved: UnresolvedSystem[] = [];

  references.push({ system: 'zinbit', label: SYSTEM_LABELS.zinbit, category: 'internal', id: zid, url: null, canonical: true, matched: false, confidence: 1 });
  references.push({ system: 'domain', label: SYSTEM_LABELS.domain, category: 'internal', id: c.domain, url: null, canonical: false, matched: false, confidence: 1 });
  references.push({ system: 'website', label: SYSTEM_LABELS.website, category: 'internal', id: `https://${c.domain}`, url: `https://${c.domain}`, canonical: false, matched: false, confidence: 1 });

  // Social (real fields where present).
  references.push({ system: 'linkedin', label: 'LinkedIn Company', category: 'social', id: c.linkedin_url, url: c.linkedin_url, canonical: false, matched: false, confidence: 0.93 });
  if (c.twitter_url) {
    references.push({ system: 'twitter', label: SYSTEM_LABELS.twitter, category: 'social', id: c.twitter_url, url: c.twitter_url, canonical: false, matched: false, confidence: 0.82 });
  } else {
    unresolved.push({ system: 'twitter', label: SYSTEM_LABELS.twitter, category: 'social', reason: 'No X profile on record' });
  }
  const ghSlug = slug;
  references.push({ system: 'github', label: 'GitHub Org', category: 'social', id: `https://github.com/${ghSlug}`, url: `https://github.com/${ghSlug}`, canonical: false, matched: false, confidence: 0.61 });

  // Data providers.
  references.push({ system: 'crunchbase', label: SYSTEM_LABELS.crunchbase, category: 'data-provider', id: `https://www.crunchbase.com/organization/${slug}`, url: `https://www.crunchbase.com/organization/${slug}`, canonical: false, matched: false, confidence: 0.86 });
  references.push({ system: 'clearbit', label: SYSTEM_LABELS.clearbit, category: 'data-provider', id: c.domain, url: `https://logo.clearbit.com/${c.domain}`, canonical: false, matched: false, confidence: 0.8 });
  references.push({ system: 'apollo', label: 'Apollo Account', category: 'data-provider', id: hex(`apollo:co:${key}`, 24), url: null, canonical: false, matched: false, confidence: 0.78 });
  references.push({ system: 'pdl', label: SYSTEM_LABELS.pdl, category: 'data-provider', id: `${b62(`pdl:co:${key}`, 22)}_0000`, url: null, canonical: false, matched: false, confidence: 0.76 });

  // Registry.
  references.push({ system: 'duns', label: SYSTEM_LABELS.duns, category: 'registry', id: digitsOf(`duns:${key}`, 9), url: null, canonical: false, matched: false, confidence: 0.71 });

  // CRM (instance-scoped IDs — no public URL).
  references.push({ system: 'salesforce', label: 'Salesforce Account', category: 'crm', id: `001${b62(`sf:acct:${key}`, 15)}`, url: null, canonical: false, matched: false, confidence: 0.68 });
  references.push({ system: 'hubspot', label: 'HubSpot Company', category: 'crm', id: digitsOf(`hs:co:${key}`, 10), url: null, canonical: false, matched: false, confidence: 0.68 });

  // Financial (public companies only).
  if (c.type === 'Public') {
    const ticker = KNOWN_TICKERS[normalizeDomain(c.domain)] ?? (c.logo_initials + slug.slice(0, 2)).toUpperCase().slice(0, 4);
    references.push({ system: 'ticker', label: SYSTEM_LABELS.ticker, category: 'financial', id: ticker, url: `https://finance.yahoo.com/quote/${ticker}`, canonical: false, matched: false, confidence: KNOWN_TICKERS[normalizeDomain(c.domain)] ? 0.95 : 0.55 });
  } else {
    unresolved.push({ system: 'ticker', label: SYSTEM_LABELS.ticker, category: 'financial', reason: `${c.type} company — not publicly traded` });
  }

  return { references, unresolved };
}

function personKeyOf(p: ResolvedPerson): string {
  return `person:${normalizeEmailForHash(p.email)}`;
}

/** The full deterministic cross-reference set for a person. */
function buildPersonReferences(p: ResolvedPerson): {
  references: CrossReference[];
  unresolved: UnresolvedSystem[];
} {
  const key = personKeyOf(p);
  const zid = zidForPerson(p);
  const references: CrossReference[] = [];
  const unresolved: UnresolvedSystem[] = [];

  references.push({ system: 'zinbit', label: SYSTEM_LABELS.zinbit, category: 'internal', id: zid, url: null, canonical: true, matched: false, confidence: 1 });
  references.push({ system: 'email', label: SYSTEM_LABELS.email, category: 'internal', id: p.email, url: `mailto:${p.email}`, canonical: false, matched: false, confidence: p.email_verified ? 0.98 : 0.7 });
  references.push({ system: 'hashed_email', label: SYSTEM_LABELS.hashed_email, category: 'internal', id: `sha256:${sha256Hex(normalizeEmailForHash(p.email))}`, url: null, canonical: false, matched: false, confidence: 1 });
  if (p.phone) {
    references.push({ system: 'phone', label: SYSTEM_LABELS.phone, category: 'internal', id: p.phone, url: `tel:${p.phone.replace(/[^\d+]/g, '')}`, canonical: false, matched: false, confidence: p.phone_verified ? 0.9 : 0.6 });
  }

  // Social (real fields).
  if (p.linkedin_url) {
    references.push({ system: 'linkedin', label: 'LinkedIn Profile', category: 'social', id: p.linkedin_url, url: p.linkedin_url, canonical: false, matched: false, confidence: 0.9 });
  } else {
    unresolved.push({ system: 'linkedin', label: 'LinkedIn Profile', category: 'social', reason: 'No LinkedIn profile on record' });
  }
  if (p.github_url) {
    references.push({ system: 'github', label: 'GitHub User', category: 'social', id: p.github_url, url: p.github_url, canonical: false, matched: false, confidence: 0.78 });
  } else {
    unresolved.push({ system: 'github', label: 'GitHub User', category: 'social', reason: 'No GitHub profile on record' });
  }
  if (p.twitter_url) {
    references.push({ system: 'twitter', label: SYSTEM_LABELS.twitter, category: 'social', id: p.twitter_url, url: p.twitter_url, canonical: false, matched: false, confidence: 0.72 });
  } else {
    unresolved.push({ system: 'twitter', label: SYSTEM_LABELS.twitter, category: 'social', reason: 'No X profile on record' });
  }

  // Data providers.
  references.push({ system: 'apollo', label: 'Apollo Contact', category: 'data-provider', id: hex(`apollo:pe:${key}`, 24), url: null, canonical: false, matched: false, confidence: 0.76 });
  references.push({ system: 'pdl', label: SYSTEM_LABELS.pdl, category: 'data-provider', id: `${b62(`pdl:pe:${key}`, 22)}_0000`, url: null, canonical: false, matched: false, confidence: 0.74 });

  // CRM.
  references.push({ system: 'salesforce', label: 'Salesforce Contact', category: 'crm', id: `003${b62(`sf:cont:${key}`, 15)}`, url: null, canonical: false, matched: false, confidence: 0.66 });
  references.push({ system: 'hubspot', label: 'HubSpot Contact', category: 'crm', id: digitsOf(`hs:pe:${key}`, 8), url: null, canonical: false, matched: false, confidence: 0.66 });

  return { references, unresolved };
}

// ── Input detection ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripUrl(s: string): string {
  return String(s || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

function looksLikeDomain(s: string): boolean {
  const d = stripUrl(s).split('/')[0];
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(d);
}

/** Detect which system a raw identifier belongs to. */
export function detectIdSystem(raw: string): IdSystem | 'unknown' {
  const q = String(raw || '').trim();
  if (!q) return 'unknown';
  if (/^zid_[pc]_[0-9a-z]{6,12}$/.test(q)) return 'zinbit';
  if (EMAIL_RE.test(q)) return 'email';
  const host = stripUrl(q).split('/')[0].toLowerCase();
  const path = stripUrl(q).slice(host.length);
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  if (host === 'crunchbase.com' || host.endsWith('.crunchbase.com')) return 'crunchbase';
  if (host === 'github.com') return 'github';
  if (host === 'x.com' || host === 'twitter.com') return 'twitter';
  if (path === '' && (host === 'linkedin.com')) return 'linkedin';
  if (/^sha256:[0-9a-f]{64}$/i.test(q)) return 'hashed_email';
  if (/^@[a-z0-9_]{2,}$/i.test(q)) return 'twitter';
  if (/^00[13][A-Za-z0-9]{12,15}$/.test(q)) return 'salesforce';
  if (/^\d{9}$/.test(q)) return 'duns';
  if (/^\d{6,10}$/.test(q)) return 'hubspot';
  if (/^[a-f0-9]{24}$/i.test(q)) return 'apollo';
  if (/^[0-9A-Za-z]{22}_0000$/.test(q)) return 'pdl';
  if (looksLikeDomain(q)) return 'domain';
  if (/^[A-Z]{1,6}$/.test(q)) return 'ticker';
  return 'unknown'; // free text → treated as a company name downstream
}

// ── Resolution ──────────────────────────────────────────────────────────────

function assemble(
  input: string,
  inputSystem: IdSystem | 'unknown',
  path: 'forward' | 'reverse',
  entity: { type: 'person'; p: ResolvedPerson } | { type: 'company'; c: EnrichedCompany },
): XrefResolution {
  const { references, unresolved } =
    entity.type === 'person' ? buildPersonReferences(entity.p) : buildCompanyReferences(entity.c);

  // Mark the reference the input matched (by system + value, else by system).
  const nq = String(input || '').trim().toLowerCase();
  let matchedIdx = references.findIndex(
    (r) => r.system === inputSystem && (r.id.toLowerCase() === nq || stripUrl(r.id).toLowerCase() === stripUrl(nq)),
  );
  if (matchedIdx < 0) matchedIdx = references.findIndex((r) => r.system === inputSystem);
  if (matchedIdx < 0) matchedIdx = references.findIndex((r) => r.id.toLowerCase() === nq);
  if (matchedIdx >= 0) references[matchedIdx].matched = true;

  const zid = references.find((r) => r.canonical)!.id;
  if (entity.type === 'company') {
    const c = entity.c;
    return {
      input, input_system: inputSystem, entity_type: 'company', zinbit_id: zid,
      canonical: c.name, display: `${c.name} · ${c.domain}`, resolution_path: path,
      references, unresolved, confidence: c.confidence,
    };
  }
  const p = entity.p;
  return {
    input, input_system: inputSystem, entity_type: 'person', zinbit_id: zid,
    canonical: p.full_name, display: `${p.full_name}${p.company ? ` · ${p.company}` : ''}`,
    resolution_path: path, references, unresolved, confidence: p.confidence,
  };
}

/** Reverse-resolve an opaque ID by scanning the anchor corpus for a match. */
function reverseScan(input: string, inputSystem: IdSystem | 'unknown'): XrefResolution | null {
  const nq = String(input || '').trim().toLowerCase();
  for (let i = 0; i < ANCHOR_DOMAINS.length; i++) {
    const c = resolveCompanyFromDomain(ANCHOR_DOMAINS[i]);
    if (!c) continue;
    const { references } = buildCompanyReferences(c);
    if (references.some((r) => r.id.toLowerCase() === nq)) {
      return assemble(input, inputSystem, 'reverse', { type: 'company', c });
    }
  }
  for (let i = 0; i < ANCHOR_EMAILS.length; i++) {
    const p = resolvePersonFromEmail(ANCHOR_EMAILS[i]);
    if (!p) continue;
    const { references } = buildPersonReferences(p);
    if (references.some((r) => r.id.toLowerCase() === nq)) {
      return assemble(input, inputSystem, 'reverse', { type: 'person', p });
    }
  }
  return null;
}

/**
 * Resolve any cross-system identifier to its canonical entity and full ID map.
 * Returns `null` when the input cannot be resolved to a known entity.
 */
export function resolveCrossReference(rawQuery: string): XrefResolution | null {
  const query = String(rawQuery || '').trim();
  if (!query) return null;
  const system = detectIdSystem(query);

  // Forward: email → person.
  if (system === 'email') {
    const p = resolvePersonFromEmail(query);
    return p ? assemble(query, system, 'forward', { type: 'person', p }) : null;
  }

  // Forward: domain → company.
  if (system === 'domain') {
    const domain = normalizeDomain(query);
    if (isValidDomain(domain)) {
      const c = resolveCompanyFromDomain(domain);
      if (c) return assemble(query, system, 'forward', { type: 'company', c });
    }
  }

  // Forward: ticker → company (known map).
  if (system === 'ticker') {
    const domain = Object.keys(KNOWN_TICKERS).find((d) => KNOWN_TICKERS[d] === query.toUpperCase());
    if (domain) {
      const c = resolveCompanyFromDomain(domain);
      if (c) return assemble(query, system, 'forward', { type: 'company', c });
    }
    // fall through to alias / reverse
  }

  // Forward: Crunchbase permalink → company by slug against anchors.
  if (system === 'crunchbase') {
    const slug = stripUrl(query).split('/').filter(Boolean).pop() ?? '';
    for (let i = 0; i < ANCHOR_DOMAINS.length; i++) {
      const c = resolveCompanyFromDomain(ANCHOR_DOMAINS[i]);
      if (c && slugify(c.name) === slug) return assemble(query, system, 'forward', { type: 'company', c });
    }
  }

  // Opaque IDs (zinbit / salesforce / hubspot / duns / apollo / pdl / github /
  // twitter / hashed_email) → reverse-scan the anchor corpus.
  const REVERSE_SYSTEMS: (IdSystem | 'unknown')[] = ['zinbit', 'salesforce', 'hubspot', 'duns', 'apollo', 'pdl', 'github', 'twitter', 'hashed_email', 'linkedin', 'ticker', 'crunchbase'];
  if (REVERSE_SYSTEMS.includes(system)) {
    const hit = reverseScan(query, system);
    if (hit) return hit;
  }

  // Free text → treat as a company name via alias resolution.
  const alias = resolveCompanyAlias(query);
  if (alias.resolved) {
    const c = resolveCompanyFromDomain(alias.resolved.domain);
    if (c) return assemble(query, system === 'unknown' ? 'domain' : system, 'forward', { type: 'company', c });
  }

  return null;
}
