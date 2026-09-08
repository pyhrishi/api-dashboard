/**
 * Nudge catalog + selector + state — the "what to show, when" layer over the
 * lifecycle SSOT (Section F journey). One `NudgeSpec` per journey row; `activeNudges`
 * decides which are eligible right now, honouring dismissal, snooze, frequency caps
 * and priority. Rendering (Step 1) and delivery (Step 4) consume this; nothing here
 * imports React or the main store, so it is unit-testable in isolation.
 *
 * State lives in a dedicated persisted store (`useNudgeState`, key `zinbit-nudge-state`)
 * — the Alert-Center pattern — so `lib/store.ts` is untouched by this feature.
 *
 * This supersedes the removed F-387 "Progress-based nudges".
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  primaryStage, activeTriggers, STAGE_META, trialCreditsUsedPct, daysToExpiry, walletRunwayDays,
  type LifecycleAccount, type LifecycleStage, type TriggerId, type TransitionId, type FunnelTag, type Priority, type LeadClass,
} from '@/lib/lifecycle';
import type { TelemetryEventName } from '@/lib/telemetry';
import type { NudgeDelivery } from '@/lib/nudge-delivery';

// ── Types ────────────────────────────────────────────────────────────────────

export type NudgeSurface = 'banner' | 'modal' | 'toast' | 'checklist' | 'progress' | 'celebration';
export type NudgeChannel = 'in-app' | 'email' | 'webhook';

export interface NudgeSpec {
  id: string;
  /** The journey row this nudge serves — a C-code stage, or a trigger for the missing-triggers table. */
  code: LifecycleStage | TriggerId;
  /** Eligibility key: matches the primary stage or an active trigger. A `TransitionId` here
   *  means the nudge is surfaced only by the one-shot transition path, never by `activeNudges`. */
  trigger: LifecycleStage | TriggerId | TransitionId;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  surface: NudgeSurface;
  channels: NudgeChannel[];
  funnel: FunnelTag;
  priority: Priority;
  /** Show at most `cap` times per `windowHours`; cap 0 = show once ever. */
  frequency: { cap: number; windowHours: number };
  /** Domain event emitted alongside the generic `nudge_shown`. */
  event: TelemetryEventName;
  /** Re-engagement over email if the nudge stalls (Step 4 wires delivery). */
  reengagement?: { afterHours: number; maxTouches: number };
  /** Extra guard: withhold even when the stage/trigger matches (e.g. pre-activation only). */
  suppressWhen?: (a: LifecycleAccount) => boolean;
  /** Data-driven copy: overrides body / CTA label from live account state (Step 3). */
  context?: (a: LifecycleAccount, now: number) => { body?: string; ctaLabel?: string };
}

/** The resolved copy for a nudge given the live account — applies `context` if present. */
export function resolveNudge(spec: NudgeSpec, a: LifecycleAccount, now: number): { title: string; body: string; ctaLabel: string | null } {
  const ctx = spec.context?.(a, now);
  return { title: spec.title, body: ctx?.body ?? spec.body, ctaLabel: ctx?.ctaLabel ?? spec.cta?.label ?? null };
}

export const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

// ── Catalog ──────────────────────────────────────────────────────────────────
// One entry per journey row. Copy is production-shaped but refined per surface in
// Steps 2–3; Step 0 fixes the structure, channels, priority, caps and events.

