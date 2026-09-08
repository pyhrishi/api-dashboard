/**
 * PLG KPI framework — single source of truth (F-390 / F-195 / F-530).
 *
 * Everything the Growth dashboard shows is derived here from state the product
 * already holds: the in-product telemetry log, the request log, keys, credits,
 * team and tickets. Nothing is fetched and nothing is random.
 *
 * Two scopes, one engine:
 *   - **workspace** — this console's own developer record, reconstructed from its
 *     real events (signup → key → first call → usage → paid);
 *   - **population** — a deterministic seeded cohort of `COHORT_SIZE` developers
 *     (anchored to "now", regenerated identically on every load) plus the live workspace merged
 *     in as one row marked `isYou`, so medians, % bands and week-over-week math
 *     have real substance in a single-user prototype. It is always labelled as a
 *     sample cohort in the UI.
 *
 * The framework (TOFU / MOFU / BOFU):
 *   TOFU  #signups
 *   MOFU  time to first key · #activations (first successful API call) ·
 *         min / max / avg / median / p90 time-to-activate against a <10 min target ·
 *         power users per usage band
 *   BOFU  trial credits fully used · free → paid (customers or money in wallet)
 *   Feature: team invites · Engagement: DAU / WAU, endpoint utilization heatmap
 *   Advanced: revenue per developer cohort by signup month · health (support
 *   tickets per active dev, destructive-action incident rate)
 *   Alerts: activation drop >10% WoW → Product · phone-OTP completion <60% →
 *   Product · wallet top-up failure >5% → Eng · docs search no-results >20% → Docs.
 *
 * Phone OTP does not live in this prototype (decision 2026-09-08: risk-based OTP at
 * trial activation, in the shared auth service) — its completion rate is modelled
 * as an external feed and labelled as such.
 */

import { ENDPOINTS } from '@/data/endpoints';
import type { TelemetryEventRecord } from '@/lib/telemetry';

// ── Constants ────────────────────────────────────────────────────────────────

export const ACTIVATION_TARGET_MS = 10 * 60_000;
export const TRIAL_CREDITS = 5_000;
export const COHORT_SIZE = 240;
/**
 * Seed namespace for the sample cohort. Chosen (from a probe of candidate seeds)
 * so the steady-state "current week" is genuinely steady — the WoW activation
 * alert must not fire on sampling noise — while the regression scenario swings it
 * well past the threshold. Change it and the tests will tell you.
 */
export const COHORT_SALT = 'zinbit-growth';
export const COHORT_WINDOW_DAYS = 84;
export const ENGAGEMENT_WINDOW_DAYS = 28;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

export type KpiScope = 'workspace' | 'population';
export type KpiScenario = 'current' | 'provider-incident' | 'activation-regression';

export const SCENARIOS: { id: KpiScenario; label: string; description: string }[] = [
  { id: 'current', label: 'Current week', description: 'The cohort as it stands — every alert evaluated against live data.' },
  { id: 'provider-incident', label: 'Provider incident', description: 'The SMS provider degrades and the payment gateway returns declines this week — the Product and Eng alerts fire.' },
  { id: 'activation-regression', label: 'Activation regression', description: 'A docs gap and a broken quick-start halve this week’s activations — the Product and Docs alerts fire.' },
];

// ── Types ────────────────────────────────────────────────────────────────────

export type DeveloperPlan = 'Trial' | 'Starter' | 'Growth' | 'Enterprise';

/** One developer account, as the funnel sees it. Timestamps are epoch ms. */
export interface DeveloperRecord {
  id: string;
  /** Synthetic handle for the cohort; the live workspace uses its own email. */
  handle: string;
  company: string;
  region: 'NAMER' | 'EMEA' | 'APAC' | 'LATAM';
  signupAt: number;
  /** `YYYY-MM` of `signupAt` — the revenue cohort key. */
  signupMonth: string;
  firstKeyAt: number | null;
  firstCallAt: number | null;
  callsTotal: number;
  calls7d: number;
  /** Day offsets (0 = today … 27) on which the developer made at least one call. */
  activeDays: number[];
  /** Share of the trial allotment consumed, 0–100. */
  trialCreditsUsedPct: number;
  paidAt: number | null;
  walletBalanceCredits: number;
  revenueUsd: number;
  plan: DeveloperPlan;
  invitesSent: number;
  invitesAccepted: number;
  supportTickets: number;
  destructiveActions: number;
  /** Destructive actions that had to be reverted — the incident numerator. */
  destructiveReverts: number;
  /** Deterministic per-developer endpoint weights (endpoint id → relative weight). */
  endpointMix: Record<string, number>;
  isYou: boolean;
}

export interface FunnelStage {
  key: 'signup' | 'key' | 'activated' | 'trial_used' | 'paid';
  band: 'TOFU' | 'MOFU' | 'BOFU';
  label: string;
  description: string;
  count: number;
  /** % of the top of the funnel that reached this stage. */
  pctOfTop: number;
  /** % of the previous stage lost before this one (0 for the first stage). */
  dropOffPct: number;
  /** % of the previous stage that converted (100 for the first stage). */
  conversionPct: number;
}

export interface DurationStats {
  n: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  p90: number;
  /** % of samples at or under `ACTIVATION_TARGET_MS`. */
  withinTargetPct: number;
  /** Histogram buckets for a sparkline: ≤2m, ≤5m, ≤10m, ≤30m, ≤2h, ≤1d, >1d. */
  histogram: number[];
}
export const DURATION_BUCKETS = ['≤2m', '≤5m', '≤10m', '≤30m', '≤2h', '≤1d', '>1d'] as const;

export interface UsageBand {
  /** e.g. "Top 10%" or "10–20%". */
  label: string;
  fromPct: number;
  toPct: number;
  developers: number;
  /** Calls made by this band, 7-day window. */
  calls7d: number;
  /** Share of all calls, 0–100. */
  callShare: number;
  /** Minimum 7-day calls to fall in this band. */
  minCalls: number;
  power: boolean;
}

export interface EngagementSeries {
  /** 28 entries, oldest first: developers active that day. */
  dau: number[];
  /** 28 entries, oldest first: developers active in the trailing 7 days. */
  wau: number[];
  dauToday: number;
  wauToday: number;
  /** DAU / WAU stickiness, 0–100. */
  stickiness: number;
}

