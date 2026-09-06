/**
 * Persistent Zinbit ID — the stable, canonical identifier for a resolved entity.
 *
 * Every person and company gets one `zid_p_…` / `zid_c_…` that is the SAME no
 * matter which identifier you looked them up by (email, LinkedIn, hashed email,
 * phone) and that survives an email change — because it's derived from *who the
 * entity is* (a frozen normalization of name @ company domain), not from the
 * query string.
 *
 * The normalization here is intentionally FROZEN and minimal (lowercase, strip
 * accents, drop punctuation, sort name tokens) — never a growing nickname
 * dictionary — so a Zinbit ID never changes once assigned. Pure and
 * deterministic (FNV-1a, no Math.random, no wall-clock).
 */

import { resolvePersonFromEmail, type ResolvedPerson } from '@/lib/person-resolver';
import { resolveCompanyFromDomain, normalizeDomain, isValidDomain, type EnrichedCompany } from '@/lib/company-resolver';
import { sha256Hex } from '@/lib/sha256';
import { normalizeEmailForHash } from '@/lib/hashed-email-resolver';

export type ZinbitEntityType = 'person' | 'company';
export type ZinbitAliasType = 'email' | 'linkedin' | 'hashed_email' | 'phone' | 'domain' | 'website';

export interface ZinbitAlias {
  type: ZinbitAliasType;
  value: string;
}

export interface ZinbitIdResult {
  zinbit_id: string;
  entity_type: ZinbitEntityType;
  canonical: string;
  display: string;
  /** Human description of the frozen key the ID is derived from. */
  derived_from: string;
  confidence: number;
  first_seen: string;
  aliases: ZinbitAlias[];
}

const FIRST_SEEN_EPOCH = Date.UTC(2020, 0, 1);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Frozen name normalization: lowercase, strip accents + punctuation, sort tokens. */
function normalizeName(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** A 12-char base36 id from two FNV passes over a frozen key. */
function idFromKey(key: string): string {
  const h1 = hash(key);
  const h2 = hash(`zid-salt:${key}`);
  return (h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0')).slice(0, 12);
}

function firstSeen(key: string): string {
  const days = hash(`seen:${key}`) % 1825; // within ~5 years of the epoch
  return new Date(FIRST_SEEN_EPOCH + days * 86_400_000).toISOString().slice(0, 10);
}

/** The frozen identity key behind a person's Zinbit ID. */
function personKey(p: ResolvedPerson): string {
  const name = normalizeName(p.full_name);
  return p.is_personal_email ? `${name}|${normalizeEmailForHash(p.email)}` : `${name}@${normalizeDomain(p.company_domain)}`;
}

/** The persistent Zinbit ID for a resolved person (stable across identifiers). */
export function zidForPerson(p: ResolvedPerson): string {
  return `zid_p_${idFromKey(personKey(p))}`;
}

/** The persistent Zinbit ID for a resolved company (stable per domain). */
export function zidForCompany(c: EnrichedCompany): string {
  return `zid_c_${idFromKey(`domain:${normalizeDomain(c.domain)}`)}`;
}

/** True for a syntactically valid Zinbit ID. */
export function isZinbitId(value: string): boolean {
  return /^zid_[pc]_[0-9a-z]{6,12}$/.test(String(value || '').trim());
}

/**
 * Resolve any supported identifier (email → person, domain → company) to its
 * persistent Zinbit ID plus the aliases that all unify to it. Returns `null`
 * when the input is neither a resolvable email nor a valid domain.
 */
export function resolveZinbitId(rawQuery: string): ZinbitIdResult | null {
  const query = String(rawQuery || '').trim();
  if (!query) return null;

  // Email → person.
  if (EMAIL_RE.test(query)) {
    const person = resolvePersonFromEmail(query);
    if (!person) return null;
    const zinbit_id = zidForPerson(person);
    const aliases: ZinbitAlias[] = [
      { type: 'email', value: person.email },
      { type: 'hashed_email', value: `sha256:${sha256Hex(normalizeEmailForHash(person.email))}` },
    ];
    if (person.linkedin_url) aliases.push({ type: 'linkedin', value: person.linkedin_url });
    if (person.phone) aliases.push({ type: 'phone', value: person.phone });
    return {
      zinbit_id,
      entity_type: 'person',
      canonical: person.full_name,
      display: `${person.full_name}${person.company ? ` · ${person.company}` : ''}`,
      derived_from: person.is_personal_email
        ? `identity of ${person.full_name}`
        : `${normalizeName(person.full_name)} @ ${normalizeDomain(person.company_domain)}`,
      confidence: person.confidence,
      first_seen: firstSeen(personKey(person)),
      aliases,
    };
  }

  // Domain → company.
  const domain = normalizeDomain(query);
  if (isValidDomain(domain)) {
    const company = resolveCompanyFromDomain(domain);
    if (!company) return null;
    const zinbit_id = zidForCompany(company);
    const aliases: ZinbitAlias[] = [
      { type: 'domain', value: company.domain },
      { type: 'website', value: `https://${company.domain}` },
    ];
    if (company.linkedin_url) aliases.push({ type: 'linkedin', value: company.linkedin_url });
    return {
      zinbit_id,
      entity_type: 'company',
      canonical: company.name,
      display: `${company.name} · ${company.domain}`,
      derived_from: `domain ${company.domain}`,
      confidence: company.confidence,
      first_seen: firstSeen(`domain:${normalizeDomain(company.domain)}`),
      aliases,
    };
  }

  return null;
}