export const NUDGE_CATALOG: NudgeSpec[] = [
  // Phase 0 — pre-account (TOFU) · pre-auth surfaces (Step 6)
  { id: 'n-c0a-landing', code: 'C0-a', trigger: 'C0-a', surface: 'banner', channels: ['in-app'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'landing_viewed',
    title: 'Enrich any record in seconds', body: 'Explore the catalogue and fire a call in the sandbox — no signup to look around.', cta: { label: 'Try the sandbox', href: '/api' } },
  { id: 'n-c0b-signup', code: 'C0-b', trigger: 'C0-b', surface: 'modal', channels: ['in-app'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'signup_started',
    title: 'Create your account', body: 'Continue with Google or GitHub — you’ll get free credits on the other side.', cta: { label: 'Continue with GitHub', href: '/signup' } },

  // Phase 1 — account & trial gate
  { id: 'n-c1a-welcome', code: 'C1-a', trigger: 'C1-a', surface: 'modal', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'signup_completed',
    title: 'Welcome to Zinbit', body: 'Verify your email to unlock your workspace. We’ve sent you a link.', cta: { label: 'Resend verification', href: '/console' }, reengagement: { afterHours: 6, maxTouches: 2 } },
  { id: 'n-c1b-onboarding', code: 'C1-b', trigger: 'C1-b', surface: 'checklist', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P1', frequency: { cap: 3, windowHours: 24 }, event: 'onboarding_step_completed',
    title: 'Finish setting up', body: 'A few quick steps get you to your first enrichment. Skippable with safe defaults.', cta: { label: 'Continue setup', href: '/console' }, reengagement: { afterHours: 24, maxTouches: 1 } },
  { id: 'n-c1c-trial', code: 'C1-c', trigger: 'C1-c', surface: 'modal', channels: ['in-app'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'trial_risk_evaluated',
    title: 'Start your free trial', body: 'Get free credits instantly. Some accounts verify a phone first to keep credits fair.', cta: { label: 'Start trial', href: '/console/trial-gate' } },
  { id: 'n-c1d-otp', code: 'C1-d', trigger: 'C1-d', surface: 'modal', channels: ['in-app'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'otp_challenge_shown',
    title: 'Verify your phone to unlock credits', body: 'Enter the code we sent. SMS not arriving? We’ll try WhatsApp, then a call.', cta: { label: 'Verify phone', href: '/console/trial-gate' }, reengagement: { afterHours: 24, maxTouches: 1 } },

  // Phase 2 — trial provisioning & first key
  { id: 'n-c2a-granted', code: 'C2-a', trigger: 'C2-a', surface: 'celebration', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'trial_granted',
    title: 'Free credits added 🎉', body: 'Your trial is live. Create a key and make your first call — quickstart inside.', cta: { label: 'Create your first key', href: '/console/keys' } },
  { id: 'n-c2b-firstkey', code: 'C2-b', trigger: 'C2-b', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 4, windowHours: 24 }, event: 'first_key_created',
    title: 'Create your first API key', body: 'You’ll see it once — copy it somewhere safe. Then you’re ready to call the API.', cta: { label: 'Create a key', href: '/console/keys' }, reengagement: { afterHours: 6, maxTouches: 1 } },

  // Phase 3 — activation & consumption
  { id: 'n-c3a-firstfire', code: 'C3-a', trigger: 'C3-a', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 6, windowHours: 24 }, event: 'first_call_made',
    title: 'Make your first call', body: 'cURL, Python and Node snippets are pre-filled with your key. Try it in the browser.', cta: { label: 'Open the Explorer', href: '/console/explorer' }, reengagement: { afterHours: 24, maxTouches: 1 },
    suppressWhen: (a) => a.firstCallAt !== null }, // pre-activation only — never nag after the first fire
  { id: 'n-c3a-celebrate', code: 'C3-a', trigger: 'first_call', surface: 'celebration', channels: ['in-app'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'first_call_made',
    title: 'First call, done 🎉', body: 'You just enriched a record. Try a company lookup next, or wire this into your app.', cta: { label: 'Try another endpoint', href: '/console/explorer' } },
  { id: 'n-c3b-used10', code: 'C3-b', trigger: 'usage_10', surface: 'progress', channels: ['in-app'], funnel: 'lead', priority: 'P1', frequency: { cap: 0, windowHours: 0 }, event: 'usage_threshold_hit', suppressWhen: (a) => trialCreditsUsedPct(a) >= 25,
    title: 'You’re rolling', body: 'You’ve used 10% of your trial credits.' },
  { id: 'n-c3c-used25', code: 'C3-c', trigger: 'usage_25', surface: 'progress', channels: ['in-app'], funnel: 'lead', priority: 'P1', frequency: { cap: 0, windowHours: 0 }, event: 'usage_threshold_hit', suppressWhen: (a) => trialCreditsUsedPct(a) >= 50,
    title: 'A quarter in', body: 'You’ve used 25% of your trial credits.' },
  { id: 'n-c3d-used50', code: 'C3-d', trigger: 'usage_50', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 2, windowHours: 48 }, event: 'usage_threshold_hit', suppressWhen: (a) => trialCreditsUsedPct(a) >= 75,
    title: 'Halfway through your trial', body: 'See how the paid tiers compare — lock in your rate before credits run low.', cta: { label: 'Compare plans', href: '/console/billing' } },
  { id: 'n-c3e-used75', code: 'C3-e', trigger: 'usage_75', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P1', frequency: { cap: 2, windowHours: 48 }, event: 'usage_threshold_hit', suppressWhen: (a) => trialCreditsUsedPct(a) >= 80,
    title: '75% of your credits used', body: 'Top up now to avoid an interruption to your integration.', cta: { label: 'Top up credits', href: '/console/billing' } },
  { id: 'n-c3f-used100', code: 'C3-f', trigger: 'usage_100', surface: 'modal', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 3, windowHours: 24 }, event: 'usage_threshold_hit',
    title: 'You’re out of trial credits', body: 'Calls will error until you top up. Upgrade to keep building where you left off.', cta: { label: 'Upgrade now', href: '/console/billing' }, reengagement: { afterHours: 48, maxTouches: 2 } },

  // Phase 4 — decision window
  { id: 'n-c4a-decision', code: 'C4-a', trigger: 'decision_window', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 6, windowHours: 24 }, event: 'decision_window_entered', suppressWhen: (a) => trialCreditsUsedPct(a) >= 100,
    title: 'Upgrade to keep building', body: 'Your trial is almost up. Here’s your spend rate and what you’d lose without a plan.', cta: { label: 'Choose a plan', href: '/console/billing' }, reengagement: { afterHours: 24, maxTouches: 3 },
    context: (a, now) => { const d = daysToExpiry(a, now); const used = trialCreditsUsedPct(a); return { body: `You’ve used ${used}% of your trial${d !== null && d >= 0 ? ` with ~${d} day${d === 1 ? '' : 's'} left` : ''}. Upgrade now to keep your integration running without interruption.` }; } },

  // Phase 5 — conversion outcome
  { id: 'n-c5a-dead', code: 'C5-a', trigger: 'C5-a', surface: 'banner', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P1', frequency: { cap: 1, windowHours: 168 }, event: 'dead_lead',
    title: 'Pick up where you left off', body: 'Your trial ended. Reactivate to keep exploring — we saved your setup.', cta: { label: 'Reactivate', href: '/console/billing' }, reengagement: { afterHours: 48, maxTouches: 3 } },
  { id: 'n-c5b-upgraded', code: 'C5-b', trigger: 'C5-b', surface: 'celebration', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'plan_upgraded',
    title: 'You’re on a paid plan', body: 'Your free credits are used first, then your wallet. Receipt and invoice are in Billing.', cta: { label: 'View billing', href: '/console/billing' } },
  { id: 'n-c5c-direct', code: 'C5-c', trigger: 'C5-c', surface: 'celebration', channels: ['in-app', 'email'], funnel: 'lead', priority: 'P0', frequency: { cap: 0, windowHours: 0 }, event: 'hot_lead',
    title: 'Welcome to paid', body: 'Fast checkout complete. A specialist will reach out if you’re scaling fast.', cta: { label: 'View billing', href: '/console/billing' } },

  // Phase 6 — paid wallet health
  { id: 'n-c6a-healthy', code: 'C6-a', trigger: 'C6-a', surface: 'toast', channels: ['email'], funnel: 'feature', priority: 'P2', frequency: { cap: 1, windowHours: 720 }, event: 'wallet_health_evaluated',
    title: 'Your monthly usage digest', body: 'A healthy month — here’s your usage and spend.' },
  { id: 'n-c6b-balanced', code: 'C6-b', trigger: 'C6-b', surface: 'toast', channels: ['email'], funnel: 'feature', priority: 'P2', frequency: { cap: 1, windowHours: 720 }, event: 'wallet_health_evaluated',
    title: 'Balanced burn', body: 'Your wallet and usage are tracking together. Monthly digest attached.' },
  { id: 'n-c6c-slow', code: 'C6-c', trigger: 'C6-c', surface: 'banner', channels: ['in-app', 'email'], funnel: 'feature', priority: 'P1', frequency: { cap: 1, windowHours: 336 }, event: 'wallet_health_evaluated',
    title: 'Use-cases you haven’t tried', body: 'You have plenty of balance — here are endpoints teams like yours rely on.', cta: { label: 'Explore endpoints', href: '/console/explorer' }, reengagement: { afterHours: 336, maxTouches: 1 } },
  { id: 'n-c6d-quick', code: 'C6-d', trigger: 'wallet_low', surface: 'banner', channels: ['in-app', 'email'], funnel: 'both', priority: 'P0', frequency: { cap: 4, windowHours: 24 }, event: 'wallet_low',
    title: 'Low balance — top up soon', body: 'At your current rate your wallet runs out shortly. Turn on auto-reload to avoid downtime.', cta: { label: 'Set up auto-reload', href: '/console/billing' },
    context: (a) => { const r = walletRunwayDays(a); return { body: r !== null ? `At your current rate your wallet runs out in about ${r} day${r === 1 ? '' : 's'}. Turn on auto-reload to avoid downtime.` : 'Your balance is running low. Turn on auto-reload to avoid downtime.' }; } },

  // Phase 7 — re-up / churn
  { id: 'n-c7a-reup', code: 'C7-a', trigger: 'C7-a', surface: 'toast', channels: ['in-app', 'email'], funnel: 'feature', priority: 'P1', frequency: { cap: 0, windowHours: 0 }, event: 'credits_recharged',
    title: 'Credits added', body: 'Your balance is topped up. Receipt and invoice are in Billing.', cta: { label: 'View receipt', href: '/console/billing' } },
  { id: 'n-c7b-zero', code: 'C7-b', trigger: 'wallet_zero', surface: 'modal', channels: ['in-app', 'email', 'webhook'], funnel: 'both', priority: 'P0', frequency: { cap: 6, windowHours: 24 }, event: 'wallet_zero',
    title: 'Your wallet is empty', body: 'Calls are failing. Top up to restore service — keys are revoked if payment keeps failing.', cta: { label: 'Top up now', href: '/console/billing' }, reengagement: { afterHours: 48, maxTouches: 3 } },

  // Missing-triggers table (key lifecycle + inactivity)
  { id: 'n-key-exp7', code: 'key_expiry_7', trigger: 'key_expiry_7', surface: 'banner', channels: ['in-app', 'email'], funnel: 'feature', priority: 'P1', frequency: { cap: 1, windowHours: 48 }, event: 'key_expiry_warned',
    title: 'A key expires in 7 days', body: 'Rotate it before it expires to avoid a break in service.', cta: { label: 'Manage keys', href: '/console/keys' } },
  { id: 'n-key-exp1', code: 'key_expiry_1', trigger: 'key_expiry_1', surface: 'modal', channels: ['in-app', 'email', 'webhook'], funnel: 'feature', priority: 'P0', frequency: { cap: 2, windowHours: 24 }, event: 'key_expiry_warned',
    title: 'A key expires tomorrow', body: 'Rotate it now — calls with this key will start failing in under 24 hours.', cta: { label: 'Rotate key', href: '/console/keys' } },
  { id: 'n-key-expired', code: 'key_expired', trigger: 'key_expired', surface: 'banner', channels: ['in-app', 'email', 'webhook'], funnel: 'feature', priority: 'P0', frequency: { cap: 3, windowHours: 24 }, event: 'key_expired',
    title: 'A key has expired', body: 'Calls with this key now return an auth error. Create a replacement key.', cta: { label: 'Manage keys', href: '/console/keys' } },
  { id: 'n-inactivity', code: 'inactivity_7', trigger: 'inactivity_7', surface: 'banner', channels: ['email'], funnel: 'lead', priority: 'P1', frequency: { cap: 1, windowHours: 168 }, event: 'inactivity_detected',
    title: 'Still building?', body: 'You haven’t called the API in a week. Here’s a quickstart to get moving again.', cta: { label: 'Open the Explorer', href: '/console/explorer' }, reengagement: { afterHours: 168, maxTouches: 2 } },
];

