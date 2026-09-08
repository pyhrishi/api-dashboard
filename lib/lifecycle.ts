/**
 * Lifecycle journey — single source of truth (Section F: C0-a … C7-b + missing triggers).
 *
 * This is the state machine behind the nudge system. It derives, from real account
 * state, three things and nothing else (pure, deterministic, no `Math.random`, no
 * store import so it stays trivially testable and Edge/browser/Node-safe):
 *   1. the **primary stage** a user occupies on the C0 → C7 journey;
 *   2. the **active triggers** — the discrete edges (consumption thresholds crossed,
 *      key expiry, inactivity, wallet depletion) that nudges attach to;
 *   3. the **lead score & classification** (cold → SQL → sales-ready → hot, or dead),
 *      which drives whether a stage is sales-routable.
 *
 * A `LifecycleAccount` is the input contract — derivable from the growth-kpis
 * `DeveloperRecord` (`liveDeveloperRecord`) plus the trial-gate `AccountState`. The
 * nudge catalog (`lib/nudges.ts`) reads these; the surfaces render what it returns.
 *
 * Decisions locked 2026-09-08 (see docs/prd/lifecycle-nudges-plan.md): the trial
 * window is derived here from `trialStartedAt` + TRIAL_DURATION_DAYS until a persisted
 * `trialExpiresAt` is added in Step 3.
 */

import { TRIAL_CREDITS, type DeveloperPlan } from '@/lib/growth-kpis';
import type { TelemetryEventName } from '@/lib/telemetry';

// ── Constants ────────────────────────────────────────────────────────────────

export const TRIAL_DURATION_DAYS = 14;
export const INACTIVITY_DAYS = 7;
export const DECISION_WINDOW_USED_PCT = 80;
export const DECISION_WINDOW_DAYS_LEFT = 2;
export const KEY_EXPIRY_WARN_DAYS = [7, 1] as const;
/** Consumption milestones that fire a nudge, low → high. */
export const USAGE_MILESTONES = [10, 25, 50, 75, 100] as const;
const DAY = 86_400_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type LifecyclePhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type FunnelTag = 'lead' | 'feature' | 'both';
export type Priority = 'P0' | 'P1' | 'P2';

export type LifecycleStage =
  | 'C0-a' | 'C0-b'
  | 'C1-a' | 'C1-b' | 'C1-c' | 'C1-d'
  | 'C2-a' | 'C2-b'
  | 'C3-a' | 'C3-b' | 'C3-c' | 'C3-d' | 'C3-e' | 'C3-f'
  | 'C4-a'
  | 'C5-a' | 'C5-b' | 'C5-c'
  | 'C6-a' | 'C6-b' | 'C6-c' | 'C6-d'
  | 'C7-a' | 'C7-b';

/** Discrete edges nudges/events attach to, beyond the primary stage. */
export type TriggerId =
  | 'usage_10' | 'usage_25' | 'usage_50' | 'usage_75' | 'usage_100'
  | 'decision_window'
  | 'key_expiry_7' | 'key_expiry_1' | 'key_expired'
  | 'inactivity_7'
  | 'wallet_low' | 'wallet_depleted' | 'wallet_zero';

export type LeadClass = 'anonymous' | 'cold' | 'warm' | 'sql' | 'sales_ready' | 'hot' | 'customer' | 'dead';

/** One-shot journey transitions (edges between two account snapshots) that fire a celebration/milestone. */
export type TransitionId = 'trial_granted' | 'first_key' | 'first_call' | 'upgraded_in_trial' | 'direct_upgrade' | 'reup';

export interface StageMeta {
  code: LifecycleStage;
  phase: LifecyclePhase;
  label: string;
  description: string;
  funnel: FunnelTag;
  priority: Priority;
  /** The Mixpanel/telemetry event this stage's primary nudge emits. */
  event: TelemetryEventName;
  /** Sales-routable lead milestones surface a sales signal at this stage. */
  salesSignal?: 'sql' | 'sales_ready' | 'hot' | 'dead';
}

/** One key's expiry, as the lifecycle sees it. */
export interface LifecycleKey {
  id: string;
  expiresAt: number | null;
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked' | 'compromised';
}

