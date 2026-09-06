/**
 * Data decay alerts — proactive decay-risk scoring for enriched records.
 *
 * Where automated re-verification (F-041) is the *action* — it re-checks a
 * field once it's past its cadence and reports what changed — this module is
 * the *foresight*: it scores how likely each monitored record is to decay
 * *before* it's due, ranks the riskiest, and raises severity-tiered alerts.
 *
 * The score blends four explainable factors:
 *   1. Age vs. cadence — how far past (or how close to) its re-check window.
 *   2. Field volatility — employment churns fastest, then email, then phone.
 *   3. Role mobility — senior/leadership titles change jobs more often.
 *   4. Company event signal — a deterministic per-company disruption
 *      (acquisition / layoffs / rapid growth) elevates risk for a while.
 *
 * Deterministic: every factor is seeded by (record, company) via FNV-1a — no
 * Math.random, no wall-clock in the score — so the inbox is stable across
 * renders and reproduces. Reuses the re-verification record pool as the single
 * source of truth for the monitored population, so both features speak about
 * the same records with the same ages.
 */

import {
  generateReverifiableRecords, recordAgeDays, fieldLabel,
  DEFAULT_CADENCE,
  type ReverifiableRecord, type ReverifyFieldType, type ReverificationCadence,
} from '@/lib/reverification';

export type { ReverifiableRecord, ReverifyFieldType } from '@/lib/reverification';

/** Ordered most→least urgent. */
export type DecaySeverity = 'critical' | 'high' | 'medium' | 'low';
export type DecayAlertStatus = 'open' | 'snoozed' | 'resolved';

/** A per-company disruption that elevates decay risk. */
export type CompanyEvent = 'acquisition' | 'layoffs' | 'rapid_growth' | 'stable';

/** One contributing factor behind a decay score. */
export interface DecayFactor {
  label: string;
  detail: string;
  /** 0..1 — how much this factor pushed the score up. */
  weight: number;
}

/** A record's decay-risk assessment (no lifecycle — that lives in the store). */
export interface DecayScore {
  recordId: string;
  entity: string;
  company: string;
  fieldType: ReverifyFieldType;
  value: string;
  /** Days since the field was last verified. */
  ageDays: number;
  /** 0..1 probability the field is stale / will be stale imminently. */
  probability: number;
  severity: DecaySeverity;
  /** ISO date the field is projected to cross the decay threshold. */
  projectedDecayDate: string;
  /** Days until projected decay (negative = already past). */
  daysToDecay: number;
  companyEvent: CompanyEvent;
  factors: DecayFactor[];
}

/** The lifecycle overlay a user applies to an alert (persisted in the store). */
export interface DecayAlertState {
  status: DecayAlertStatus;
  /** ms epoch a snooze expires; absent unless snoozed. */
  snoozedUntil?: number;
  updatedAt: number;
}

/** A scored record joined with its lifecycle state — what the inbox renders. */
export interface DecayAlert extends DecayScore {
  status: DecayAlertStatus;
  snoozedUntil?: number;
}

/** Stable "today" — coherent with the re-verification / freshness model. */
const DECAY_NOW = Date.UTC(2026, 8, 6); // 2026-09-06
const DAY = 86_400_000;

export const SEVERITY_ORDER: DecaySeverity[] = ['critical', 'high', 'medium', 'low'];
const SEVERITY_RANK: Record<DecaySeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
export const severityRank = (s: DecaySeverity): number => SEVERITY_RANK[s];

/** Snooze durations offered in the UI (days). */
export const SNOOZE_OPTIONS = [7, 14, 30] as const;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Base volatility of a field type — how fast the underlying fact changes. */
const FIELD_VOLATILITY: Record<ReverifyFieldType, number> = {
  employment: 0.9, // people change jobs — the fastest-decaying signal
  email: 0.62, // corporate email follows employment, plus domain migrations
  phone: 0.42, // direct dials are the most stable
};

/** Leadership / high-mobility title markers → elevated job-change risk. */
const SENIOR_MARKERS = ['vp', 'chief', 'head', 'director', 'lead', 'president', 'founder', 'principal'];

function roleMobility(value: string): number {
  const v = value.toLowerCase();
  return SENIOR_MARKERS.some((m) => v.includes(m)) ? 0.8 : 0.35;
}

/** Deterministic per-company disruption signal. */
export function companyEvent(company: string): CompanyEvent {
  const r = hash(`decay-event:${company}`) % 100;
  if (r < 12) return 'acquisition';
  if (r < 24) return 'layoffs';
  if (r < 40) return 'rapid_growth';
  return 'stable';
}