const CATALOG_BY_ID: Record<string, NudgeSpec> = NUDGE_CATALOG.reduce((acc, n) => { acc[n.id] = n; return acc; }, {} as Record<string, NudgeSpec>);
export function nudgeById(id: string): NudgeSpec | undefined { return CATALOG_BY_ID[id]; }
export const inProduct = (n: NudgeSpec): boolean => n.channels.includes('in-app');

// ── Transitions → celebrations & milestone events (Step 2) ───────────────────

/** The celebration/receipt nudge each one-shot transition surfaces. */
export const TRANSITION_NUDGE: Partial<Record<TransitionId, string>> = {
  trial_granted: 'n-c2a-granted',
  first_call: 'n-c3a-celebrate',
  upgraded_in_trial: 'n-c5b-upgraded',
  direct_upgrade: 'n-c5c-direct',
  reup: 'n-c7a-reup',
};

/** Milestone events a transition emits directly — only those without another emitter. */
export const TRANSITION_EVENT: Partial<Record<TransitionId, TelemetryEventName>> = {
  trial_granted: 'trial_granted',
  first_key: 'first_key_created',
  // first_call / upgraded_in_trial / direct_upgrade / reup already emit their milestone
  // from the Explorer, Billing and RechargeModal — the transition only celebrates.
};

