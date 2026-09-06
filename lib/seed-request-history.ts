/**
 * Deterministic request-history seed for Match-rate transparency (F-029).
 *
 * A fresh console has no request logs, so the Match Rate dashboard (and Logs /
 * Analytics) would be empty. This generates a realistic, deterministic 7-day
 * lookup history — a believable mix of matches, coverage misses, and errors
 * across every identifier type — so the honest match rate has real substance.
 * No `Math.random`: outcomes and identifiers are fixed; only the timestamps are
 * anchored to "now" (set once at seed time) so the timeframe filters work.
 */

import type { ApiLog } from '@/lib/store';

type Outcome = 'match' | 'miss404' | 'missEmpty' | 'bad' | 'rate';

interface Spec {
  path: string;
  param: string;
  value: string;
  outcome: Outcome;
  /** Compact realistic entity for a match (kept small on purpose). */
  entity?: Record<string, unknown>;
  minutesAgo: number;
}

// A believable week of B2B enrichment traffic. Deterministic and hand-tuned so
// the aggregate lands around a realistic ~80% match rate with honest misses.
const SPECS: Spec[] = [
  // People by email — the bread-and-butter, high match rate.
  { path: '/v1/people', param: 'email', value: 'marcus.lee@stripe.com', outcome: 'match', entity: { full_name: 'Marcus Lee', title: 'Staff Engineer', company: 'Stripe' }, minutesAgo: 22 },
  { path: '/v1/people', param: 'email', value: 'priya.nair@zomato.in', outcome: 'match', entity: { full_name: 'Priya Nair', title: 'Product Lead', company: 'Zomato' }, minutesAgo: 64 },
  { path: '/v1/people', param: 'email', value: 'sarah.kim@datadoghq.com', outcome: 'match', entity: { full_name: 'Sarah Kim', title: 'SRE Manager', company: 'Datadog' }, minutesAgo: 140 },
  { path: '/v1/people', param: 'email', value: 'j.wong@shopify.com', outcome: 'match', entity: { full_name: 'Jordan Wong', title: 'Design Lead', company: 'Shopify' }, minutesAgo: 300 },
  { path: '/v1/people', param: 'email', value: 'unknown.person@obscure-startup.io', outcome: 'miss404', minutesAgo: 410 },
  { path: '/v1/people', param: 'email', value: 'contact@stealthco.xyz', outcome: 'missEmpty', minutesAgo: 900 },
  { path: '/v1/people', param: 'email', value: 'not an email', outcome: 'bad', minutesAgo: 1200 },

  // Social discovery by email.
  { path: '/v1/people/social', param: 'email', value: 'marcus.lee@stripe.com', outcome: 'match', entity: { full_name: 'Marcus Lee', platform_count: 3, profiles: [{ platform: 'LinkedIn' }] }, minutesAgo: 30 },
  { path: '/v1/people/social', param: 'email', value: 'ghost@nowhere.dev', outcome: 'miss404', minutesAgo: 520 },

  // Email → phone (keyed on email).
  { path: '/v1/people/phone', param: 'email', value: 'sarah.kim@datadoghq.com', outcome: 'match', entity: { phone: '+1 415 555 0132', line_type: 'mobile' }, minutesAgo: 155 },
  { path: '/v1/people/phone', param: 'email', value: 'priya.nair@zomato.in', outcome: 'match', entity: { phone: '+91 80 5550 1180', line_type: 'mobile' }, minutesAgo: 610 },
  { path: '/v1/people/phone', param: 'email', value: 'temp@throwaway.io', outcome: 'miss404', minutesAgo: 2100 },

  // Phone → email (keyed on phone).
  { path: '/v1/people/email', param: 'phone', value: '+1 415 555 0132', outcome: 'match', entity: { email: 'marcus.lee@stripe.com' }, minutesAgo: 210 },
  { path: '/v1/people/email', param: 'phone', value: '+1 202 555 9999', outcome: 'miss404', minutesAgo: 1800 },

  // Companies by domain — high match rate.
  { path: '/v1/companies/enrich', param: 'domain', value: 'stripe.com', outcome: 'match', entity: { name: 'Stripe', industry: 'Fintech', employee_count: 8000 }, minutesAgo: 18 },
  { path: '/v1/companies/enrich', param: 'domain', value: 'datadoghq.com', outcome: 'match', entity: { name: 'Datadog', industry: 'Observability', employee_count: 5000 }, minutesAgo: 88 },
  { path: '/v1/companies/enrich', param: 'domain', value: 'shopify.com', outcome: 'match', entity: { name: 'Shopify', industry: 'E-commerce', employee_count: 11000 }, minutesAgo: 260 },
  { path: '/v1/companies/enrich', param: 'domain', value: 'this-domain-does-not-exist-42.com', outcome: 'miss404', minutesAgo: 720 },

  // Firmographics by domain.
  { path: '/v1/companies/firmographics', param: 'domain', value: 'stripe.com', outcome: 'match', entity: { naics_code: '522320', sic_code: '7372' }, minutesAgo: 44 },
  { path: '/v1/companies/firmographics', param: 'domain', value: 'zomato.in', outcome: 'match', entity: { naics_code: '722513', sic_code: '5812' }, minutesAgo: 480 },

  // Reverse IP → company.
  { path: '/v1/enrichment/ip', param: 'ip', value: '52.38.104.17', outcome: 'match', entity: { organization: 'Amazon AWS', is_corporate: true }, minutesAgo: 120 },
  { path: '/v1/enrichment/ip', param: 'ip', value: '104.18.32.7', outcome: 'match', entity: { organization: 'Cloudflare', is_corporate: true }, minutesAgo: 340 },
  { path: '/v1/enrichment/ip', param: 'ip', value: '73.223.11.9', outcome: 'missEmpty', minutesAgo: 1500 },

  // LinkedIn → profile.
  { path: '/v1/people/linkedin', param: 'linkedin_url', value: 'linkedin.com/in/marcuslee', outcome: 'match', entity: { full_name: 'Marcus Lee', title: 'Staff Engineer' }, minutesAgo: 200 },
  { path: '/v1/people/linkedin', param: 'linkedin_url', value: 'linkedin.com/in/deleted-profile-xyz', outcome: 'miss404', minutesAgo: 2600 },

  // CIN → company (India registry).
  { path: '/v1/companies/cin', param: 'cin', value: 'L72900KA2020PLC123456', outcome: 'match', entity: { legal_name: 'Zomato Media Pvt Ltd' }, minutesAgo: 380 },

  // Rate-limited burst (excluded from match rate).
  { path: '/v1/people', param: 'email', value: 'burst@acme.com', outcome: 'rate', minutesAgo: 500 },

  // Transforms — always return; excluded from coverage.
  { path: '/v1/email/verify', param: 'email', value: 'john@datadoghq.com', outcome: 'match', entity: { verdict: 'deliverable', score: 100 }, minutesAgo: 12 },
  { path: '/v1/titles/normalize', param: 'title', value: 'Sr. SWE II', outcome: 'match', entity: { canonical_title: 'Senior Software Engineer', seniority: 'Senior' }, minutesAgo: 70 },
];

