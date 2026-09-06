/**
 * Dark-launch preview endpoints (F-081) — server resolvers.
 *
 * Each preview endpoint's response, mapped to the SAME deterministic resolvers
 * the GA surfaces use where an equivalent exists (so a preview never disagrees
 * with production), plus one brand-new capability (buying-signals) with its own
 * deterministic model. Imported only by the gated route + jest — never the
 * client console.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolveCompanyHierarchy } from '@/lib/company-hierarchy';

export type PreviewResolver = (arg: string) => object | null;

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const BENCH_NOW = Date.UTC(2026, 8, 6);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

interface BuyingSignal {
  type: string;
  label: string;
  strength: number; // 0..1
  detected: string; // ISO date
}

const SIGNAL_POOL: { type: string; label: string; weight: number }[] = [
  { type: 'hiring_surge', label: 'Hiring surge in go-to-market roles', weight: 0.8 },
  { type: 'new_funding', label: 'New funding round announced', weight: 0.9 },
  { type: 'exec_hire', label: 'New executive hire (VP+/C-level)', weight: 0.7 },
  { type: 'tech_adoption', label: 'Adopted a complementary technology', weight: 0.6 },
  { type: 'expansion', label: 'Opened a new office / region', weight: 0.55 },
  { type: 'web_activity', label: 'Elevated research activity on your category', weight: 0.5 },
];

/** Deterministic buying-intent signals for a domain — the alpha capability. */
function buyingSignals(domain: string): { domain: string; intent_index: number; signals: BuyingSignal[] } | null {
  const d = domain.trim().toLowerCase();
  if (!d || !d.includes('.')) return null;
  const seed = hash(`buying:${d}`);
  const count = 2 + (seed % 3); // 2..4 signals
  const signals: BuyingSignal[] = [];
  for (let i = 0; i < count; i++) {
    const pick = SIGNAL_POOL[hash(`sig:${d}:${i}`) % SIGNAL_POOL.length];
    if (signals.some((s) => s.type === pick.type)) continue;
    const strength = Math.round((pick.weight - 0.15 + (hash(`str:${d}:${i}`) % 30) / 100) * 100) / 100;
    const ageDays = hash(`age:${d}:${i}`) % 30;
    signals.push({ type: pick.type, label: pick.label, strength: Math.max(0, Math.min(1, strength)), detected: iso(BENCH_NOW - ageDays * 86_400_000) });
  }
  // Intent index: weighted mean of signal strengths, scaled 0-100.
  const intent = signals.length ? signals.reduce((n, s) => n + s.strength, 0) / signals.length : 0;
  return {
    domain: d,
    intent_index: Math.round(intent * 100),
    signals: signals.sort((a, b) => b.strength - a.strength),
  };
}

export const PREVIEW_RESOLVERS: Record<string, PreviewResolver> = {
  'people-search-v2': (email) => {
    const person = resolvePersonFromEmail(email);
    if (!person) return null;
    const employer = person.company_domain ? resolveCompanyFromDomain(person.company_domain) : null;
    return { ...person, employer };
  },
  'company-graph-v2': (domain) => {
    const company = resolveCompanyFromDomain(domain);
    if (!company) return null;
    const family = resolveCompanyHierarchy(domain);
    return { ...company, corporate_family: family };
  },
  'buying-signals': (domain) => buyingSignals(domain),
};
