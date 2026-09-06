/**
 * Company news & event feed (F-015) — deterministic resolver, single source of truth.
 *
 * Turns a company domain into a chronological feed of trigger events — funding,
 * leadership changes, expansion, product launches, M&A, partnerships, awards, and
 * hiring surges — each with a type, date, headline, source, sentiment, and an
 * importance score. Built on `resolveCompanyFromDomain` for the company facts and
 * *reuses* `resolveFundingForDomain`, so the company's real funding rounds appear
 * here as the same dated funding events — the feed can never disagree with the
 * Funding Signals view. Deterministic per domain (seeded RNG, no `Math.random`);
 * personal-email domains resolve to null (no company).
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolveFundingForDomain } from '@/lib/funding-resolver';

export type CompanyEventType =
  | 'funding' | 'leadership' | 'expansion' | 'product' | 'acquisition'
  | 'partnership' | 'award' | 'hiring';
export type EventSentiment = 'positive' | 'neutral' | 'negative';

export interface CompanyEvent {
  id: string;
  type: CompanyEventType;
  date: string; // YYYY-MM-DD
  headline: string;
  summary: string;
  source: string;
  sentiment: EventSentiment;
  /** 0..100 — how material the event is for a GTM trigger. */
  importance: number;
}

export interface NewsProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface CompanyNewsFeed {
  domain: string;
  company: string;
  events: CompanyEvent[];
  event_count: number;
  latest_event: CompanyEvent | null;
  /** Count of events by type, for the feed's filter chips. */
  by_type: Record<string, number>;
  confidence: number;
  last_verified: string;
  provenance: NewsProvenance[];
}

const NEWS_SOURCES = ['TechCrunch', 'Bloomberg', 'Reuters', 'The Information', 'Business Wire', 'company blog', 'PR Newswire', 'Forbes'];
const EXEC_TITLES = ['CEO', 'CFO', 'CTO', 'CRO', 'CMO', 'Chief Product Officer', 'VP of Engineering', 'Head of Sales'];
const EXEC_NAMES = ['Priya Raman', 'Daniel Okoye', 'Sofia Martinez', 'Wei Chen', 'Amara Nwosu', 'Lucas Bianchi', 'Hana Suzuki', 'Omar Haddad'];
const REGIONS = ['London', 'Singapore', 'Bengaluru', 'New York', 'Berlin', 'São Paulo', 'Sydney', 'Toronto', 'Dubai'];
const PRODUCT_NOUNS = ['platform', 'API', 'analytics suite', 'mobile app', 'enterprise tier', 'AI assistant', 'integration marketplace'];
const ACQUIRERS = ['a strategic buyer', 'a private-equity consortium', 'a larger industry player'];