const REGION_IP = '::1';

function makeLog(spec: Spec, env: 'sandbox' | 'live', now: number, i: number): ApiLog {
  const ts = new Date(now - spec.minutesAgo * 60_000).toISOString();
  const id = `seed_${env}_${i}`;
  const parameters: Record<string, unknown> = { [spec.param]: spec.value };
  const base = {
    id, environment: env, timestamp: ts, method: 'GET', path: spec.path,
    ip: REGION_IP, request: { parameters },
  };

  switch (spec.outcome) {
    case 'match':
      return { ...base, status: 200, duration: 40 + ((i * 7) % 90), response: { success: true, data: spec.entity ?? { matched: true, value: spec.value } } };
    case 'missEmpty':
      return { ...base, status: 200, duration: 30 + ((i * 5) % 70), response: { success: true, data: {} } };
    case 'miss404':
      return { ...base, status: 404, duration: 25 + ((i * 5) % 60), response: { success: false, error: { code: 'NOT_FOUND', message: `No record found for ${spec.value}.` } } };
    case 'bad':
      return { ...base, status: 400, duration: 8 + (i % 12), response: { success: false, error: { code: 'INVALID_PARAMETERS', message: `Invalid ${spec.param}: ${spec.value}` } } };
    case 'rate':
      return { ...base, status: 429, duration: 6 + (i % 8), response: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } } };
  }
}

/**
 * Build the deterministic seed history for an environment. Sorted newest-first
 * to match how the live logger prepends entries.
 */
export function generateSeedRequestHistory(env: 'sandbox' | 'live'): ApiLog[] {
  const now = Date.now();
  return SPECS
    .map((spec, i) => makeLog(spec, env, now, i))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** How many of these seeds are genuine coverage lookups (for the sparse-check threshold). */
export const SEED_LOOKUP_COUNT = SPECS.filter(
  (s) => !s.path.includes('/email/verify') && !s.path.includes('/titles/normalize') && !s.path.includes('/email/domain-auth'),
).length;