/** The lifecycle input — derivable from growth-kpis `DeveloperRecord` + trial-gate state. */
export interface LifecycleAccount {
  /** Null before an account exists (pre-auth). */
  signupAt: number | null;
  /** Pre-auth only: the signup form was opened. */
  signupStarted: boolean;
  emailVerified: boolean;
  onboardingComplete: boolean;
  /** Trial-gate decision (peer F-503). 'pending' until the user taps "start trial". */
  trialDecision: 'pending' | 'allow' | 'challenge' | 'exempt';
  otpVerified: boolean;
  trialGranted: boolean;
  trialStartedAt: number | null;
  trialCreditsTotal: number;
  creditBalance: number;
  firstKeyAt: number | null;
  firstCallAt: number | null;
  lastCallAt: number | null;
  paidAt: number | null;
  /** True when the account paid before exhausting the trial (Hot Lead / direct upgrade). */
  upgradedBeforeExhaustion: boolean;
  plan: DeveloperPlan;
  walletBalanceCredits: number;
  revenueUsd: number;
  /** 7-day call count — burn/engagement signal. */
  calls7d: number;
  keys: LifecycleKey[];
}

// ── Stage catalog ──────────────────────────────────────────────────────────────

export const STAGE_META: Record<LifecycleStage, StageMeta> = {
  'C0-a': { code: 'C0-a', phase: 0, label: 'Landing page', description: 'Sees the value prop + mock sandbox; not captured yet.', funnel: 'lead', priority: 'P0', event: 'landing_viewed' },
  'C0-b': { code: 'C0-b', phase: 0, label: 'Signup / Login', description: 'On the signup/login gate; SSO to cut friction.', funnel: 'lead', priority: 'P0', event: 'signup_started' },
  'C1-a': { code: 'C1-a', phase: 1, label: 'Account created', description: 'Welcome + blocking email verification.', funnel: 'lead', priority: 'P0', event: 'signup_completed' },
  'C1-b': { code: 'C1-b', phase: 1, label: 'Onboarding', description: 'Progress checklist + role/use-case capture.', funnel: 'lead', priority: 'P1', event: 'onboarding_step_completed' },
  'C1-c': { code: 'C1-c', phase: 1, label: 'Avail trial (risk eval)', description: 'Risk-scored trial: low-risk instant credits, flagged → verify phone.', funnel: 'lead', priority: 'P0', event: 'trial_risk_evaluated' },
  'C1-d': { code: 'C1-d', phase: 1, label: 'Phone OTP', description: 'Conditional OTP when risk flags; anti-farming gate.', funnel: 'lead', priority: 'P0', event: 'otp_challenge_shown' },
  'C2-a': { code: 'C2-a', phase: 2, label: 'Trial granted', description: '"$X free credits added" celebration → first key.', funnel: 'lead', priority: 'P0', event: 'trial_granted' },
  'C2-b': { code: 'C2-b', phase: 2, label: 'First key', description: 'Empty-state "create your first key"; reveal-once.', funnel: 'lead', priority: 'P0', event: 'first_key_created' },
  'C3-a': { code: 'C3-a', phase: 3, label: 'First API fire', description: 'First successful call (<10 min) — the activation lever. Sales-qualified.', funnel: 'lead', priority: 'P0', event: 'first_call_made', salesSignal: 'sql' },
  'C3-b': { code: 'C3-b', phase: 3, label: '10% used', description: 'Subtle progress indicator; early momentum.', funnel: 'lead', priority: 'P1', event: 'usage_threshold_hit' },
  'C3-c': { code: 'C3-c', phase: 3, label: '25% used', description: 'Progress indicator; consumption pacing.', funnel: 'lead', priority: 'P1', event: 'usage_threshold_hit' },
  'C3-d': { code: 'C3-d', phase: 3, label: '50% used', description: 'Banner + paid-tier comparison. Sales-ready signal.', funnel: 'lead', priority: 'P0', event: 'usage_threshold_hit', salesSignal: 'sales_ready' },
  'C3-e': { code: 'C3-e', phase: 3, label: '75% used', description: 'Banner + top-up CTA; pre-conversion warning.', funnel: 'lead', priority: 'P1', event: 'usage_threshold_hit' },
  'C3-f': { code: 'C3-f', phase: 3, label: '100% used', description: 'Modal + endpoint error + upgrade CTA; conversion trigger.', funnel: 'lead', priority: 'P0', event: 'usage_threshold_hit' },
  'C4-a': { code: 'C4-a', phase: 4, label: 'Decision window', description: '≥80% used or ≤2 days to expiry; persistent upgrade banner.', funnel: 'lead', priority: 'P0', event: 'decision_window_entered' },
  'C5-a': { code: 'C5-a', phase: 5, label: 'Trial expired, not activated', description: 'Dead lead; reactivation banner + win-back before demotion.', funnel: 'lead', priority: 'P1', event: 'dead_lead', salesSignal: 'dead' },
  'C5-b': { code: 'C5-b', phase: 5, label: 'Upgrades during trial', description: 'Funnel-driven conversion; free credits consumed first.', funnel: 'lead', priority: 'P0', event: 'plan_upgraded' },
  'C5-c': { code: 'C5-c', phase: 5, label: 'Direct upgrade', description: 'Hot lead; tops up without finishing trial; AE if high spend.', funnel: 'lead', priority: 'P0', event: 'hot_lead', salesSignal: 'hot' },
  'C6-a': { code: 'C6-a', phase: 6, label: 'Paid account active', description: 'Healthy baseline — don’t nag; monthly digest.', funnel: 'feature', priority: 'P2', event: 'wallet_health_evaluated' },
  'C6-b': { code: 'C6-b', phase: 6, label: 'Wallet:time ≈ 1:1', description: 'Balanced burn; healthy / monitor.', funnel: 'feature', priority: 'P2', event: 'wallet_health_evaluated' },
  'C6-c': { code: 'C6-c', phase: 6, label: 'Slow burn', description: 'Low usage vs balance; feature/endpoint discovery to prevent churn.', funnel: 'feature', priority: 'P1', event: 'wallet_health_evaluated' },
  'C6-d': { code: 'C6-d', phase: 6, label: 'Quick burn', description: 'Fast consumption; low-balance banner + auto-reload + depletion date.', funnel: 'both', priority: 'P0', event: 'wallet_low' },
  'C7-a': { code: 'C7-a', phase: 7, label: 'Tops up again', description: 'Re-up; receipt + balance + bonus-tier teaser.', funnel: 'feature', priority: 'P1', event: 'credits_recharged' },
  'C7-b': { code: 'C7-b', phase: 7, label: 'Wallet $0, no top-up', description: 'Depleted; modal + API error + dunning + revocation warning.', funnel: 'both', priority: 'P0', event: 'wallet_zero' },
};