const EVENT_RISK: Record<CompanyEvent, number> = {
  acquisition: 0.85, // reorgs, email-domain migrations, departures
  layoffs: 0.8,
  rapid_growth: 0.5, // churn from fast hiring/re-orgs, but people stay
  stable: 0.1,
};

const EVENT_LABEL: Record<CompanyEvent, string> = {
  acquisition: 'Acquisition / M&A activity',
  layoffs: 'Recent workforce reduction',
  rapid_growth: 'Rapid headcount growth',
  stable: 'No disruptive company events',
};

const EVENT_DETAIL: Record<CompanyEvent, string> = {
  acquisition: 'Domain migrations and departures spike after M&A — expect email/role churn.',
  layoffs: 'Role and email changes are elevated after a reduction in force.',
  rapid_growth: 'Fast hiring drives re-orgs and internal moves.',
  stable: 'No signals suggesting elevated churn at this company.',
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function severityFor(probability: number): DecaySeverity {
  if (probability >= 0.75) return 'critical';
  if (probability >= 0.55) return 'high';
  if (probability >= 0.35) return 'medium';
  return 'low';
}

/**
 * Score one record's decay risk against a cadence. Deterministic.
 *
 * The age term is the dominant driver: risk ramps toward 1 as the record
 * approaches and passes its cadence. Field volatility, role mobility, and a
 * company event modulate how steeply — a VP at an acquired company decays far
 * faster than a stable IC's phone number.
 */
export function scoreDecay(
  record: ReverifiableRecord,
  cadence: ReverificationCadence = DEFAULT_CADENCE,
  now: number = DECAY_NOW,
): DecayScore {
  const ageDays = recordAgeDays(record, now);
  const window = cadence[record.fieldType];
  const ageRatio = window > 0 ? ageDays / window : 1;

  const fieldVol = FIELD_VOLATILITY[record.fieldType];
  const mobility = roleMobility(record.value + ' ' + record.entity);
  const event = companyEvent(record.company);
  const eventRisk = EVENT_RISK[event];

  // Age term: 0 at brand-new, ~0.5 at the cadence boundary, saturating past it.
  const ageTerm = clamp01(1 - Math.exp(-0.7 * ageRatio));

  // Volatility multiplier: how fast this specific record decays per unit age.
  // Blend the three modulators (field, role, company) with fixed weights.
  const volatility = clamp01(0.5 * fieldVol + 0.3 * mobility + 0.2 * eventRisk);

  // Final probability leans on age, amplified by volatility, with an event bump.
  const probability = clamp01(0.35 * ageTerm + 0.5 * ageTerm * volatility + 0.15 * eventRisk);
  const severity = severityFor(probability);

  // Projected decay: extrapolate the age at which probability would reach 0.75
  // (the critical line) at this record's volatility, then convert to a date.
  const decayVelocity = 0.12 + volatility * 0.18; // probability points per cadence-window
  const ratioAtCritical = 0.75 / Math.max(0.05, decayVelocity);
  const daysToCritical = Math.round(ratioAtCritical * window);
  const daysToDecay = daysToCritical - ageDays;
  const projectedDecayDate = iso(now + Math.max(0, daysToDecay) * DAY);

  const factors = buildFactors(record, ageDays, window, ageRatio, mobility, event, fieldVol);

  return {
    recordId: record.id,
    entity: record.entity,
    company: record.company,
    fieldType: record.fieldType,
    value: record.value,
    ageDays,
    probability: Math.round(probability * 100) / 100,
    severity,
    projectedDecayDate,
    daysToDecay,
    companyEvent: event,
    factors,
  };
}

function buildFactors(
  record: ReverifiableRecord,
  ageDays: number,
  window: number,
  ageRatio: number,
  mobility: number,
  event: CompanyEvent,
  fieldVol: number,
): DecayFactor[] {
  const factors: DecayFactor[] = [];

  factors.push({
    label: `${ageDays}d since last verified`,
    detail: ageRatio >= 1
      ? `${(Math.round(ageRatio * 10) / 10)}× its ${window}d re-check window — overdue.`
      : `${Math.round(ageRatio * 100)}% through its ${window}d re-check window.`,
    weight: clamp01(1 - Math.exp(-0.7 * ageRatio)),
  });

  factors.push({
    label: `${fieldLabel(record.fieldType)} volatility`,
    detail: record.fieldType === 'employment'
      ? 'Employment is the fastest-decaying field — job changes cascade to email and role.'
      : record.fieldType === 'email'
        ? 'Corporate email follows employment and domain migrations.'
        : 'Direct dials are relatively stable, but still disconnect.',
    weight: fieldVol,
  });

  if (mobility >= 0.8) {
    factors.push({
      label: 'Senior / high-mobility role',
      detail: 'Leadership titles change companies more often than individual contributors.',
      weight: mobility,
    });
  }

  if (event !== 'stable') {
    factors.push({
      label: EVENT_LABEL[event],
      detail: EVENT_DETAIL[event],
      weight: EVENT_RISK[event],
    });
  }

  return factors;
}

/** Score every monitored record, most-at-risk first. */
export function scoreAll(
  cadence: ReverificationCadence = DEFAULT_CADENCE,
  now: number = DECAY_NOW,
): DecayScore[] {
  return generateReverifiableRecords()
    .map((r) => scoreDecay(r, cadence, now))
    .sort(sortByRisk);
}

const sortByRisk = (a: DecayScore, b: DecayScore): number =>
  b.probability - a.probability || severityRank(b.severity) - severityRank(a.severity);

/** Is a stored alert state currently an active snooze (not yet expired)? */
export function isSnoozeActive(state: DecayAlertState | undefined, now: number = Date.now()): boolean {
  return !!state && state.status === 'snoozed' && !!state.snoozedUntil && state.snoozedUntil > now;
}

/**
 * Resolve the *effective* status of a record given its stored overlay: an
 * expired snooze silently reverts to open, so stale snoozes never hide risk.
 */
export function effectiveStatus(state: DecayAlertState | undefined, now: number = Date.now()): DecayAlertStatus {
  if (!state) return 'open';
  if (state.status === 'snoozed') return isSnoozeActive(state, now) ? 'snoozed' : 'open';
  return state.status;
}

/**
 * Build the alert inbox: score all records, keep those at/above the severity
 * threshold, join the lifecycle overlay, and sort by risk. Resolved and
 * actively-snoozed alerts are still returned (with their status) so the UI can
 * tab between Open / Snoozed / Resolved — filtering is the caller's choice.
 */
export function computeDecayAlerts(
  cadence: ReverificationCadence,
  threshold: DecaySeverity,
  states: Record<string, DecayAlertState>,
  now: number = Date.now(),
  scoreNow: number = DECAY_NOW,
): DecayAlert[] {
  const floor = severityRank(threshold);
  return scoreAll(cadence, scoreNow)
    .filter((s) => severityRank(s.severity) >= floor)
    .map((s) => {
      const st = states[s.recordId];
      const status = effectiveStatus(st, now);
      return { ...s, status, snoozedUntil: isSnoozeActive(st, now) ? st!.snoozedUntil : undefined };
    })
    .sort(sortByRisk);
}

/** Roll-up counts for the KPI tiles (open alerts only). */
export interface DecaySummary {
  monitored: number;
  atRisk: number;
  critical: number;
  /** Median days-to-decay across open at-risk records (the "horizon"). */
  medianHorizon: number | null;
}

export function summarize(alerts: DecayAlert[], monitored: number): DecaySummary {
  const open = alerts.filter((a) => a.status === 'open');
  const critical = open.filter((a) => a.severity === 'critical').length;
  const horizons = open.map((a) => a.daysToDecay).filter((d) => d >= 0).sort((a, b) => a - b);
  const medianHorizon = horizons.length
    ? horizons[Math.floor((horizons.length - 1) / 2)]
    : null;
  return { monitored, atRisk: open.length, critical, medianHorizon };
}

/**
 * Score a single record by email, for the gateway endpoint. Matches against
 * the monitored pool by email value or entity; returns null when unresolvable.
 */
export function decayScoreForEmail(
  input: string,
  cadence: ReverificationCadence = DEFAULT_CADENCE,
  now: number = DECAY_NOW,
): DecayScore | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const pool = generateReverifiableRecords();
  const match =
    pool.find((r) => r.fieldType === 'email' && r.value.toLowerCase() === q) ||
    pool.find((r) => r.value.toLowerCase() === q) ||
    pool.find((r) => r.entity.toLowerCase() === q) ||
    (q.includes('@') ? pool.find((r) => r.entity.toLowerCase().replace(/\s+/g, '.') === q.split('@')[0]) : undefined);
  return match ? scoreDecay(match, cadence, now) : null;
}

export const severityLabel = (s: DecaySeverity): string => s.charAt(0).toUpperCase() + s.slice(1);
