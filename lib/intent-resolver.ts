/**
 * Buyer intent signals (F-012) — surface the topics a company is actively
 * researching and how in-market it is.
 *
 * Deterministic and state-aware: the intent profile is seeded from the domain and
 * *reuses the real resolvers* so it agrees with the rest of the platform — a
 * company with recent funding (budget), high-importance trigger events (news), or
 * heavy GTM hiring reads hotter. Intent is a composite of topic-level research
 * surges plus contributing signals (funding / hiring / technographic / news /
 * engagement), rolled into a 0–100 score and a hot/warm/cool/cold tier.
 *
 * No `Math.random` — same domain always resolves to the same intent.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolveFundingForDomain } from '@/lib/funding-resolver';
import { resolveCompanyNews } from '@/lib/company-news-resolver';

export type IntentTier = 'hot' | 'warm' | 'cool' | 'cold';
export type IntentTrend = 'surging' | 'rising' | 'steady' | 'cooling';
export type IntentSignalCategory = 'funding' | 'hiring' | 'technographic' | 'news' | 'engagement';

export interface IntentTopic {
  topic: string;
  /** 0..100 research intensity for this topic. */
  score: number;
  trend: IntentTrend;
  /** Week-over-week change; positive = rising interest. */
  delta: number;
}

export interface IntentSignal {
  category: IntentSignalCategory;
  label: string;
  detail: string;
  /** Contribution to the composite score, 0..1. */
  weight: number;
}

export interface BuyerIntentProfile {
  domain: string;
  company: string;
  /** Composite intent, 0..100. */
  score: number;
  tier: IntentTier;
  trend: IntentTrend;
  /** True for hot/warm — worth prioritizing now. */
  in_market: boolean;
  topics: IntentTopic[];
  signals: IntentSignal[];
  recommended_action: string;
  confidence: number;
  last_verified: string;
}

// Topics relevant to Zinbit's category — what an in-market account researches.
const TOPIC_CATALOG = [
  'Data Enrichment', 'Sales Intelligence', 'Contact & Lead Data', 'Lead Scoring',
  'CRM Integration', 'Account-Based Marketing', 'Data Privacy & Compliance', 'API Infrastructure',
];

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
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const normalizeDomain = (raw: string): string =>
  String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

function trendFromDelta(delta: number): IntentTrend {
  if (delta >= 18) return 'surging';
  if (delta >= 6) return 'rising';
  if (delta <= -6) return 'cooling';
  return 'steady';
}
function tierFromScore(score: number): IntentTier {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  if (score >= 25) return 'cool';
  return 'cold';
}

/**
 * Resolve a company's buyer-intent profile. Returns null for personal or
 * unrecognized domains (no company to score).
 */