// ── Per-user nudge state (dedicated persisted store) ─────────────────────────

export type NudgeStatus = 'active' | 'dismissed' | 'snoozed' | 'converted';
export interface NudgeRecord {
  id: string;
  status: NudgeStatus;
  seenCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  snoozedUntil?: number;
  convertedAt?: number;
}

/** Role + use-case capture (C1-b) — segmentation that steers PM auto-key + catalogue pre-filter. */
export interface NudgeProfile {
  role: 'developer' | 'founder' | 'data' | 'other' | null;
  useCase: 'crm' | 'lead-enrichment' | 'fraud' | 'data-quality' | 'other' | null;
  captured: boolean;
  skipped: boolean;
}

export interface NudgeStateData {
  records: Record<string, NudgeRecord>;
  /** Honors opt-out for re-engagement email (Step 4). */
  unsubscribed: boolean;
  leadScore: number;
  leadClass: LeadClass;
  lastStage: LifecycleStage | null;
  stageHistory: { stage: LifecycleStage; at: number }[];
  profile: NudgeProfile;
  /** Authoritative, persisted trial start (Step 3) so the decision window counts down
   *  stably across sessions. Null until the adapter seeds it once from derived state. */
  trialStartedAt: number | null;
  /** Re-engagement delivery ledger + per-nudge touch counters (Step 4). */
  deliveries: NudgeDelivery[];
  reengagementTouches: Record<string, number>;
  /** Deterministic simulated-time offset (ms) so time-based triggers can be exercised
   *  in the prototype; the /console/journey cockpit advances it (Step 5). */
  simulatedOffsetMs: number;
}

