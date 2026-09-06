/**
 * Source attribution (F-043) — provider catalog + attribution grouping, SSOT.
 *
 * Every enrichment result already carries per-field provenance (field / source /
 * signal / confidence). This module names the *provider* behind each provenance
 * source — its category (first-party graph, government registry, partner feed, or
 * a derived inference), a reliability rating, and the license / lawful basis the
 * data is used under — and groups a result's provenance BY provider, so a result
 * can cite exactly which provider supplied each field. Pure and deterministic —
 * it only re-shapes provenance the resolvers already produced, so attribution can
 * never contradict the underlying data. No `Math.random`.
 */

export type SourceCategory = 'first-party' | 'registry' | 'partner' | 'derived';

export interface SourceProvider {
  /** Canonical provider name shown to the user. */
  name: string;
  category: SourceCategory;
  /** 0..1 reliability of this provider's data. */
  reliability: number;
  /** License / lawful basis the data is used under. */
  license: string;
  /** One-line description of what the provider supplies. */
  description: string;
}

// The provenance `source` strings the resolvers emit → their real provider.
// Unlisted sources fall back to a derived-inference provider (see resolveProvider).
const CATALOG: Record<string, SourceProvider> = {
  'SMTP verification': { name: 'SMTP Verification', category: 'first-party', reliability: 0.97, license: 'Legitimate interest (B2B)', description: 'Live MX + mailbox handshake against the mail server.' },
  'Carrier HLR lookup': { name: 'Carrier HLR', category: 'partner', reliability: 0.93, license: 'Carrier data agreement', description: 'Home Location Register lookup via carrier partners.' },
  'Number intelligence': { name: 'Number Intelligence', category: 'partner', reliability: 0.9, license: 'Carrier data agreement', description: 'Line-type and carrier metadata for a phone number.' },
  'DNC registry check': { name: 'DNC Registry', category: 'registry', reliability: 0.97, license: 'Public registry', description: 'National Do-Not-Call registry membership.' },
  'Domain registry': { name: 'WHOIS Registry', category: 'registry', reliability: 0.95, license: 'Public registry', description: 'WHOIS + domain org records.' },
  'Funding database': { name: 'Funding Database', category: 'partner', reliability: 0.85, license: 'Data partner license', description: 'Rounds, investors, and valuations from filings + press.' },
  'Investor filings': { name: 'Investor Filings', category: 'registry', reliability: 0.82, license: 'Public filings', description: 'Regulatory investment disclosures.' },
  'Directory match': { name: 'Corporate Directory', category: 'first-party', reliability: 0.94, license: 'First-party graph', description: 'Zinbit corporate directory records.' },
  'Professional graph': { name: 'Professional Graph', category: 'first-party', reliability: 0.86, license: 'First-party graph', description: 'Role, seniority, and tenure from the contact graph.' },
  'Social graph': { name: 'Social Graph', category: 'partner', reliability: 0.8, license: 'Platform ToS-compliant', description: 'Public professional profiles cross-matched to one identity.' },
  'Username correlation': { name: 'Username Correlation', category: 'derived', reliability: 0.7, license: 'Derived signal', description: 'Cross-platform handle correlation.' },
  'Public activity scan': { name: 'Public Activity Scan', category: 'partner', reliability: 0.82, license: 'Public web', description: 'Public posts and commits confirming live accounts.' },
  'DNS resolver': { name: 'DNS Resolver', category: 'first-party', reliability: 0.97, license: 'Public DNS', description: 'MX / SPF / DKIM / DMARC record resolution.' },
  'SMTP handshake': { name: 'SMTP Handshake', category: 'first-party', reliability: 0.9, license: 'Legitimate interest (B2B)', description: 'RCPT-TO mailbox probe.' },
  'Domain intelligence': { name: 'Domain Intelligence', category: 'partner', reliability: 0.93, license: 'Data partner license', description: 'Disposable / free-provider domain lists.' },
  'MCA registry': { name: 'MCA Registry', category: 'registry', reliability: 0.98, license: 'Government registry (IDS)', description: 'India Ministry of Corporate Affairs CIN/DIN records.' },
  'Company graph': { name: 'Company Graph', category: 'first-party', reliability: 0.9, license: 'First-party graph', description: 'Firmographics, tech stack, and headcount.' },
  'News & filings monitor': { name: 'News & Filings Monitor', category: 'partner', reliability: 0.8, license: 'Public web + filings', description: 'Company trigger events from press and filings.' },
  'Local-part inference': { name: 'Local-part Inference', category: 'derived', reliability: 0.7, license: 'Derived signal', description: 'Name derived from the email handle.' },
  'Freemail classifier': { name: 'Freemail Classifier', category: 'derived', reliability: 0.6, license: 'Derived signal', description: 'Consumer-mailbox domain classification.' },
  'Jaro-Winkler match': { name: 'Fuzzy Match Engine', category: 'derived', reliability: 0.75, license: 'Derived signal', description: 'String-similarity scoring for name/company variants.' },
  'Company reconciliation': { name: 'Company Reconciliation', category: 'derived', reliability: 0.78, license: 'Derived signal', description: 'Messy company name resolved to a known company.' },
  'User-reported correction': { name: 'Customer Correction', category: 'first-party', reliability: 0.96, license: 'Customer-submitted (reviewed)', description: 'A value corrected by a customer and accepted on review (F-046).' },
};