export interface HeatmapRow {
  endpointId: string;
  name: string;
  path: string;
  /** 24 hourly buckets (UTC hour of day). */
  hours: number[];
  total: number;
}
export interface Heatmap {
  rows: HeatmapRow[];
  max: number;
  total: number;
  peakHour: number | null;
}

export interface RevenueCohort {
  signupMonth: string;
  developers: number;
  activated: number;
  paid: number;
  revenueUsd: number;
  revenuePerDeveloper: number;
  paidConversionPct: number;
}

export interface HealthMetrics {
  activeDevelopers: number;
  supportTickets: number;
  ticketsPerActiveDev: number;
  destructiveActions: number;
  destructiveReverts: number;
  /** reverts / actions, 0–100. */
  incidentRatePct: number;
  invitesSent: number;
  invitesAccepted: number;
  invitesPerActivatedDev: number;
}

export type AlertOwner = 'Product' | 'Eng' | 'Docs owner';
export type AlertSource = 'in-product' | 'auth service';
export interface AlertRule {
  id: 'activation_wow' | 'otp_completion' | 'topup_failure' | 'docs_no_results';
  label: string;
  metricLabel: string;
  owner: AlertOwner;
  source: AlertSource;
  comparator: 'lt' | 'gt';
  threshold: number;
  unit: '%' | 'pp';
  /** Why this threshold exists / what it usually means. */
  hypothesis: string;
}
export interface AlertEvaluation extends AlertRule {
  value: number | null;
  status: 'ok' | 'firing' | 'insufficient-data';
  /** Human sentence for the row. */
  summary: string;
  /** 8 weekly points, oldest first, for the sparkline. */
  series: number[];
}

export const ALERT_RULES: AlertRule[] = [
  { id: 'activation_wow', label: 'Activation rate drop week-over-week', metricLabel: 'WoW change in activation rate', owner: 'Product', source: 'in-product', comparator: 'lt', threshold: -10, unit: 'pp',
    hypothesis: 'A double-digit fall in the share of signups that reach a first call points at a broken quick-start, a docs gap or a signup-quality shift.' },
  { id: 'otp_completion', label: 'Phone OTP completion rate', metricLabel: 'OTP completion (trial activation gate)', owner: 'Product', source: 'auth service', comparator: 'lt', threshold: 60, unit: '%',
    hypothesis: 'Below 60% the SMS provider is the usual suspect (regional delivery), not the user — check the WhatsApp / voice fallbacks are engaging.' },
  { id: 'topup_failure', label: 'Wallet top-up failure rate', metricLabel: 'Declined or errored recharges', owner: 'Eng', source: 'in-product', comparator: 'gt', threshold: 5, unit: '%',
    hypothesis: 'A failure rate above 5% is a payment-gateway or 3-D Secure issue, not card quality — page Eng before revenue leaks.' },
  { id: 'docs_no_results', label: 'Documentation search "no results" rate', metricLabel: 'Searches returning nothing', owner: 'Docs owner', source: 'in-product', comparator: 'gt', threshold: 20, unit: '%',
    hypothesis: 'Every no-result search is a question the docs failed to answer; above 20% the gap is systemic (naming, missing guide), not a typo.' },
];

export interface WeeklyExternal {
  /** OTP completion %, 8 weeks oldest first. */
  otpCompletion: number[];
  /** Top-up attempts / failures, 8 weeks oldest first. */
  topupAttempts: number[];
  topupFailures: number[];
  /** Docs searches / no-result searches, 8 weeks oldest first. */
  docsSearches: number[];
  docsNoResults: number[];
}

export interface KpiSnapshot {
  scope: KpiScope;
  scenario: KpiScenario;
  generatedAt: number;
  developers: DeveloperRecord[];
  funnel: FunnelStage[];
  activationRatePct: number;
  activationRateWoW: { thisWeek: number | null; lastWeek: number | null; deltaPp: number | null };
  timeToActivate: DurationStats | null;
  timeToFirstKey: DurationStats | null;
  bands: UsageBand[];
  trial: { developers: number; fullyUsed: number; fullyUsedPct: number; avgUsedPct: number; distribution: number[] };
  conversion: { signups: number; paid: number; withWallet: number; freeToPaidPct: number; revenueUsd: number };
  engagement: EngagementSeries;
  heatmap: Heatmap;
  revenueCohorts: RevenueCohort[];
  health: HealthMetrics;
  alerts: AlertEvaluation[];
  insights: string[];
}

// ── Deterministic PRNG (no Math.random) ──────────────────────────────────────

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — a tiny, well-distributed generator; identical sequence for a seed. */
function prng(seed: string): () => number {
  let a = fnv1a(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Log-normal-ish minutes: median `medianMin`, long right tail. */
function skewedMinutes(r: () => number, medianMin: number, spread: number): number {
  // Box–Muller with two uniforms → standard normal, then exp() for the tail.
  const u1 = Math.max(r(), 1e-9);
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.5, medianMin * Math.exp(spread * z));
}

// ── Seeded population ────────────────────────────────────────────────────────

const COMPANIES = [
  'Northwind Labs', 'Meridian Data', 'Harborline', 'Brightpath', 'Kestrel Systems', 'Lumen Analytics', 'Oakridge Software',
  'Sable & Co', 'Quill Finance', 'Vantage Robotics', 'Cobalt Health', 'Pinecrest', 'Atlas Freight', 'Nimbus Commerce',
  'Ferro Motors', 'Juniper Legal', 'Solstice Media', 'Granite Cloud', 'Tidewater', 'Orbital Retail', 'Cinder Games',
  'Halcyon Bio', 'Marlow Insurance', 'Riverbend Realty', 'Summit Recruiting', 'Vireo Ventures', 'Copperfield', 'Delta Logistics',
  'Everline', 'Foxglove', 'Glasswing', 'Hollow Oak', 'Ironbark', 'Kite Payments', 'Larkspur', 'Mosaic HR',
];
const FIRST = ['Aarav', 'Bea', 'Chen', 'Dana', 'Elif', 'Femi', 'Gita', 'Hugo', 'Ines', 'Jonas', 'Kavya', 'Leo', 'Maya', 'Nikhil', 'Olu', 'Pia', 'Ravi', 'Sana', 'Tomas', 'Uma', 'Vik', 'Wren', 'Ximena', 'Yara', 'Zane'];
const REGIONS: DeveloperRecord['region'][] = ['NAMER', 'EMEA', 'APAC', 'APAC', 'NAMER', 'EMEA', 'LATAM'];
const PACK_PRICES = [49, 199, 499];

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const CATALOG_IDS = ENDPOINTS.map((e) => e.id);

function endpointMixFor(r: () => number): Record<string, number> {
  // Every developer leans on 2–5 endpoints; the people/company bread-and-butter dominates.
  const mix: Record<string, number> = {};
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.pow(r(), 1.8) * CATALOG_IDS.length); // skew to the front of the catalog
    const id = CATALOG_IDS[Math.min(idx, CATALOG_IDS.length - 1)];
    mix[id] = (mix[id] ?? 0) + 1 + Math.floor(r() * 6);
  }
  return mix;
}

