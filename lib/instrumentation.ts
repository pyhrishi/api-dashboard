/**
 * Instrumentation & visitor de-anonymization — SSOT (Phase 0, M1.3).
 *
 * "Instrumentation is mandatory from day one." Rather than wire real third-party
 * pixels (which a prototype can't and shouldn't), this models the *operator's view*:
 * the analytics sinks we route events to (MS Clarity, GA, Mixpanel) and the visitor
 * de-anonymization provider (RB2B), plus which funnel events flow to each sink.
 *
 * It also generates a deterministic de-anon visitor feed: identified companies piped
 * into retargeting + sales. Per the spec, RB2B coverage is strongest for US traffic,
 * and EU (GDPR) / India (DPDP) visitors are consent-gated — so those rows show as
 * consent-pending/anonymous rather than fully identified.
 *
 * Pure + deterministic (FNV, injected `now`, no Math.random).
 */

import type { TelemetryEventName } from '@/lib/telemetry';

export type SinkId = 'clarity' | 'ga' | 'mixpanel' | 'rb2b';

export interface Sink {
  id: SinkId;
  name: string;
  purpose: string;
  /** What this sink is responsible for capturing. */
  captures: string[];
  /** Prototype: adapters are no-ops unless a key is configured; shown as the intent. */
  status: 'active' | 'key-required';
}

export const SINKS: Sink[] = [
  { id: 'clarity', name: 'MS Clarity', purpose: 'Session replay & UX signals', captures: ['heatmaps', 'scroll depth', 'rage clicks', 'dead clicks'], status: 'active' },
  { id: 'ga', name: 'Google Analytics', purpose: 'Top-of-funnel attribution', captures: ['pageviews', 'traffic sources', 'flow'], status: 'active' },
  { id: 'mixpanel', name: 'Mixpanel', purpose: 'Product funnel events', captures: ['funnel steps', 'conversions', 'cohorts'], status: 'active' },
  { id: 'rb2b', name: 'RB2B', purpose: 'Visitor de-anonymization', captures: ['identified companies', 'retargeting audiences'], status: 'active' },
];

const SINK_BY_ID: Record<SinkId, Sink> = SINKS.reduce((a, s) => { a[s.id] = s; return a; }, {} as Record<SinkId, Sink>);
export function sinkById(id: SinkId): Sink { return SINK_BY_ID[id]; }

/**
 * Which sinks a telemetry event is routed to. Every product event goes to Mixpanel;
 * page-level signals also go to GA; landing engagement also to Clarity; identified-
 * visitor moments feed RB2B retargeting.
 */
export function routeEvent(name: TelemetryEventName): SinkId[] {
  const sinks: SinkId[] = ['mixpanel'];
  if (name === 'lp_viewed') { sinks.push('ga', 'clarity', 'rb2b'); }
  else if (name.startsWith('catalogue_') || name.startsWith('sandbox_') || name.startsWith('signup_gate') || name.startsWith('dwell_') || name.startsWith('exit_intent') || name.startsWith('intent_popup')) {
    sinks.push('clarity');
  }
  if (name === 'signup_completed' || name === 'signup_gate_shown') sinks.push('rb2b');
  return Array.from(new Set(sinks));
}

// ── De-anon visitor feed ──────────────────────────────────────────────────────

export type Region = 'NAMER' | 'EMEA' | 'APAC' | 'LATAM';
export type ConsentStatus = 'identified' | 'consent_pending' | 'anonymous';

export interface DeAnonVisitor {
  id: string;
  company: string;
  /** Person only revealed when fully identified (US). */
  person: string | null;
  role: string;
  region: Region;
  country: string;
  consent: ConsentStatus;
  /** The intent signal that surfaced them. */
  intent: string;
  at: number;
}

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const COMPANIES = ['Northwind', 'Acme', 'Globex', 'Umbra', 'Initech', 'Hooli', 'Stark', 'Vertex', 'Lumen', 'Cortex', 'Zenith', 'Wayne'];
const NAMES = ['Ava Chen', 'Liam Patel', 'Noah Kim', 'Mia Rossi', 'Ethan Cole', 'Zoe Alvarez', 'Kai Berg', 'Ivy Wang'];
const ROLES = ['Head of RevOps', 'Data Engineer', 'Growth Lead', 'Founder', 'VP Sales', 'Platform PM'];
const GEO: { region: Region; country: string; consent: ConsentStatus }[] = [
  { region: 'NAMER', country: 'US', consent: 'identified' },
  { region: 'NAMER', country: 'US', consent: 'identified' },
  { region: 'NAMER', country: 'CA', consent: 'identified' },
  { region: 'EMEA', country: 'DE', consent: 'consent_pending' }, // GDPR-gated
  { region: 'EMEA', country: 'GB', consent: 'consent_pending' },
  { region: 'APAC', country: 'IN', consent: 'consent_pending' }, // DPDP-gated
  { region: 'APAC', country: 'SG', consent: 'anonymous' },
  { region: 'LATAM', country: 'BR', consent: 'anonymous' },
];
const INTENTS = ['Viewed pricing', 'Opened catalogue', 'Fired sandbox (gated)', 'Dwell > 25s', 'Exit intent', 'Read docs'];

const DAY = 86_400_000;

/** A deterministic identified-visitor feed for the instrumentation console. */
export function generateVisitorFeed(seed: string, n: number, now: number): DeAnonVisitor[] {
  const out: DeAnonVisitor[] = [];
  for (let i = 0; i < n; i++) {
    const h = fnv(`${seed}:${i}`);
    const geo = GEO[h % GEO.length];
    const identified = geo.consent === 'identified';
    out.push({
      id: `viz_${h.toString(36)}`,
      company: COMPANIES[h % COMPANIES.length],
      person: identified ? NAMES[(h >> 3) % NAMES.length] : null,
      role: ROLES[(h >> 5) % ROLES.length],
      region: geo.region,
      country: geo.country,
      consent: geo.consent,
      intent: INTENTS[(h >> 7) % INTENTS.length],
      at: now - (h % (3 * DAY)),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export interface DeAnonStats {
  total: number;
  identified: number;
  consentGated: number;
  byRegion: { region: Region; count: number }[];
  identifyRatePct: number;
}

export function deAnonStats(feed: DeAnonVisitor[]): DeAnonStats {
  const identified = feed.filter((v) => v.consent === 'identified').length;
  const consentGated = feed.filter((v) => v.consent !== 'identified').length;
  const byRegionMap = new Map<Region, number>();
  feed.forEach((v) => byRegionMap.set(v.region, (byRegionMap.get(v.region) ?? 0) + 1));
  const byRegion = Array.from(byRegionMap.entries()).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count);
  return {
    total: feed.length,
    identified,
    consentGated,
    byRegion,
    identifyRatePct: feed.length ? Math.round((identified / feed.length) * 100) : 0,
  };
}