function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${n.toLocaleString()}`);

const DEMO_NOW = Date.UTC(2026, 8, 1); // 2026-09-01
function normalizeDomain(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export function resolveCompanyNews(rawDomain: string): CompanyNewsFeed | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company || company.is_personal_domain) return null;

  const domain = normalizeDomain(rawDomain);
  const rng = makeRng(hashString(`news:${domain}`));
  const name = company.name;
  const events: CompanyEvent[] = [];
  let seq = 0;
  const addEvent = (e: Omit<CompanyEvent, 'id'>) => events.push({ ...e, id: `evt_${domain.replace(/\W/g, '')}_${seq++}` });

  // 1. Funding events — reuse the funding resolver so rounds match Funding Signals exactly.
  const funding = resolveFundingForDomain(domain);
  if (funding?.has_funding) {
    for (const round of funding.rounds) {
      addEvent({
        type: 'funding', date: round.date,
        headline: `${name} raises ${money(round.amount_usd)} ${round.stage}`,
        summary: `Led by ${round.lead_investor}${round.valuation_usd ? `, at a ${money(round.valuation_usd)} post-money valuation` : ''}.`,
        source: pick(NEWS_SOURCES, rng), sentiment: 'positive',
        importance: 78 + Math.floor(rng() * 18),
      });
    }
  }

  // 2. Leadership changes — 1-2 execs in the last ~2 years.
  const leadershipCount = 1 + (hashString(`lead:${domain}`) % 2);
  for (let i = 0; i < leadershipCount; i++) {
    const title = pick(EXEC_TITLES, rng);
    const person = pick(EXEC_NAMES, rng);
    const daysAgo = 40 + Math.floor(rng() * 640);
    addEvent({
      type: 'leadership', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
      headline: `${name} appoints ${person} as ${title}`,
      summary: `${person} joins ${name}'s leadership team as ${title}, signaling investment in the function.`,
      source: pick(NEWS_SOURCES, rng), sentiment: 'positive',
      importance: 55 + Math.floor(rng() * 25),
    });
  }

  // 3. Expansion — a new office/region (for companies past seed).
  if (company.employee_count > 60) {
    const region = pick(REGIONS.filter((r) => !company.hq_city.includes(r)), rng);
    const daysAgo = 30 + Math.floor(rng() * 500);
    addEvent({
      type: 'expansion', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
      headline: `${name} opens a new office in ${region}`,
      summary: `${name} expands its ${company.industry.toLowerCase()} operations with a new ${region} hub.`,
      source: pick(NEWS_SOURCES, rng), sentiment: 'positive',
      importance: 60 + Math.floor(rng() * 20),
    });
  }

  // 4. Product launch.
  {
    const noun = pick(PRODUCT_NOUNS, rng);
    const daysAgo = 20 + Math.floor(rng() * 420);
    addEvent({
      type: 'product', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
      headline: `${name} launches a new ${noun}`,
      summary: `${name} ships a new ${noun}, extending its ${company.sub_industry.toLowerCase()} offering.`,
      source: pick(NEWS_SOURCES, rng), sentiment: 'positive',
      importance: 50 + Math.floor(rng() * 22),
    });
  }

  // 5. Partnership.
  {
    const partner = pick(['a Fortune 500 retailer', 'a leading cloud provider', 'a global systems integrator', 'a major bank'], rng);
    const daysAgo = 25 + Math.floor(rng() * 500);
    addEvent({
      type: 'partnership', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
      headline: `${name} partners with ${partner}`,
      summary: `A new strategic partnership expands ${name}'s go-to-market reach.`,
      source: pick(NEWS_SOURCES, rng), sentiment: 'neutral',
      importance: 45 + Math.floor(rng() * 20),
    });
  }

  // 6. Occasional M&A (acquired companies, or acquirers) — deterministic ~22%.
  if ((hashString(`ma:${domain}`) % 100) < 22) {
    const isTarget = company.funding_stage === 'Acquired';
    const daysAgo = 15 + Math.floor(rng() * 300);
    addEvent(isTarget
      ? { type: 'acquisition', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
          headline: `${name} to be acquired by ${pick(ACQUIRERS, rng)}`,
          summary: `${name} enters an agreement to be acquired, subject to customary closing conditions.`,
          source: pick(NEWS_SOURCES, rng), sentiment: 'neutral', importance: 88 + Math.floor(rng() * 10) }
      : { type: 'acquisition', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
          headline: `${name} acquires a smaller ${company.industry.toLowerCase()} startup`,
          summary: `${name} makes a tuck-in acquisition to accelerate its roadmap.`,
          source: pick(NEWS_SOURCES, rng), sentiment: 'positive', importance: 72 + Math.floor(rng() * 15) });
  }

  // 7. Hiring surge — larger companies.
  if (company.employee_count > 200) {
    const daysAgo = 10 + Math.floor(rng() * 120);
    const openings = 20 + Math.floor(rng() * 180);
    addEvent({
      type: 'hiring', date: new Date(DEMO_NOW - daysAgo * 86400000).toISOString().slice(0, 10),
      headline: `${name} is hiring — ${openings} open roles`,
      summary: `${name} has ramped hiring across engineering and go-to-market — a growth signal.`,
      source: 'careers page', sentiment: 'positive',
      importance: 40 + Math.floor(rng() * 18),
    });
  }

  // Newest first.
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const by_type: Record<string, number> = {};
  for (const e of events) by_type[e.type] = (by_type[e.type] ?? 0) + 1;

  return {
    domain: company.domain,
    company: name,
    events,
    event_count: events.length,
    latest_event: events[0] ?? null,
    by_type,
    confidence: company.confidence,
    last_verified: company.last_verified,
    provenance: [
      { field: 'events', source: 'News & filings monitor', signal: `${events.length} events aggregated from press, filings, and the company site`, confidence: 0.8 },
      { field: 'funding', source: 'Funding database', signal: 'Funding events reconciled with the funding graph', confidence: 0.88 },
    ],
  };
}