/**
 * The seeded developer cohort. Deterministic for a given `now` day: outcomes and
 * offsets are fixed per index; only the anchor moves.
 */
export function generateCohort(now: number, size: number = COHORT_SIZE, salt: string = COHORT_SALT): DeveloperRecord[] {
  const dayAnchor = Math.floor(now / DAY) * DAY; // stable within a day → stable ids/months
  const records: DeveloperRecord[] = [];
  for (let i = 0; i < size; i++) {
    const r = prng(`${salt}-${i}`);
    // Signups skew toward recent weeks (the funnel is growing).
    const daysAgo = Math.floor(Math.pow(r(), 1.35) * COHORT_WINDOW_DAYS);
    const signupAt = dayAnchor - daysAgo * DAY + Math.floor(r() * DAY);
    const region = REGIONS[Math.floor(r() * REGIONS.length)];
    const company = COMPANIES[i % COMPANIES.length];
    const handle = `${FIRST[i % FIRST.length].toLowerCase()}.${company.split(/[^a-z]/i)[0].toLowerCase()}`;

    const madeKey = r() < 0.79;
    const keyDelayMin = skewedMinutes(r, 5.5, 1.3);
    const firstKeyAt = madeKey ? signupAt + Math.round(keyDelayMin * 60_000) : null;

    const madeCall = madeKey && r() < 0.74;
    const callDelayMin = skewedMinutes(r, 3.2, 1.4);
    const firstCallAt = firstKeyAt !== null && madeCall ? firstKeyAt + Math.round(callDelayMin * 60_000) : null;

    // Heavy-tailed usage (Pareto): a few developers make most of the calls.
    const tenureDays = Math.max(1, daysAgo);
    const callsTotal = firstCallAt !== null ? Math.min(40_000, Math.floor(12 * Math.pow(1 / Math.max(1 - r(), 0.002), 1.15) * Math.min(tenureDays, 30) / 8)) : 0;
    const intensity = callsTotal > 0 ? Math.min(0.95, 0.08 + Math.log10(callsTotal + 1) / 4.6) : 0;
    const activeDays: number[] = [];
    for (let d = 0; d < ENGAGEMENT_WINDOW_DAYS; d++) {
      if (firstCallAt === null) break;
      if (dayAnchor - d * DAY < firstCallAt - DAY) break; // not yet signed up on that day
      if (r() < intensity) activeDays.push(d);
    }
    const calls7d = callsTotal > 0 ? Math.round(callsTotal * (Math.min(7, tenureDays) / Math.max(tenureDays, 7)) * (0.6 + r() * 0.8)) : 0;

    const avgCost = 2.6;
    const trialCreditsUsedPct = firstCallAt !== null ? Math.min(100, Math.round((callsTotal * avgCost / TRIAL_CREDITS) * 100)) : 0;
    const paid = trialCreditsUsedPct >= 100 && r() < 0.58;
    const paidAt = paid && firstCallAt !== null ? Math.min(dayAnchor, firstCallAt + Math.round(skewedMinutes(r, 3 * 1440, 0.9) * 60_000)) : null;
    const packs = paid ? 1 + Math.floor(Math.pow(r(), 2) * 4) : 0;
    let revenueUsd = 0;
    for (let p = 0; p < packs; p++) revenueUsd += PACK_PRICES[Math.min(2, Math.floor(Math.pow(r(), 1.6) * 3))];
    const plan: DeveloperPlan = !paid ? 'Trial' : revenueUsd >= 1200 ? 'Enterprise' : revenueUsd >= 400 ? 'Growth' : 'Starter';
    const walletBalanceCredits = paid ? Math.round(revenueUsd * 102 * (0.15 + r() * 0.7)) : Math.max(0, TRIAL_CREDITS - Math.round(callsTotal * avgCost));

    const invitesSent = firstCallAt !== null && r() < 0.42 ? 1 + Math.floor(r() * 4) : 0;
    const invitesAccepted = invitesSent ? Math.min(invitesSent, Math.floor(invitesSent * (0.4 + r() * 0.6))) : 0;
    const supportTickets = firstCallAt !== null && r() < 0.22 ? 1 + Math.floor(Math.pow(r(), 2) * 3) : 0;
    const destructiveActions = firstCallAt !== null ? Math.floor(Math.pow(r(), 1.5) * 7) : 0;
    const destructiveReverts = destructiveActions > 0 && r() < 0.11 ? 1 : 0;

    records.push({
      id: `dev_${String(i + 1).padStart(3, '0')}`, handle, company, region, signupAt, signupMonth: monthKey(signupAt),
      firstKeyAt, firstCallAt, callsTotal, calls7d, activeDays, trialCreditsUsedPct, paidAt, walletBalanceCredits, revenueUsd, plan,
      invitesSent, invitesAccepted, supportTickets, destructiveActions, destructiveReverts, endpointMix: firstCallAt !== null ? endpointMixFor(r) : {}, isYou: false,
    });
  }
  return records.sort((a, b) => a.signupAt - b.signupAt);
}