export const ALL_STAGES: readonly LifecycleStage[] = Object.keys(STAGE_META) as LifecycleStage[];

export function phaseLabel(phase: LifecyclePhase): string {
  return [
    'Pre-account (TOFU)', 'Account & trial gate', 'Trial provisioning & first key', 'Activation & consumption',
    'Conversion decision window', 'Conversion outcome', 'Paid wallet health', 'Re-up / churn signals',
  ][phase];
}

// ── Derived helpers ────────────────────────────────────────────────────────────

export function trialExpiresAt(a: LifecycleAccount): number | null {
  return a.trialStartedAt === null ? null : a.trialStartedAt + TRIAL_DURATION_DAYS * DAY;
}

/** Share of the trial allotment consumed, 0–100. Paid accounts read 100 (trial spent first). */
export function trialCreditsUsedPct(a: LifecycleAccount): number {
  if (a.paidAt !== null) return 100;
  const total = a.trialCreditsTotal > 0 ? a.trialCreditsTotal : TRIAL_CREDITS;
  const used = Math.max(0, total - a.creditBalance);
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

export function daysToExpiry(a: LifecycleAccount, now: number): number | null {
  const exp = trialExpiresAt(a);
  return exp === null ? null : Math.ceil((exp - now) / DAY);
}

export function daysSinceLastCall(a: LifecycleAccount, now: number): number | null {
  if (a.lastCallAt === null) return null;
  return Math.floor((now - a.lastCallAt) / DAY);
}

export function isTrialExpired(a: LifecycleAccount, now: number): boolean {
  const exp = trialExpiresAt(a);
  return exp !== null && now > exp;
}

/** In the conversion decision window: activated, unpaid, ≥80% used or ≤2 days from expiry. */
export function inDecisionWindow(a: LifecycleAccount, now: number): boolean {
  if (a.paidAt !== null || a.firstCallAt === null) return false;
  const dLeft = daysToExpiry(a, now);
  return trialCreditsUsedPct(a) >= DECISION_WINDOW_USED_PCT || (dLeft !== null && dLeft <= DECISION_WINDOW_DAYS_LEFT);
}

/** Estimated days of wallet runway at the current 7-day burn (paid accounts); null if idle. */
export function walletRunwayDays(a: LifecycleAccount): number | null {
  const spendPerDay = (Math.max(0, a.calls7d) * 2.6) / 7;
  if (spendPerDay <= 0) return null;
  return Math.max(0, Math.round(a.walletBalanceCredits / spendPerDay));
}

export function everActivated(a: LifecycleAccount): boolean {
  return a.firstCallAt !== null;
}

/** Minimum days-to-expiry across a key set, or null when none expire. */
export function soonestKeyExpiryDays(a: LifecycleAccount, now: number): number | null {
  let min: number | null = null;
  a.keys.forEach((k) => {
    if (k.status === 'revoked' || k.expiresAt === null) return;
    const d = Math.ceil((k.expiresAt - now) / DAY);
    if (min === null || d < min) min = d;
  });
  return min;
}

// ── Primary stage ──────────────────────────────────────────────────────────────

/**
 * The single dominant stage: where the user is on the journey and what to do next.
 * Ordered most-basic → most-progressed; the first unmet milestone wins.
 */
export function primaryStage(a: LifecycleAccount, now: number): LifecycleStage {
  // Phase 0 — pre-account
  if (a.signupAt === null) return a.signupStarted ? 'C0-b' : 'C0-a';
  // Phase 1 — account & trial gate
  if (!a.emailVerified) return 'C1-a';
  if (!a.onboardingComplete) return 'C1-b';
  if (!a.trialGranted) {
    if (a.trialDecision === 'challenge' && !a.otpVerified) return 'C1-d';
    return 'C1-c';
  }
  // Phases 6–7 — paid wallet health (a paid account leaves the trial funnel)
  if (a.paidAt !== null) {
    if (a.walletBalanceCredits <= 0) return 'C7-b';
    return walletHealthStage(a);
  }
  // Phase 5 — trial expired without converting → dead lead
  if (isTrialExpired(a, now)) return 'C5-a';
  // Phase 2 — trial provisioning
  if (a.firstKeyAt === null) return 'C2-b';
  // Phase 3/4 — activation & consumption
  if (a.firstCallAt === null) return 'C3-a';
  const used = trialCreditsUsedPct(a);
  const dLeft = daysToExpiry(a, now);
  if (used >= 100) return 'C3-f';
  if (used >= DECISION_WINDOW_USED_PCT || (dLeft !== null && dLeft <= DECISION_WINDOW_DAYS_LEFT)) return 'C4-a';
  if (used >= 75) return 'C3-e';
  if (used >= 50) return 'C3-d';
  if (used >= 25) return 'C3-c';
  if (used >= 10) return 'C3-b';
  return 'C3-a';
}

/** Wallet-health sub-stage for a paid account with a positive balance. */
function walletHealthStage(a: LifecycleAccount): LifecycleStage {
  // Burn = 7-day spend vs balance. Quick burn depletes the wallet in ~<2 weeks.
  const spend7d = Math.max(0, a.calls7d) * 2.6; // avg credit cost per call
  if (spend7d <= 0) {
    // Paid but idle: freshly paid reads healthy; sustained idle is slow burn.
    return a.walletBalanceCredits >= 1 ? 'C6-a' : 'C6-b';
  }
  const weeksOfRunway = a.walletBalanceCredits / spend7d;
  if (weeksOfRunway <= 2) return 'C6-d';   // quick burn — depletion is a time-bomb
  if (weeksOfRunway >= 8) return 'C6-c';   // slow burn — off-proportion, churn risk
  return 'C6-b';                           // balanced
}

// ── Active triggers ────────────────────────────────────────────────────────────

/**
 * Discrete edges currently eligible to fire, beyond the primary stage. The nudge
 * layer fires each once via seen-tracking; this only reports what is *eligible now*.
 */
export function activeTriggers(a: LifecycleAccount, now: number): TriggerId[] {
  const out: TriggerId[] = [];
  if (a.signupAt === null) return out;

  // Consumption milestones (only meaningful in the trial funnel, once activated).
  if (a.paidAt === null && a.firstCallAt !== null) {
    const used = trialCreditsUsedPct(a);
    USAGE_MILESTONES.forEach((m) => { if (used >= m) out.push(`usage_${m}` as TriggerId); });
    const dLeft = daysToExpiry(a, now);
    if (used >= DECISION_WINDOW_USED_PCT || (dLeft !== null && dLeft <= DECISION_WINDOW_DAYS_LEFT)) out.push('decision_window');
  }

  // Key expiry (any account with keys).
  const keyDays = soonestKeyExpiryDays(a, now);
  if (keyDays !== null) {
    if (keyDays <= 0) out.push('key_expired');
    else if (keyDays <= 1) out.push('key_expiry_1');
    else if (keyDays <= 7) out.push('key_expiry_7');
  }

  // Inactivity (activated accounts that have gone quiet).
  const idle = daysSinceLastCall(a, now);
  if (a.firstCallAt !== null && idle !== null && idle >= INACTIVITY_DAYS) out.push('inactivity_7');

  // Wallet depletion (paid accounts).
  if (a.paidAt !== null) {
    if (a.walletBalanceCredits <= 0) out.push('wallet_zero');
    else if (walletHealthStage(a) === 'C6-d') out.push('wallet_low');
  }

  return out;
}

/** The Mixpanel props a trigger carries (feeds `track()`). */
export function triggerEvent(trigger: TriggerId, a: LifecycleAccount, now: number): { name: TelemetryEventName; props: Record<string, string | number | boolean> } | null {
  switch (trigger) {
    case 'usage_10': case 'usage_25': case 'usage_50': case 'usage_75': case 'usage_100':
      return { name: 'usage_threshold_hit', props: { threshold_pct: Number(trigger.split('_')[1]) } };
    case 'decision_window':
      return { name: 'decision_window_entered', props: { used_pct: trialCreditsUsedPct(a), days_left: daysToExpiry(a, now) ?? -1 } };
    case 'key_expiry_7':
      return { name: 'key_expiry_warned', props: { days_remaining: 7 } };
    case 'key_expiry_1':
      return { name: 'key_expiry_warned', props: { days_remaining: 1 } };
    case 'key_expired':
      return { name: 'key_expired', props: { was_in_use_recently: (daysSinceLastCall(a, now) ?? 99) <= 7 } };
    case 'inactivity_7':
      return { name: 'inactivity_detected', props: { days_inactive: daysSinceLastCall(a, now) ?? INACTIVITY_DAYS, ever_activated: everActivated(a) } };
    case 'wallet_low':
      return { name: 'wallet_low', props: { balance: a.walletBalanceCredits } };
    case 'wallet_depleted':
      return { name: 'wallet_depleted', props: { balance: a.walletBalanceCredits } };
    case 'wallet_zero':
      return { name: 'wallet_zero', props: { balance: a.walletBalanceCredits } };
    default:
      return null;
  }
}

// ── Transitions ────────────────────────────────────────────────────────────────

/**
 * One-shot journey edges between two account snapshots. Drives the celebration nudges
 * (trial granted, first fire, upgrade, re-up) and the two activation milestone events
 * that have no other emitter (`trial_granted`, `first_key_created`). Baseline the first
 * snapshot before diffing so the already-provisioned demo state does not fire.
 */
export function detectTransitions(prev: LifecycleAccount, curr: LifecycleAccount): TransitionId[] {
  const out: TransitionId[] = [];
  if (!prev.trialGranted && curr.trialGranted) out.push('trial_granted');
  if (prev.firstKeyAt === null && curr.firstKeyAt !== null) out.push('first_key');
  if (prev.firstCallAt === null && curr.firstCallAt !== null) out.push('first_call');
  if (prev.paidAt === null && curr.paidAt !== null) out.push(curr.upgradedBeforeExhaustion ? 'direct_upgrade' : 'upgraded_in_trial');
  if (prev.paidAt !== null && curr.paidAt !== null && curr.walletBalanceCredits > prev.walletBalanceCredits) out.push('reup');
  return out;
}

/**
 * Conversion & wallet milestone events fired on entering a state (Step 3). Distinct
 * from the celebration transitions: these are the sales/health signals the funnel and
 * Alert Center care about. Once-per-crossing, emitted by the orchestrator.
 */
export function detectStateMilestones(prev: LifecycleAccount, curr: LifecycleAccount, now: number): { name: TelemetryEventName; props: Record<string, string | number | boolean> }[] {
  const out: { name: TelemetryEventName; props: Record<string, string | number | boolean> }[] = [];
  if (!inDecisionWindow(prev, now) && inDecisionWindow(curr, now)) {
    out.push({ name: 'decision_window_entered', props: { used_pct: trialCreditsUsedPct(curr), days_left: daysToExpiry(curr, now) ?? -1 } });
  }
  const wasQuick = prev.paidAt !== null && prev.walletBalanceCredits > 0 && walletHealthStage(prev) === 'C6-d';
  const isQuick = curr.paidAt !== null && curr.walletBalanceCredits > 0 && walletHealthStage(curr) === 'C6-d';
  if (!wasQuick && isQuick) out.push({ name: 'wallet_low', props: { balance: curr.walletBalanceCredits, runway_days: walletRunwayDays(curr) ?? -1 } });
  const wasEmpty = prev.paidAt !== null && prev.walletBalanceCredits <= 0;
  const isEmpty = curr.paidAt !== null && curr.walletBalanceCredits <= 0;
  if (!wasEmpty && isEmpty) {
    out.push({ name: 'wallet_zero', props: { balance: curr.walletBalanceCredits } });
    out.push({ name: 'dunning_started', props: { retry_hours: 48 } });
  }
  return out;
}

// ── Lead score & classification ─────────────────────────────────────────────────

export interface LeadAssessment {
  score: number;           // 0–100
  class: LeadClass;
  /** Lead funnel + a live sales signal → route to Sales. */
  salesRoutable: boolean;
  /** "never called" vs "called then cold" for dead-lead salvage. */
  everActivated: boolean;
}

/**
 * Deterministic lead score. Milestones add points; the outcome class is the
 * strongest signal reached. Sales-routable when the class is a live sales signal.
 */
export function leadScoreOf(a: LifecycleAccount, now: number): LeadAssessment {
  if (a.signupAt === null) {
    return { score: a.signupStarted ? 5 : 0, class: 'anonymous', salesRoutable: false, everActivated: false };
  }
  let score = 10;
  if (a.emailVerified) score += 8;
  if (a.onboardingComplete) score += 7;
  if (a.trialGranted) score += 10;
  if (a.firstKeyAt !== null) score += 10;
  const used = trialCreditsUsedPct(a);

  let klass: LeadClass = 'cold';
  if (a.paidAt !== null) {
    klass = a.upgradedBeforeExhaustion ? 'hot' : 'customer';
    score = a.upgradedBeforeExhaustion ? 92 : 80;
  } else if (isTrialExpired(a, now) && used < 25 && a.firstCallAt === null) {
    klass = 'dead';
    score = 15;
  } else if (used >= 50) {
    klass = 'sales_ready';
    score = Math.max(score, 60 + Math.min(20, used - 50));
  } else if (a.firstCallAt !== null) {
    klass = 'sql';
    score = Math.max(score, 45);
  } else if (a.trialGranted) {
    klass = 'warm';
    score = Math.max(score, 30);
  }

  const salesRoutable = klass === 'sql' || klass === 'sales_ready' || klass === 'hot';
  return { score: Math.max(0, Math.min(100, Math.round(score))), class: klass, salesRoutable, everActivated: everActivated(a) };
}

// ── Convenience lookups ──────────────────────────────────────────────────────────

export const funnelTagOf = (s: LifecycleStage): FunnelTag => STAGE_META[s].funnel;
export const priorityOf = (s: LifecycleStage): Priority => STAGE_META[s].priority;
export const phaseOf = (s: LifecycleStage): LifecyclePhase => STAGE_META[s].phase;
export const stageEventOf = (s: LifecycleStage): TelemetryEventName => STAGE_META[s].event;
export const isLead = (s: LifecycleStage): boolean => STAGE_META[s].funnel !== 'feature';
export const isFeature = (s: LifecycleStage): boolean => STAGE_META[s].funnel !== 'lead';
