/**
 * Company alias resolution (F-031) — map DBAs, legal names, brand names, former
 * names, tickers, and abbreviations to one canonical company.
 *
 * "Alphabet Inc.", "Google", "GOOGL", "goog" should all resolve to the same
 * entity. This resolver holds a curated alias registry keyed by domain and matches
 * an input string to it — exact first, then Jaro-Winkler fuzzy — returning the
 * canonical company (resolved through resolveCompanyFromDomain, so it's the same
 * entity the rest of the platform enriches), the alias type that matched, a
 * confidence, and the runner-up candidates.
 *
 * Deterministic — same query → same resolution. No `Math.random`.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { jaroWinkler } from '@/lib/fuzzy-matcher';

export type AliasType = 'brand' | 'legal' | 'dba' | 'former' | 'ticker' | 'abbreviation' | 'domain';
export type AliasMatchType = 'domain' | 'exact' | 'fuzzy' | 'none';

interface RegistryAlias { value: string; type: AliasType; }
interface RegistryEntry { domain: string; aliases: RegistryAlias[]; }

// Curated aliases per canonical domain. Canonical name/legal_name are pulled from
// resolveCompanyFromDomain at match time, so this stays coherent with enrichment.
// Former names are real where possible (Shopify←Jaded Pixel, Zomato←Foodiebay,
// Vercel←ZEIT) — the kind of rebrand only alias resolution catches.
const REGISTRY: RegistryEntry[] = [
  { domain: 'stripe.com', aliases: [
    { value: 'Stripe', type: 'brand' }, { value: 'Stripe, Inc.', type: 'legal' }, { value: 'Stripe Inc', type: 'legal' },
    { value: 'Stripe Payments', type: 'dba' }, { value: 'strp', type: 'abbreviation' },
  ]},
  { domain: 'shopify.com', aliases: [
    { value: 'Shopify', type: 'brand' }, { value: 'Shopify Inc.', type: 'legal' }, { value: 'Shopify Commerce', type: 'dba' },
    { value: 'SHOP', type: 'ticker' }, { value: 'Jaded Pixel', type: 'former' },
  ]},
  { domain: 'datadoghq.com', aliases: [
    { value: 'Datadog', type: 'brand' }, { value: 'Datadog, Inc.', type: 'legal' }, { value: 'DDOG', type: 'ticker' },
    { value: 'Datadog HQ', type: 'dba' },
  ]},
  { domain: 'notion.so', aliases: [
    { value: 'Notion', type: 'brand' }, { value: 'Notion Labs', type: 'legal' }, { value: 'Notion Labs, Inc.', type: 'legal' },
    { value: 'Notion HQ', type: 'dba' },
  ]},
  { domain: 'figma.com', aliases: [
    { value: 'Figma', type: 'brand' }, { value: 'Figma, Inc.', type: 'legal' }, { value: 'FIG', type: 'ticker' },
  ]},
  { domain: 'zomato.in', aliases: [
    { value: 'Zomato', type: 'brand' }, { value: 'Zomato Limited', type: 'legal' }, { value: 'Eternal Limited', type: 'former' },
    { value: 'Foodiebay', type: 'former' },
  ]},
  { domain: 'vercel.com', aliases: [
    { value: 'Vercel', type: 'brand' }, { value: 'Vercel Inc.', type: 'legal' }, { value: 'ZEIT', type: 'former' },
    { value: 'Vercel Labs', type: 'dba' },
  ]},
  { domain: 'acme.com', aliases: [
    { value: 'Acme', type: 'brand' }, { value: 'Acme, Inc.', type: 'legal' }, { value: 'Acme Corporation', type: 'legal' },
    { value: 'ACME Corp', type: 'dba' },
  ]},
];

export interface AliasCandidate {
  name: string;
  domain: string;
  matchedAlias: string;
  aliasType: AliasType;
  similarity: number;
}

export interface CompanyAliasResolution {
  input: string;
  normalizedInput: string;
  matchType: AliasMatchType;
  resolved: { name: string; domain: string; legal_name: string } | null;
  /** The registry alias that matched (or the input, for a domain match). */
  matchedAlias: string;
  aliasType: AliasType | null;
  /** 0..1. */
  confidence: number;
  /** Runner-up candidates, best-first. */
  candidates: AliasCandidate[];
}

const FUZZY_THRESHOLD = 0.86;
const normalize = (s: string) => String(s ?? '').trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
const looksLikeDomain = (s: string) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(String(s ?? '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);

function canonicalOf(domain: string): { name: string; domain: string; legal_name: string } | null {
  const c = resolveCompanyFromDomain(domain);
  if (!c) return null;
  return { name: c.name, domain: c.domain, legal_name: c.legal_name };
}

/**
 * Resolve any company alias (brand / legal / DBA / former / ticker / abbreviation /
 * domain) to its canonical company. Returns matchType 'none' with candidates when
 * nothing clears the fuzzy threshold.
 */
export function resolveCompanyAlias(query: string): CompanyAliasResolution {
  const input = String(query ?? '');
  const nq = normalize(input);
  const base: Omit<CompanyAliasResolution, 'matchType' | 'resolved' | 'matchedAlias' | 'aliasType' | 'confidence' | 'candidates'> = {
    input, normalizedInput: nq,
  };

  if (!nq) {
    return { ...base, matchType: 'none', resolved: null, matchedAlias: '', aliasType: null, confidence: 0, candidates: [] };
  }

  // 1. Domain input → resolve directly.
  if (looksLikeDomain(input)) {
    const canon = canonicalOf(input);
    if (canon) {
      return { ...base, matchType: 'domain', resolved: canon, matchedAlias: canon.domain, aliasType: 'domain', confidence: 0.99, candidates: [] };
    }
  }

  // 2/3. Score every registry alias (plus the canonical name) by similarity.
  const scored: AliasCandidate[] = [];
  REGISTRY.forEach((entry) => {
    const canon = canonicalOf(entry.domain);
    if (!canon) return;
    const aliasList: RegistryAlias[] = [...entry.aliases, { value: canon.name, type: 'brand' }, { value: canon.legal_name, type: 'legal' }];
    let best: { alias: RegistryAlias; sim: number } | null = null;
    aliasList.forEach((a) => {
      const na = normalize(a.value);
      const sim = na === nq ? 1 : jaroWinkler(na, nq);
      if (!best || sim > best.sim) best = { alias: a, sim };
    });
    if (best) {
      const b = best as { alias: RegistryAlias; sim: number };
      scored.push({ name: canon.name, domain: canon.domain, matchedAlias: b.alias.value, aliasType: b.alias.type, similarity: Math.round(b.sim * 1000) / 1000 });
    }
  });
  scored.sort((a, b) => b.similarity - a.similarity);

  const top = scored[0];
  if (top && top.similarity === 1) {
    const canon = canonicalOf(top.domain)!;
    return { ...base, matchType: 'exact', resolved: canon, matchedAlias: top.matchedAlias, aliasType: top.aliasType, confidence: 0.99, candidates: scored.slice(1, 4) };
  }
  if (top && top.similarity >= FUZZY_THRESHOLD) {
    const canon = canonicalOf(top.domain)!;
    return { ...base, matchType: 'fuzzy', resolved: canon, matchedAlias: top.matchedAlias, aliasType: top.aliasType, confidence: top.similarity, candidates: scored.slice(1, 4) };
  }
  return { ...base, matchType: 'none', resolved: null, matchedAlias: '', aliasType: null, confidence: 0, candidates: scored.slice(0, 4) };
}