/** Weekly external / aggregate series (8 weeks, oldest first) — deterministic, scenario-aware. */
export function weeklyExternal(scenario: KpiScenario): WeeklyExternal {
  const r = prng('zinbit-weekly-external');
  const otpCompletion: number[] = [];
  const topupAttempts: number[] = [];
  const topupFailures: number[] = [];
  const docsSearches: number[] = [];
  const docsNoResults: number[] = [];
  for (let w = 0; w < 8; w++) {
    otpCompletion.push(Math.round(76 + r() * 12));
    const attempts = 38 + Math.floor(r() * 26);
    topupAttempts.push(attempts);
    topupFailures.push(Math.round(attempts * (0.012 + r() * 0.022)));
    const searches = 210 + Math.floor(r() * 140);
    docsSearches.push(searches);
    docsNoResults.push(Math.round(searches * (0.09 + r() * 0.07)));
  }
  const last = 7;
  if (scenario === 'provider-incident') {
    otpCompletion[last] = 47;
    topupFailures[last] = Math.round(topupAttempts[last] * 0.083);
  }
  if (scenario === 'activation-regression') {
    docsNoResults[last] = Math.round(docsSearches[last] * 0.27);
  }
  return { otpCompletion, topupAttempts, topupFailures, docsSearches, docsNoResults };
}

/** Apply a scenario to the cohort deterministically (pure — returns new records). */
export function applyScenario(records: DeveloperRecord[], scenario: KpiScenario, now: number): DeveloperRecord[] {
  if (scenario !== 'activation-regression') return records;
  const weekAgo = now - WEEK;
  let k = 0;
  return records.map((d) => {
    if (d.signupAt < weekAgo || d.firstCallAt === null || d.isYou) return d;
    k += 1;
    // Every other activation this week never happens: the quick-start is broken.
    return k % 2 === 0 ? { ...d, firstCallAt: null, callsTotal: 0, calls7d: 0, activeDays: [], trialCreditsUsedPct: 0, paidAt: null, revenueUsd: 0, plan: 'Trial', walletBalanceCredits: TRIAL_CREDITS } : d;
  });
}

// ── The live workspace as one developer record ──────────────────────────────

export interface LiveWorkspaceInput {
  events: TelemetryEventRecord[];
  /** ISO timestamps + endpoint paths of the real request log (any environment). */
  requestLog: { timestamp: string; path: string }[];
  email: string | null;
  company: string | null;
  orgCreatedAt: string | null;
  isFirstCallMade: boolean;
  firstCallTimestamp: number | null;
  activeKeyCount: number;
  creditBalance: number;
  plan: string;
  teamSize: number;
  supportTickets: number;
}

const firstEvent = (events: TelemetryEventRecord[], name: TelemetryEventRecord['name']) => {
  let best: TelemetryEventRecord | null = null;
  events.forEach((e) => { if (e.name === name && (!best || e.timestamp < best.timestamp)) best = e; });
  return best as TelemetryEventRecord | null;
};
const countEvents = (events: TelemetryEventRecord[], name: TelemetryEventRecord['name']) => events.reduce((n, e) => n + (e.name === name ? 1 : 0), 0);

/** Reconstruct this console's own funnel record from what it actually did. */
export function liveDeveloperRecord(input: LiveWorkspaceInput, now: number): DeveloperRecord {
  const signupEvt = firstEvent(input.events, 'signup_completed');
  const earliest = input.events.reduce<number | null>((min, e) => { const t = Date.parse(e.timestamp); return min === null || t < min ? t : min; }, null);
  const signupAt = signupEvt ? Date.parse(signupEvt.timestamp) : input.orgCreatedAt ? Date.parse(input.orgCreatedAt) : earliest ?? now;

  const keyEvt = firstEvent(input.events, 'api_key_created');
  const hasCalls = input.requestLog.length > 0;
  // A key must exist before any call could have been made.
  const firstKeyAt = keyEvt ? Date.parse(keyEvt.timestamp) : input.activeKeyCount > 0 || hasCalls ? signupAt : null;

  const callEvt = firstEvent(input.events, 'first_call_made');
  const okRun = input.events.find((e) => e.name === 'explorer_run' && e.props.ok === true);
  // Last resort: the request log itself — the same history Logs and Analytics show
  // for this workspace. A console with calls on record has, by definition, activated.
  const earliestCall = input.requestLog.reduce<number | null>((min, l) => { const t = Date.parse(l.timestamp); return Number.isFinite(t) && (min === null || t < min) ? t : min; }, null);
  const firstCallAt = callEvt ? Date.parse(callEvt.timestamp) : input.firstCallTimestamp ?? (okRun ? Date.parse(okRun.timestamp) : earliestCall);

  const callsTotal = input.requestLog.length;
  const calls7d = input.requestLog.filter((l) => now - Date.parse(l.timestamp) <= WEEK).length;
  const activeDaySet = new Set<number>();
  input.requestLog.forEach((l) => { const d = Math.floor((now - Date.parse(l.timestamp)) / DAY); if (d >= 0 && d < ENGAGEMENT_WINDOW_DAYS) activeDaySet.add(d); });
  const endpointMix: Record<string, number> = {};
  input.requestLog.forEach((l) => { const ep = ENDPOINTS.find((e) => e.path === l.path); if (ep) endpointMix[ep.id] = (endpointMix[ep.id] ?? 0) + 1; });

  const recharged = countEvents(input.events, 'credits_recharged');
  const upgraded = countEvents(input.events, 'plan_upgraded') > 0;
  const paidEvt = firstEvent(input.events, 'credits_recharged') ?? firstEvent(input.events, 'plan_upgraded');
  const revenueUsd = input.events.reduce((sum, e) => {
    if (e.name !== 'credits_recharged') return sum;
    const pack = Number(e.props.pack);
    return sum + (PACK_PRICES[pack - 1] ?? 49);
  }, 0);
  const paid = recharged > 0 || upgraded;
  const used = Math.max(0, TRIAL_CREDITS - input.creditBalance);
  const trialCreditsUsedPct = paid ? 100 : Math.min(100, Math.round((used / TRIAL_CREDITS) * 100));
  const plan: DeveloperPlan = paid ? (input.plan === 'Enterprise' ? 'Enterprise' : input.plan === 'Growth' ? 'Growth' : 'Starter') : 'Trial';

  return {
    id: 'dev_you', handle: input.email ?? 'you', company: input.company ?? 'Your organization', region: 'NAMER',
    signupAt, signupMonth: monthKey(signupAt), firstKeyAt, firstCallAt, callsTotal, calls7d, activeDays: Array.from(activeDaySet).sort((a, b) => a - b),
    trialCreditsUsedPct, paidAt: paid && paidEvt ? Date.parse(paidEvt.timestamp) : null, walletBalanceCredits: input.creditBalance, revenueUsd, plan,
    invitesSent: countEvents(input.events, 'invite_sent'), invitesAccepted: countEvents(input.events, 'invite_accepted') + Math.max(0, input.teamSize - 1),
    supportTickets: input.supportTickets,
    destructiveActions: countEvents(input.events, 'destructive_action_confirmed'),
    destructiveReverts: countEvents(input.events, 'merge_reverted') + countEvents(input.events, 'key_restored'),
    endpointMix, isYou: true,
  };
}