export interface NudgeStateActions {
  recordShown: (id: string, now?: number) => void;
  dismiss: (id: string, now?: number) => void;
  snooze: (id: string, untilMs: number, now?: number) => void;
  convert: (id: string, now?: number) => void;
  setUnsubscribed: (v: boolean) => void;
  recordStage: (stage: LifecycleStage, now?: number) => boolean;
  setLead: (score: number, klass: LeadClass) => void;
  setProfile: (patch: Partial<NudgeProfile>) => void;
  /** Seed the persisted trial start once (no-op if already set). */
  seedTrialStart: (at: number) => void;
  /** Append re-engagement deliveries and bump the touch counters (Step 4). */
  recordReengagement: (deliveries: NudgeDelivery[]) => void;
  /** Set / advance the simulated-time offset used by the trigger watcher. */
  setSimulatedOffset: (ms: number) => void;
  advanceSimulated: (ms: number) => void;
  resetNudges: () => void;
}

export const emptyProfile = (): NudgeProfile => ({ role: null, useCase: null, captured: false, skipped: false });
const emptyState = (): NudgeStateData => ({ records: {}, unsubscribed: false, leadScore: 0, leadClass: 'anonymous', lastStage: null, stageHistory: [], profile: emptyProfile(), trialStartedAt: null, deliveries: [], reengagementTouches: {}, simulatedOffsetMs: 0 });

