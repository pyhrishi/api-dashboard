/**
 * Upstream registry (F-066) — the real data providers behind each endpoint.
 *
 * Enrichment isn't one monolithic backend: an email verify hits an SMTP prober, a
 * CIN lookup hits the MCA registry, a phone append hits a carrier HLR. When one of
 * those upstreams degrades, only the endpoints that depend on it should shed load —
 * not the whole API. This module names the upstreams (aligned with the F-043
 * source-catalog providers) and maps every endpoint to the upstream it depends on,
 * so the circuit breaker (circuitBreaker.ts) can trip per-upstream.
 *
 * Pure data + lookups. No `Math.random`, no state.
 */

export type UpstreamCategory = 'first-party' | 'registry' | 'partner' | 'derived';

export interface UpstreamProvider {
  id: string;
  name: string;
  category: UpstreamCategory;
  description: string;
}

export const UPSTREAMS: UpstreamProvider[] = [
  { id: 'professional-graph', name: 'Professional Graph', category: 'first-party', description: 'People, roles, seniority, and tenure from the contact graph.' },
  { id: 'company-graph', name: 'Company Graph', category: 'first-party', description: 'Firmographics, tech stack, offices, and headcount.' },
  { id: 'smtp-verification', name: 'SMTP Verification', category: 'first-party', description: 'Live MX + mailbox handshake for deliverability and catch-all.' },
  { id: 'dns-resolver', name: 'DNS Resolver', category: 'first-party', description: 'MX / SPF / DKIM / DMARC record resolution.' },
  { id: 'carrier-hlr', name: 'Carrier HLR', category: 'partner', description: 'Home Location Register + line-type lookups via carrier partners.' },
  { id: 'mca-registry', name: 'MCA Registry', category: 'registry', description: 'India Ministry of Corporate Affairs CIN/DIN records.' },
  { id: 'funding-database', name: 'Funding Database', category: 'partner', description: 'Rounds, investors, and valuations from filings + press.' },
  { id: 'news-monitor', name: 'News & Filings Monitor', category: 'partner', description: 'Company trigger events from press and filings.' },
  { id: 'social-graph', name: 'Social Graph', category: 'partner', description: 'Public professional profiles cross-matched to one identity.' },
  { id: 'domain-intelligence', name: 'Domain Intelligence', category: 'partner', description: 'Disposable / free-provider and catch-all domain lists.' },
  { id: 'ip-intelligence', name: 'IP Intelligence', category: 'partner', description: 'Reverse-IP company resolution.' },
  { id: 'zinbit-core', name: 'Zinbit Core', category: 'first-party', description: 'Deterministic in-house ops — normalization, matching, dedup, IDs.' },
];

const UPSTREAM_IDS = new Set(UPSTREAMS.map((u) => u.id));

/** Every endpoint's primary upstream. Unlisted endpoints fall back to Zinbit Core. */
const ENDPOINT_UPSTREAM: Record<string, string> = {
  // People
  'people-search': 'professional-graph',
  'v2-people-search': 'professional-graph',
  'people-ai-search': 'professional-graph',
  'linkedin-to-profile': 'professional-graph',
  'linkedin-to-contact': 'professional-graph',
  'contact-to-linkedin': 'professional-graph',
  'hashed-email': 'professional-graph',
  'email-to-social': 'social-graph',
  // Phone
  'email-to-phone': 'carrier-hlr',
  'phone-to-email': 'carrier-hlr',
  'din-to-phone': 'carrier-hlr',
  // Company
  'company-enrich': 'company-graph',
  'firmographic-append': 'company-graph',
  'technographic-detect': 'company-graph',
  'company-offices': 'company-graph',
  'domain-to-linkedin': 'company-graph',
  'reverse-enrichment': 'company-graph',
  'identity-resolve': 'company-graph',
  'batch-company-enrich': 'company-graph',
  'batch-enrich': 'company-graph',
  'enrich-stream': 'company-graph',
  'ip-to-company': 'ip-intelligence',
  // Registry
  'domain-to-cin': 'mca-registry',
  'cin-to-company-data': 'mca-registry',
  // Signals
  'funding-signals': 'funding-database',
  'company-news': 'news-monitor',
  // Email
  'email-verify': 'smtp-verification',
  'catch-all-detect': 'smtp-verification',
  'record-validate': 'smtp-verification',
  'email-domain-auth': 'dns-resolver',
  'email-disposable': 'domain-intelligence',
  // Deterministic in-house
  'title-normalize': 'zinbit-core',
  'name-canonicalize': 'zinbit-core',
  'text-normalize': 'zinbit-core',
  'fuzzy-match': 'zinbit-core',
  'records-dedupe': 'zinbit-core',
  'identity-zid': 'zinbit-core',
};

const DEFAULT_UPSTREAM = 'zinbit-core';

/** The upstream an endpoint depends on (defaults to Zinbit Core). */
export function upstreamForEndpoint(endpointId: string): string {
  const id = ENDPOINT_UPSTREAM[endpointId];
  return id && UPSTREAM_IDS.has(id) ? id : DEFAULT_UPSTREAM;
}

export function getUpstream(id: string): UpstreamProvider | undefined {
  return UPSTREAMS.find((u) => u.id === id);
}

/** Which endpoint ids a given upstream powers — for the console's "powers" list. */
export function endpointsForUpstream(id: string): string[] {
  return Object.keys(ENDPOINT_UPSTREAM).filter((ep) => ENDPOINT_UPSTREAM[ep] === id);
}