// ── Funnel ───────────────────────────────────────────────────────────────────

const isActivated = (d: DeveloperRecord) => d.firstCallAt !== null;
const isPaid = (d: DeveloperRecord) => d.paidAt !== null;

export function computeFunnel(records: DeveloperRecord[]): FunnelStage[] {
  const defs: Omit<FunnelStage, 'count' | 'pctOfTop' | 'dropOffPct' | 'conversionPct'>[] = [
    { key: 'signup', band: 'TOFU', label: 'Signed up', description: 'Account created' },
    { key: 'key', band: 'MOFU', label: 'Created an API key', description: 'Holds a credential' },
    { key: 'activated', band: 'MOFU', label: 'Activated', description: 'First successful API call' },
    { key: 'trial_used', band: 'BOFU', label: 'Trial fully used', description: '100% of trial credits consumed' },
    { key: 'paid', band: 'BOFU', label: 'Paid', description: 'Recharged or upgraded — money in the wallet' },
  ];
  const counts: Record<FunnelStage['key'], number> = {
    signup: records.length,
    key: records.filter((d) => d.firstKeyAt !== null).length,
    activated: records.filter(isActivated).length,
    trial_used: records.filter((d) => d.trialCreditsUsedPct >= 100).length,
    paid: records.filter(isPaid).length,
  };
  const top = counts.signup;
  let prev: number | null = null;
  return defs.map((def) => {
    const count = counts[def.key];
    const conversionPct = prev === null ? 100 : prev === 0 ? 0 : Math.round((count / prev) * 1000) / 10;
    const stage: FunnelStage = {
      ...def, count,
      pctOfTop: top === 0 ? 0 : Math.round((count / top) * 1000) / 10,
      dropOffPct: prev === null ? 0 : prev === 0 ? 0 : Math.round(((prev - count) / prev) * 1000) / 10,
      conversionPct,
    };
    prev = count;
    return stage;
  });
}

// ── Duration statistics ──────────────────────────────────────────────────────

const BUCKET_EDGES_MS = [2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000, 2 * 3_600_000, DAY];

export function durationStats(values: number[]): DurationStats | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (q: number) => {
    const pos = (v.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  const histogram = new Array(BUCKET_EDGES_MS.length + 1).fill(0) as number[];
  v.forEach((x) => {
    const idx = BUCKET_EDGES_MS.findIndex((edge) => x <= edge);
    histogram[idx === -1 ? BUCKET_EDGES_MS.length : idx] += 1;
  });
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length),
    median: Math.round(at(0.5)),
    p90: Math.round(at(0.9)),
    withinTargetPct: Math.round((v.filter((x) => x <= ACTIVATION_TARGET_MS).length / v.length) * 100),
    histogram,
  };
}

export function activationDurations(records: DeveloperRecord[]): number[] {
  return records.filter((d) => d.firstCallAt !== null).map((d) => (d.firstCallAt as number) - d.signupAt);
}
export function firstKeyDurations(records: DeveloperRecord[]): number[] {
  return records.filter((d) => d.firstKeyAt !== null).map((d) => (d.firstKeyAt as number) - d.signupAt);
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) { const m = Math.floor(ms / 60_000); const s = Math.round((ms % 60_000) / 1000); return s ? `${m}m ${s}s` : `${m}m`; }
  if (ms < DAY) { const h = Math.floor(ms / 3_600_000); const m = Math.round((ms % 3_600_000) / 60_000); return m ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(ms / DAY); const h = Math.round((ms % DAY) / 3_600_000);
  return h ? `${d}d ${h}h` : `${d}d`;
}

// ── Power-user bands ─────────────────────────────────────────────────────────

/** Rank activated developers by 7-day calls and cut into 10% bands (top first). */
export function usageBands(records: DeveloperRecord[]): UsageBand[] {
  const active = records.filter((d) => d.calls7d > 0).sort((a, b) => b.calls7d - a.calls7d);
  const totalCalls = active.reduce((s, d) => s + d.calls7d, 0);
  const bands: UsageBand[] = [];
  for (let b = 0; b < 10; b++) {
    const from = Math.floor((active.length * b) / 10);
    const to = Math.floor((active.length * (b + 1)) / 10);
    const slice = active.slice(from, to);
    const calls = slice.reduce((s, d) => s + d.calls7d, 0);
    bands.push({
      label: b === 0 ? 'Top 10%' : `${b * 10}–${(b + 1) * 10}%`,
      fromPct: b * 10, toPct: (b + 1) * 10,
      developers: slice.length,
      calls7d: calls,
      callShare: totalCalls === 0 ? 0 : Math.round((calls / totalCalls) * 1000) / 10,
      minCalls: slice.length ? slice[slice.length - 1].calls7d : 0,
      power: b < 2,
    });
  }
  return bands;
}

// ── Engagement ───────────────────────────────────────────────────────────────