function touch(records: Record<string, NudgeRecord>, id: string, status: NudgeStatus, now: number): Record<string, NudgeRecord> {
  const prev = records[id];
  const next: NudgeRecord = prev
    ? { ...prev, status, seenCount: status === 'active' ? prev.seenCount + 1 : prev.seenCount, lastSeenAt: now }
    : { id, status, seenCount: status === 'active' ? 1 : 0, firstSeenAt: now, lastSeenAt: now };
  return { ...records, [id]: next };
}

export const useNudgeState = create<NudgeStateData & NudgeStateActions>()(
  persist(
    (set, get) => ({
      ...emptyState(),
      recordShown: (id, now = Date.now()) => set((s) => {
        const prev = s.records[id];
        if (prev && (prev.status === 'dismissed' || prev.status === 'converted')) return {};
        return { records: touch(s.records, id, 'active', now) };
      }),
      dismiss: (id, now = Date.now()) => set((s) => ({ records: touch(s.records, id, 'dismissed', now) })),
      snooze: (id, untilMs, now = Date.now()) => set((s) => {
        const base = touch(s.records, id, 'snoozed', now);
        return { records: { ...base, [id]: { ...base[id], snoozedUntil: untilMs } } };
      }),
      convert: (id, now = Date.now()) => set((s) => {
        const base = touch(s.records, id, 'converted', now);
        return { records: { ...base, [id]: { ...base[id], convertedAt: now } } };
      }),
      setUnsubscribed: (v) => set({ unsubscribed: v }),
      recordStage: (stage, now = Date.now()) => {
        if (get().lastStage === stage) return false;
        set((s) => ({ lastStage: stage, stageHistory: [...s.stageHistory, { stage, at: now }].slice(-100) }));
        return true;
      },
      setLead: (score, klass) => set((s) => (s.leadScore === score && s.leadClass === klass ? {} : { leadScore: score, leadClass: klass })),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      seedTrialStart: (at) => set((s) => (s.trialStartedAt === null ? { trialStartedAt: at } : {})),
      recordReengagement: (deliveries) => set((s) => {
        if (deliveries.length === 0) return {};
        const touches = { ...s.reengagementTouches };
        deliveries.forEach((d) => { touches[d.nudgeId] = Math.max(touches[d.nudgeId] ?? 0, d.touch); });
        return { deliveries: [...deliveries, ...s.deliveries].slice(0, 300), reengagementTouches: touches };
      }),
      setSimulatedOffset: (ms) => set({ simulatedOffsetMs: Math.max(0, ms) }),
      advanceSimulated: (ms) => set((s) => ({ simulatedOffsetMs: Math.max(0, s.simulatedOffsetMs + ms) })),
      resetNudges: () => set(emptyState()),
    }),
    { name: 'zinbit-nudge-state', storage: createJSONStorage(() => localStorage) },
  ),
);

