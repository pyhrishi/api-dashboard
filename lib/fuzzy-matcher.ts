/**
 * Probabilistic fuzzy matching (F-024) — deterministic matcher, single source of truth.
 *
 * Takes a messy (name, company) — typos, nicknames, spelling variants — and scores
 * the likely people it resolves to, each with a match probability and the per-field
 * name/company similarity behind it. Uses a real Jaro-Winkler string-similarity
 * metric (great for typos and transpositions) plus a small nickname/typo
 * normalization pass, and generates candidate records deterministically from the
 * matched company. No `Math.random` — the same query always scores the same.
 */

import { canonicalNameString } from '@/lib/name-canonicalizer';

export type FuzzyVerdict = 'strong' | 'likely' | 'weak' | 'no_match';

export interface FuzzyCandidate {
  full_name: string;
  title: string;
  company: string;
  company_domain: string;
  email: string;
  /** 0..1 Jaro-Winkler similarity of the query name to this candidate. */
  name_similarity: number;
  /** 0..1 similarity of the query company to this candidate's company. */
  company_similarity: number;
  /** Weighted 0..1 probability this candidate is the intended person. */
  match_probability: number;
  matched_on: string[];
}

export interface FuzzyProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface FuzzyMatchResult {
  query: { name: string; company: string };
  /** Canonicalized interpretation of the query. */
  interpreted: { name: string; company: string };
  verdict: FuzzyVerdict;
  best_match: FuzzyCandidate | null;
  candidates: FuzzyCandidate[];
  confidence: number;
  provenance: FuzzyProvenance[];
}

// ── Jaro-Winkler similarity ──────────────────────────────────────────────────
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

/** Jaro-Winkler: Jaro with a bonus for a common prefix (typo/variant friendly). */
export function jaroWinkler(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return Math.round((j + prefix * 0.1 * (1 - j)) * 1000) / 1000;
}

// Name normalization is the name-canonicalizer's job (F-030) — one source of
// truth, so fuzzy match and canonicalization agree on every nickname and typo.
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const canonicalName = (raw: string): string => canonicalNameString(raw) || titleCase(raw.trim().toLowerCase());

// Known companies to fuzzy-resolve a messy company name against.
const KNOWN_COMPANIES: { name: string; domain: string }[] = [
  { name: 'Stripe', domain: 'stripe.com' }, { name: 'Datadog', domain: 'datadoghq.com' },
  { name: 'Shopify', domain: 'shopify.com' }, { name: 'Notion', domain: 'notion.so' },
  { name: 'Figma', domain: 'figma.com' }, { name: 'Vercel', domain: 'vercel.com' },
  { name: 'Airbnb', domain: 'airbnb.com' }, { name: 'Zomato', domain: 'zomato.in' },
  { name: 'Databricks', domain: 'databricks.com' }, { name: 'Snowflake', domain: 'snowflake.com' },
  { name: 'Atlassian', domain: 'atlassian.com' }, { name: 'Salesforce', domain: 'salesforce.com' },
  { name: 'HubSpot', domain: 'hubspot.com' }, { name: 'Twilio', domain: 'twilio.com' },
];

const TITLES = ['VP of Sales', 'Account Executive', 'Engineering Manager', 'Product Lead', 'Head of Marketing', 'Solutions Architect', 'Senior Recruiter'];
const DECOY_FIRST = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie'];
const DECOY_LAST = ['Patel', 'Nguyen', 'Garcia', 'Kim', 'Rossi', 'Okafor', 'Andersson'];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const emailFor = (name: string, domain: string) => `${name.toLowerCase().replace(/\s+/g, '.')}@${domain}`;

function verdictFor(p: number): FuzzyVerdict {
  if (p >= 0.9) return 'strong';
  if (p >= 0.75) return 'likely';
  if (p >= 0.55) return 'weak';
  return 'no_match';
}

export function fuzzyMatch(rawName: string, rawCompany: string): FuzzyMatchResult | null {
  const name = String(rawName || '').trim();
  const company = String(rawCompany || '').trim();
  if (!name) return null;

  // 1. Resolve the company by best Jaro-Winkler match against known companies.
  let bestCompany = KNOWN_COMPANIES[0];
  let companySim = 0;
  if (company) {
    for (const c of KNOWN_COMPANIES) {
      const sim = jaroWinkler(company, c.name);
      if (sim > companySim) { companySim = sim; bestCompany = c; }
    }
  }
  const companyKnown = companySim >= 0.72;
  const resolvedCompany = companyKnown ? bestCompany.name : titleCase(company || 'Unknown');
  const resolvedDomain = companyKnown ? bestCompany.domain : `${(company || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  // A verified company corroborates strongly; an unverifiable one can't, so it
  // drags confidence down honestly (a real match needs a real, reconciled company).
  const effectiveCompanySim = !company ? 0.5 : companyKnown ? companySim : 0.3;

  // 2. Primary candidate — the canonical reading of the query at the resolved company.
  const canonical = canonicalName(name);
  const primaryNameSim = jaroWinkler(name, canonical);
  const seed = hash(`${canonical.toLowerCase()}|${resolvedDomain}`);
  const primary: FuzzyCandidate = {
    full_name: canonical,
    title: TITLES[seed % TITLES.length],
    company: resolvedCompany,
    company_domain: resolvedDomain,
    email: emailFor(canonical, resolvedDomain),
    name_similarity: primaryNameSim,
    company_similarity: effectiveCompanySim,
    match_probability: Math.round((primaryNameSim * 0.62 + effectiveCompanySim * 0.38) * 1000) / 1000,
    matched_on: [primaryNameSim >= 0.85 ? 'name' : 'name~', companyKnown ? 'company' : 'company~'].filter(Boolean),
  };

  // 3. Decoys — other people at the same company, scored honestly (lower name sim).
  const candidates: FuzzyCandidate[] = [primary];
  const decoyCount = 2;
  for (let i = 0; i < decoyCount; i++) {
    const dh = hash(`${resolvedDomain}|decoy|${i}`);
    const dn = `${DECOY_FIRST[dh % DECOY_FIRST.length]} ${DECOY_LAST[(dh >>> 8) % DECOY_LAST.length]}`;
    if (dn === canonical) continue;
    const nameSim = jaroWinkler(name, dn);
    candidates.push({
      full_name: dn,
      title: TITLES[(dh >>> 4) % TITLES.length],
      company: resolvedCompany,
      company_domain: resolvedDomain,
      email: emailFor(dn, resolvedDomain),
      name_similarity: nameSim,
      company_similarity: effectiveCompanySim,
      match_probability: Math.round((nameSim * 0.62 + effectiveCompanySim * 0.38) * 1000) / 1000,
      matched_on: ['company' + (companyKnown ? '' : '~')],
    });
  }
  candidates.sort((a, b) => b.match_probability - a.match_probability);

  const best = candidates[0];
  const verdict = verdictFor(best.match_probability);

  return {
    query: { name, company },
    interpreted: { name: canonical, company: resolvedCompany },
    verdict,
    best_match: verdict === 'no_match' ? null : best,
    candidates,
    confidence: best.match_probability,
    provenance: [
      { field: 'name', source: 'Jaro-Winkler match', signal: `Query name scored ${Math.round(best.name_similarity * 100)}% against "${best.full_name}"`, confidence: best.name_similarity },
      { field: 'company', source: 'Company reconciliation', signal: companyKnown ? `Matched "${company}" → ${resolvedCompany} (${Math.round(companySim * 100)}%)` : 'Company not in the known set — matched on name only', confidence: effectiveCompanySim },
    ],
  };
}