export function engagement(records: DeveloperRecord[]): EngagementSeries {
  const dau = new Array(ENGAGEMENT_WINDOW_DAYS).fill(0) as number[];
  const wau = new Array(ENGAGEMENT_WINDOW_DAYS).fill(0) as number[];
  for (let d = 0; d < ENGAGEMENT_WINDOW_DAYS; d++) {
    // index 0 = oldest (27 days ago), last = today
    const offset = ENGAGEMENT_WINDOW_DAYS - 1 - d;
    dau[d] = records.filter((r) => r.activeDays.includes(offset)).length;
    wau[d] = records.filter((r) => r.activeDays.some((x) => x >= offset && x < offset + 7)).length;
  }
  const dauToday = dau[ENGAGEMENT_WINDOW_DAYS - 1];
  const wauToday = wau[ENGAGEMENT_WINDOW_DAYS - 1];
  return { dau, wau, dauToday, wauToday, stickiness: wauToday === 0 ? 0 : Math.round((dauToday / wauToday) * 100) };
}

// ── Endpoint heatmap ─────────────────────────────────────────────────────────

/** Business-hours curve (UTC), used to spread a developer's weight over the day. */
const HOUR_CURVE = [1, 1, 1, 1, 2, 3, 5, 8, 11, 13, 14, 13, 12, 13, 14, 13, 11, 8, 6, 4, 3, 2, 2, 1];
const REGION_SHIFT: Record<DeveloperRecord['region'], number> = { NAMER: 6, EMEA: 0, APAC: -6, LATAM: 4 };

/** Endpoint × UTC-hour utilization. Real request logs are counted exactly; the cohort's mix is spread over a regional business-hours curve. */
export function endpointHeatmap(records: DeveloperRecord[], requestLog: { timestamp: string; path: string }[], scope: KpiScope): Heatmap {
  const byId = new Map<string, number[]>();
  const ensure = (id: string) => { let row = byId.get(id); if (!row) { row = new Array(24).fill(0) as number[]; byId.set(id, row); } return row; };

  requestLog.forEach((l) => {
    const ep = ENDPOINTS.find((e) => e.path === l.path);
    if (!ep) return;
    ensure(ep.id)[new Date(l.timestamp).getUTCHours()] += 1;
  });
  if (scope === 'population') {
    records.forEach((d) => {
      if (d.isYou) return; // already counted exactly above
      const shift = REGION_SHIFT[d.region];
      Object.keys(d.endpointMix).forEach((id) => {
        const row = ensure(id);
        const weight = d.endpointMix[id] * Math.max(1, d.calls7d / 12);
        for (let h = 0; h < 24; h++) row[(h + shift + 24) % 24] += Math.round(weight * HOUR_CURVE[h] / 14);
      });
    });
  }
  const rows: HeatmapRow[] = Array.from(byId.entries()).map(([id, hours]) => {
    const ep = ENDPOINTS.find((e) => e.id === id);
    return { endpointId: id, name: ep?.name ?? id, path: ep?.path ?? id, hours, total: hours.reduce((s, x) => s + x, 0) };
  }).sort((a, b) => b.total - a.total).slice(0, 12);
  const max = rows.reduce((m, r) => Math.max(m, ...r.hours), 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const hourTotals = new Array(24).fill(0) as number[];
  rows.forEach((r) => r.hours.forEach((v, h) => { hourTotals[h] += v; }));
  const peak = hourTotals.reduce((best, v, h) => (v > hourTotals[best] ? h : best), 0);
  return { rows, max, total, peakHour: total === 0 ? null : peak };
}

// ── Revenue cohorts & health ─────────────────────────────────────────────────

export function revenueCohorts(records: DeveloperRecord[]): RevenueCohort[] {
  const byMonth = new Map<string, DeveloperRecord[]>();
  records.forEach((d) => { const list = byMonth.get(d.signupMonth) ?? []; list.push(d); byMonth.set(d.signupMonth, list); });
  return Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([signupMonth, devs]) => {
    const revenue = devs.reduce((s, d) => s + d.revenueUsd, 0);
    const paid = devs.filter(isPaid).length;
    return {
      signupMonth, developers: devs.length, activated: devs.filter(isActivated).length, paid, revenueUsd: revenue,
      revenuePerDeveloper: Math.round((revenue / devs.length) * 100) / 100,
      paidConversionPct: Math.round((paid / devs.length) * 1000) / 10,
    };
  });
}

export function healthMetrics(records: DeveloperRecord[]): HealthMetrics {
  const active = records.filter(isActivated);
  const tickets = records.reduce((s, d) => s + d.supportTickets, 0);
  const actions = records.reduce((s, d) => s + d.destructiveActions, 0);
  const reverts = records.reduce((s, d) => s + d.destructiveReverts, 0);
  const invites = records.reduce((s, d) => s + d.invitesSent, 0);
  return {
    activeDevelopers: active.length, supportTickets: tickets,
    ticketsPerActiveDev: active.length === 0 ? 0 : Math.round((tickets / active.length) * 100) / 100,
    destructiveActions: actions, destructiveReverts: reverts,
    incidentRatePct: actions === 0 ? 0 : Math.round((reverts / actions) * 1000) / 10,
    invitesSent: invites, invitesAccepted: records.reduce((s, d) => s + d.invitesAccepted, 0),
    invitesPerActivatedDev: active.length === 0 ? 0 : Math.round((invites / active.length) * 100) / 100,
  };
}

// ── Alerts ───────────────────────────────────────────────────────────────────

/** Activation rate (% of signups that activated) for each of the last 8 weeks, oldest first. */
export function weeklyActivationRates(records: DeveloperRecord[], now: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let w = 7; w >= 0; w--) {
    const end = now - w * WEEK;
    const start = end - WEEK;
    const cohort = records.filter((d) => d.signupAt >= start && d.signupAt < end);
    out.push(cohort.length === 0 ? null : Math.round((cohort.filter(isActivated).length / cohort.length) * 1000) / 10);
  }
  return out;
}

export interface LiveAlertInputs {
  /** Live counts from this workspace's events (added to the last week). */
  topupAttempts: number;
  topupFailures: number;
  docsSearches: number;
  docsNoResults: number;
  /** Trial-gate OTP challenges shown / verified in this workspace (from the shared auth service's console events). Optional: default 0. */
  otpChallenges?: number;
  otpVerified?: number;
}

/**
 * Implied weekly challenge volume behind the modelled OTP completion %, so live
 * challenges from this workspace can be blended in as counts rather than replacing
 * the series.
 */
export const OTP_WEEKLY_BASE = 50;

const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);