// ── Selection ────────────────────────────────────────────────────────────────

export function isDismissed(state: NudgeStateData, id: string): boolean {
  return state.records[id]?.status === 'dismissed' || state.records[id]?.status === 'converted';
}

export function isSnoozed(state: NudgeStateData, id: string, now: number): boolean {
  const r = state.records[id];
  return r?.status === 'snoozed' && (r.snoozedUntil ?? 0) > now;
}

/** Frequency cap: `cap` 0 = once ever; otherwise up to `cap` shows per rolling window. */
export function frequencyOk(state: NudgeStateData, spec: NudgeSpec, now: number): boolean {
  const r = state.records[spec.id];
  if (!r) return true;
  if (spec.frequency.cap === 0) return r.seenCount < 1;
  const windowMs = spec.frequency.windowHours * 3_600_000;
  if (windowMs <= 0) return r.seenCount < spec.frequency.cap;
  // Approximate a rolling window: if the last show is inside the window, honour the cap.
  if (now - r.lastSeenAt <= windowMs) return r.seenCount < spec.frequency.cap;
  return true; // window has rolled over
}

/** Every nudge eligible for the account right now (all channels). */
export function eligibleNudges(account: LifecycleAccount, now: number): NudgeSpec[] {
  const stage = primaryStage(account, now);
  const triggers = activeTriggers(account, now);
  const triggerSet: Record<string, true> = {};
  triggers.forEach((t) => { triggerSet[t] = true; });
  return NUDGE_CATALOG.filter((n) => (n.trigger === stage || triggerSet[n.trigger] === true) && !(n.suppressWhen?.(account) ?? false));
}

/**
 * The in-product nudges to actually show now: eligible, in-app, not dismissed/snoozed,
 * within frequency cap, sorted by priority (P0 first) then catalog order.
 */
export function activeNudges(account: LifecycleAccount, state: NudgeStateData, now: number): NudgeSpec[] {
  return eligibleNudges(account, now)
    .filter((n) => inProduct(n))
    .filter((n) => !isDismissed(state, n.id) && !isSnoozed(state, n.id, now) && frequencyOk(state, n, now))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** The single highest-priority modal to show (one at a time), if any. */
export function topModal(account: LifecycleAccount, state: NudgeStateData, now: number): NudgeSpec | null {
  return activeNudges(account, state, now).find((n) => n.surface === 'modal' || n.surface === 'celebration') ?? null;
}

// ── Stats (for the Growth dashboard, Step 7) ─────────────────────────────────

export interface NudgeStats { shown: number; dismissed: number; converted: number; snoozed: number; conversionPct: number }
export function nudgeStats(state: NudgeStateData): NudgeStats {
  const recs = Object.keys(state.records).map((k) => state.records[k]);
  const shown = recs.filter((r) => r.seenCount > 0).length;
  const dismissed = recs.filter((r) => r.status === 'dismissed').length;
  const converted = recs.filter((r) => r.status === 'converted').length;
  const snoozed = recs.filter((r) => r.status === 'snoozed').length;
  return { shown, dismissed, converted, snoozed, conversionPct: shown === 0 ? 0 : Math.round((converted / shown) * 1000) / 10 };
}

/** Coverage guard: every lifecycle stage is served by at least one catalog entry. */
export function catalogCoversStage(stage: LifecycleStage): boolean {
  return NUDGE_CATALOG.some((n) => n.code === stage);
}
export const STAGE_META_REF = STAGE_META; // re-export anchor for tests