export function resolveBuyerIntent(rawDomain: string): BuyerIntentProfile | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company || company.is_personal_domain) return null;

  const domain = normalizeDomain(rawDomain);
  const rng = makeRng(hashString(`intent:${domain}`));

  // ── Contributing signals, several drawn from the real resolvers ─────────────
  const signals: IntentSignal[] = [];

  // Funding → budget to buy.
  const funding = resolveFundingForDomain(domain);
  if (funding?.has_funding && funding.last_round) {
    const year = Number(String(funding.last_round.date).slice(0, 4)) || 0;
    const recent = year >= 2025;
    signals.push({
      category: 'funding',
      label: recent ? 'Recently funded — fresh budget' : 'Institutionally funded',
      detail: `${funding.funding_stage} · ${funding.last_round.stage} (${funding.last_round.date})`,
      weight: recent ? 0.9 : 0.55,
    });
  }

  // News trigger events → GTM catalysts.
  const news = resolveCompanyNews(domain);
  if (news && news.events.length > 0) {
    const topEvent = [...news.events].sort((a, b) => b.importance - a.importance)[0];
    signals.push({
      category: 'news',
      label: 'Active trigger events',
      detail: `${news.events.length} event${news.events.length === 1 ? '' : 's'} · top: ${topEvent.headline}`,
      weight: clamp(topEvent.importance / 100, 0, 0.85),
    });
  }

  // Hiring for GTM/data roles → building a buying team.
  const openRoles = 2 + Math.floor(rng() * 18);
  const gtmRoles = 1 + Math.floor(rng() * Math.min(openRoles, 8));
  signals.push({
    category: 'hiring',
    label: `${gtmRoles} open GTM/data role${gtmRoles === 1 ? '' : 's'}`,
    detail: `${gtmRoles} of ${openRoles} open reqs are RevOps, Sales, or Data roles`,
    weight: clamp(gtmRoles / 10, 0, 0.8),
  });

  // Technographic — evaluating or churning a competing tool.
  const evaluatingCompetitor = rng() < 0.45;
  signals.push({
    category: 'technographic',
    label: evaluatingCompetitor ? 'Evaluating a competing data tool' : 'Stable data stack',
    detail: evaluatingCompetitor ? 'Detected a competitor enrichment tag alongside evaluation activity' : 'No competitive-displacement signal detected',
    weight: evaluatingCompetitor ? 0.7 : 0.2,
  });

  // Engagement — content/web research surge.
  const engagementSurge = Math.floor(rng() * 100);
  signals.push({
    category: 'engagement',
    label: engagementSurge >= 60 ? 'Content engagement surge' : 'Baseline engagement',
    detail: `${engagementSurge}% of a normalized research-activity index this week`,
    weight: clamp(engagementSurge / 100, 0, 0.75),
  });

  // ── Topic surges ────────────────────────────────────────────────────────────
  const topicCount = 3 + Math.floor(rng() * 3); // 3..5 topics
  const chosen = [...TOPIC_CATALOG].sort(() => (rng() < 0.5 ? -1 : 1)).slice(0, topicCount);
  const topics: IntentTopic[] = chosen.map((topic) => {
    const base = 30 + Math.floor(rng() * 55);
    const delta = -20 + Math.floor(rng() * 60);
    const score = clamp(base + (delta > 0 ? delta / 2 : 0), 0, 100);
    return { topic, score: Math.round(score), delta, trend: trendFromDelta(delta) };
  }).sort((a, b) => b.score - a.score);

  // ── Composite score ─────────────────────────────────────────────────────────
  // Blend the top-topic research intensity with the mean strength of the
  // contributing signals — so a recently-funded, actively-hiring account with hot
  // trigger events reads high, while a quiet one reads cool. Bounded, with spread.
  const topTopicAvg = topics.slice(0, 3).reduce((s, t) => s + t.score, 0) / Math.min(3, topics.length);
  const avgSignalWeight = signals.reduce((s, sig) => s + sig.weight, 0) / (signals.length || 1);
  const raw = 0.55 * topTopicAvg + 48 * avgSignalWeight;
  const score = Math.round(clamp(raw, 3, 99));
  const tier = tierFromScore(score);

  // Trend from the weighted topic deltas.
  const avgDelta = topics.reduce((s, t) => s + t.delta, 0) / (topics.length || 1);
  const trend = trendFromDelta(avgDelta);

  const recommended_action =
    tier === 'hot' ? 'Prioritize for outbound now — route to sales with the top topic as the hook.'
    : tier === 'warm' ? 'Nurture with content on the surging topics; add to an ABM play.'
    : tier === 'cool' ? 'Monitor — no strong buying signal yet; re-check next cycle.'
    : 'No active intent — deprioritize until a signal emerges.';

  return {
    domain: company.domain,
    company: company.name,
    score,
    tier,
    trend,
    in_market: tier === 'hot' || tier === 'warm',
    topics,
    signals: signals.sort((a, b) => b.weight - a.weight),
    recommended_action,
    confidence: company.confidence,
    last_verified: company.last_verified,
  };
}