const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));

/** Resolve a provenance `source` string to a catalogued provider (derived fallback). */
export function resolveProvider(source: string): SourceProvider {
  const hit = CATALOG[source];
  if (hit) return hit;
  const s = source.toLowerCase();
  const category: SourceCategory = /registry|filing|mca|whois|government/.test(s) ? 'registry'
    : /graph|directory|dns|smtp|first.?party/.test(s) ? 'first-party'
    : /derived|inference|correlation|classifier|match|reconcil/.test(s) ? 'derived'
    : 'partner';
  return {
    name: source || 'Unknown source',
    category,
    reliability: category === 'registry' ? 0.9 : category === 'first-party' ? 0.88 : category === 'derived' ? 0.7 : 0.82,
    license: category === 'registry' ? 'Public registry' : category === 'first-party' ? 'First-party graph' : category === 'derived' ? 'Derived signal' : 'Data partner license',
    description: `Fields sourced via ${source || 'an unspecified provider'}.`,
  };
}

export interface AttributedField {
  field: string;
  signal: string;
  confidence: number;
}
export interface AttributedProvider {
  provider: SourceProvider;
  fields: AttributedField[];
  /** Mean confidence of the fields this provider supplied. */
  avgConfidence: number;
}
export interface SourceAttribution {
  providers: AttributedProvider[];
  providerCount: number;
  fieldCount: number;
  /** Counts by category, for a quick sourcing profile. */
  byCategory: { category: SourceCategory; count: number }[];
}

interface ProvenanceEntry { field: string; source: string; signal: string; confidence: number; }

/** Group a result's provenance by named provider. Returns null when there's nothing to attribute. */
export function attributeSources(provenance: ProvenanceEntry[] | undefined): SourceAttribution | null {
  if (!provenance || provenance.length === 0) return null;

  const byName = new Map<string, AttributedProvider>();
  for (const p of provenance) {
    const provider = resolveProvider(p.source);
    const entry = byName.get(provider.name) ?? { provider, fields: [], avgConfidence: 0 };
    entry.fields.push({ field: p.field, signal: p.signal, confidence: typeof p.confidence === 'number' ? p.confidence : 0 });
    byName.set(provider.name, entry);
  }

  const providers = Array.from(byName.values()).map((entry) => {
    const avg = entry.fields.reduce((n, f) => n + f.confidence, 0) / entry.fields.length;
    return { ...entry, avgConfidence: clamp01(avg) };
  }).sort((a, b) => b.fields.length - a.fields.length || b.provider.reliability - a.provider.reliability);

  const catCounts = new Map<SourceCategory, number>();
  for (const pr of providers) catCounts.set(pr.provider.category, (catCounts.get(pr.provider.category) ?? 0) + 1);
  const byCategory = Array.from(catCounts.entries()).map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    providers,
    providerCount: providers.length,
    fieldCount: provenance.length,
    byCategory,
  };
}