export function evaluateAlerts(records: DeveloperRecord[], external: WeeklyExternal, live: LiveAlertInputs, now: number, rules: AlertRule[] = ALERT_RULES): AlertEvaluation[] {
  const activation = weeklyActivationRates(records, now);
  const thisWeek = activation[7];
  const lastWeek = activation[6];
  const wowDelta = thisWeek !== null && lastWeek !== null ? Math.round((thisWeek - lastWeek) * 10) / 10 : null;

  const attempts = external.topupAttempts.slice();
  const failures = external.topupFailures.slice();
  attempts[7] += live.topupAttempts; failures[7] += live.topupFailures;
  const topupSeries = attempts.map((a, i) => pct(failures[i], a) ?? 0);

  const searches = external.docsSearches.slice();
  const noResults = external.docsNoResults.slice();
  searches[7] += live.docsSearches; noResults[7] += live.docsNoResults;
  const docsSeries = searches.map((s, i) => pct(noResults[i], s) ?? 0);

  // OTP: the modelled % is blended with this workspace's real challenge/verify counts.
  const liveChallenges = live.otpChallenges ?? 0;
  const liveVerified = Math.min(liveChallenges, live.otpVerified ?? 0);
  const otpSeries = external.otpCompletion.slice();
  if (liveChallenges > 0) {
    const modelledVerified = (otpSeries[7] / 100) * OTP_WEEKLY_BASE;
    otpSeries[7] = Math.round(((modelledVerified + liveVerified) / (OTP_WEEKLY_BASE + liveChallenges)) * 1000) / 10;
  }

  const values: Record<AlertRule['id'], { value: number | null; series: number[]; detail: string }> = {
    activation_wow: {
      value: wowDelta,
      series: activation.map((v) => v ?? 0),
      detail: thisWeek !== null && lastWeek !== null ? `${thisWeek}% this week vs ${lastWeek}% last week` : 'Needs signups in both of the last two weeks',
    },
    otp_completion: {
      value: otpSeries[7], series: otpSeries,
      detail: `${otpSeries[7]}% of OTP challenges completed this week (auth service${liveChallenges > 0 ? `, incl. ${liveVerified} of ${liveChallenges} in this workspace` : ''})`,
    },
    topup_failure: { value: topupSeries[7], series: topupSeries, detail: `${failures[7]} of ${attempts[7]} recharges failed this week` },
    docs_no_results: { value: docsSeries[7], series: docsSeries, detail: `${noResults[7]} of ${searches[7]} searches returned nothing this week` },
  };

  return rules.map((rule) => {
    const { value, series, detail } = values[rule.id];
    let status: AlertEvaluation['status'] = 'insufficient-data';
    if (value !== null) status = (rule.comparator === 'lt' ? value < rule.threshold : value > rule.threshold) ? 'firing' : 'ok';
    const summary = status === 'insufficient-data'
      ? detail
      : status === 'firing'
        ? `${detail} — ${rule.comparator === 'lt' ? 'below' : 'above'} the ${rule.threshold}${rule.unit === 'pp' ? ' pp' : '%'} threshold. Alert ${rule.owner}.`
        : `${detail} — within threshold.`;
    return { ...rule, value, status, summary, series };
  });
}

// ── Insights (state-aware, never random) ─────────────────────────────────────

export function kpiInsights(s: Omit<KpiSnapshot, 'insights'>): string[] {
  const out: string[] = [];
  const worst = s.funnel.slice(1).reduce((w, st) => (st.dropOffPct > w.dropOffPct ? st : w), s.funnel[1]);
  if (s.funnel[0].count === 0) {
    out.push('No developers in this scope yet — sign up, create a key and run a call in the Explorer to populate the funnel, or switch to the sample cohort.');
    return out;
  }
  if (worst && worst.dropOffPct > 0) out.push(`Biggest leak: ${worst.dropOffPct}% of developers drop before “${worst.label}”. Fix that stage before optimising anything downstream.`);
  if (s.timeToActivate) {
    out.push(s.timeToActivate.median <= ACTIVATION_TARGET_MS
      ? `Median time-to-activate is ${formatDuration(s.timeToActivate.median)} — inside the 10-minute target; ${s.timeToActivate.withinTargetPct}% of activations make it.`
      : `Median time-to-activate is ${formatDuration(s.timeToActivate.median)} — over the 10-minute target. Only ${s.timeToActivate.withinTargetPct}% activate in time; shorten the key → first-call path.`);
  }
  const top = s.bands[0];
  if (top && top.developers > 0) out.push(`The top 10% of developers make ${top.callShare}% of all calls — expansion revenue lives there; the long tail is an activation problem, not a pricing one.`);
  if (s.conversion.signups > 0) out.push(`Free → paid is ${s.conversion.freeToPaidPct}% (${s.conversion.paid} of ${s.conversion.signups}); ${s.trial.fullyUsedPct}% of activated developers exhausted the trial — those are the upgrade prompts worth showing.`);
  if (s.engagement.wauToday > 0) out.push(`Stickiness (DAU/WAU) is ${s.engagement.stickiness}% — ${s.engagement.stickiness >= 30 ? 'a daily habit for a third of weekly users' : 'usage is weekly, not daily; a scheduled job or webhook loop would raise it'}.`);
  const firing = s.alerts.filter((a) => a.status === 'firing');
  if (firing.length) out.push(`${firing.length} alert${firing.length === 1 ? '' : 's'} firing: ${firing.map((a) => `${a.label} → ${a.owner}`).join('; ')}.`);
  return out;
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

export interface SnapshotInput {
  scope: KpiScope;
  scenario: KpiScenario;
  now: number;
  live: LiveWorkspaceInput;
  liveAlerts: LiveAlertInputs;
  /** Alert rules with any org threshold overrides applied (defaults to `ALERT_RULES`). */
  rules?: AlertRule[];
}

export function buildSnapshot(input: SnapshotInput): KpiSnapshot {
  const { scope, scenario, now } = input;
  const you = liveDeveloperRecord(input.live, now);
  const base = scope === 'population' ? [...generateCohort(now), you] : [you];
  const developers = applyScenario(base, scenario, now);
  const funnel = computeFunnel(developers);
  const activated = developers.filter(isActivated);
  const weekly = weeklyActivationRates(developers, now);
  const trialDist = new Array(5).fill(0) as number[]; // 0–24, 25–49, 50–74, 75–99, 100
  activated.forEach((d) => { trialDist[d.trialCreditsUsedPct >= 100 ? 4 : Math.floor(d.trialCreditsUsedPct / 25)] += 1; });
  const fullyUsed = activated.filter((d) => d.trialCreditsUsedPct >= 100).length;
  const paid = developers.filter(isPaid);
  const partial: Omit<KpiSnapshot, 'insights'> = {
    scope, scenario, generatedAt: now, developers, funnel,
    activationRatePct: funnel[0].count === 0 ? 0 : Math.round((funnel[2].count / funnel[0].count) * 1000) / 10,
    activationRateWoW: { thisWeek: weekly[7], lastWeek: weekly[6], deltaPp: weekly[7] !== null && weekly[6] !== null ? Math.round((weekly[7] - weekly[6]) * 10) / 10 : null },
    timeToActivate: durationStats(activationDurations(developers)),
    timeToFirstKey: durationStats(firstKeyDurations(developers)),
    bands: usageBands(developers),
    trial: {
      developers: activated.length, fullyUsed,
      fullyUsedPct: activated.length === 0 ? 0 : Math.round((fullyUsed / activated.length) * 1000) / 10,
      avgUsedPct: activated.length === 0 ? 0 : Math.round(activated.reduce((s, d) => s + d.trialCreditsUsedPct, 0) / activated.length),
      distribution: trialDist,
    },
    conversion: {
      signups: developers.length, paid: paid.length,
      withWallet: developers.filter((d) => isPaid(d) && d.walletBalanceCredits > 0).length,
      freeToPaidPct: developers.length === 0 ? 0 : Math.round((paid.length / developers.length) * 1000) / 10,
      revenueUsd: developers.reduce((s, d) => s + d.revenueUsd, 0),
    },
    engagement: engagement(developers),
    heatmap: endpointHeatmap(developers, input.live.requestLog, scope),
    revenueCohorts: revenueCohorts(developers),
    health: healthMetrics(developers),
    alerts: evaluateAlerts(developers, weeklyExternal(scenario), input.liveAlerts, now, input.rules ?? ALERT_RULES),
  };
  return { ...partial, insights: kpiInsights(partial) };
}

// ── PM report (Markdown) ─────────────────────────────────────────────────────

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** The weekly KPI report a PM would paste into a doc — the framework, filled in. */
export function pmReportMarkdown(s: KpiSnapshot): string {
  const tta = s.timeToActivate;
  const lines: string[] = [];
  lines.push(`# Zinbit PLG KPIs — ${new Date(s.generatedAt).toISOString().slice(0, 10)} (${s.scope === 'population' ? 'sample cohort + your workspace' : 'your workspace'}${s.scenario !== 'current' ? `, scenario: ${s.scenario}` : ''})`);
  lines.push('');
  lines.push('## Activation funnel');
  lines.push('| Stage | Band | Developers | % of signups | Drop-off |');
  lines.push('|---|---|---|---|---|');
  s.funnel.forEach((st) => lines.push(`| ${st.label} | ${st.band} | ${st.count} | ${st.pctOfTop}% | ${st.dropOffPct}% |`));
  lines.push('');
  lines.push('## MOFU');
  lines.push(`- Time to first key (median): ${s.timeToFirstKey ? formatDuration(s.timeToFirstKey.median) : '—'}`);
  lines.push(`- Activations (first API call): ${s.funnel[2].count} (${s.activationRatePct}% of signups)`);
  lines.push(tta ? `- Time to activate — min ${formatDuration(tta.min)} · median ${formatDuration(tta.median)} · avg ${formatDuration(tta.avg)} · p90 ${formatDuration(tta.p90)} · max ${formatDuration(tta.max)} · ${tta.withinTargetPct}% within the 10-minute target` : '- Time to activate: no activations yet');
  lines.push(`- Power users: ${s.bands.filter((b) => b.power).reduce((n, b) => n + b.developers, 0)} developers in the top 20% make ${s.bands.filter((b) => b.power).reduce((n, b) => n + b.callShare, 0).toFixed(1)}% of calls`);
  lines.push('');
  lines.push('## BOFU');
  lines.push(`- Trial fully used: ${s.trial.fullyUsed} of ${s.trial.developers} activated (${s.trial.fullyUsedPct}%)`);
  lines.push(`- Free → paid: ${s.conversion.paid} of ${s.conversion.signups} (${s.conversion.freeToPaidPct}%), ${s.conversion.withWallet} with money in the wallet, ${usd(s.conversion.revenueUsd)} revenue`);
  lines.push('');
  lines.push('## Engagement & feature');
  lines.push(`- DAU ${s.engagement.dauToday} · WAU ${s.engagement.wauToday} · stickiness ${s.engagement.stickiness}%`);
  lines.push(`- Team invites: ${s.health.invitesSent} sent, ${s.health.invitesAccepted} accepted (${s.health.invitesPerActivatedDev} per activated developer)`);
  lines.push(`- Busiest endpoint: ${s.heatmap.rows[0]?.name ?? '—'}${s.heatmap.peakHour !== null ? ` · peak hour ${String(s.heatmap.peakHour).padStart(2, '0')}:00 UTC` : ''}`);
  lines.push('');
  lines.push('## Advanced');
  lines.push('| Signup month | Developers | Paid | Revenue | Revenue / dev |');
  lines.push('|---|---|---|---|---|');
  s.revenueCohorts.forEach((c) => lines.push(`| ${c.signupMonth} | ${c.developers} | ${c.paid} | ${usd(c.revenueUsd)} | ${usd(c.revenuePerDeveloper)} |`));
  lines.push(`- Health: ${s.health.ticketsPerActiveDev} tickets per active developer · destructive-action incident rate ${s.health.incidentRatePct}% (${s.health.destructiveReverts} of ${s.health.destructiveActions} reverted)`);
  lines.push('');
  lines.push('## Alerts');
  s.alerts.forEach((a) => lines.push(`- ${a.status === 'firing' ? '🔴' : a.status === 'ok' ? '🟢' : '⚪'} ${a.label}: ${a.summary}`));
  return lines.join('\n');
}
