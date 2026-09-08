/**
 * Coverage audit (Step 7) — the guard that keeps the Section F journey table and the
 * code in lock-step. If a stage, trigger, or missing-triggers-table row is added to the
 * spec without a catalog entry + telemetry event (or vice versa), this fails.
 */
import { ALL_STAGES, STAGE_META, triggerEvent, LEAD_CLASS_EVENT, type TriggerId, type LifecycleAccount } from '@/lib/lifecycle';
import { NUDGE_CATALOG, catalogCoversStage, TRANSITION_NUDGE, nudgeById } from '@/lib/nudges';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const anyAccount: LifecycleAccount = {
  signupAt: NOW, signupStarted: true, emailVerified: true, onboardingComplete: true, trialDecision: 'allow',
  otpVerified: true, trialGranted: true, trialStartedAt: NOW, trialCreditsTotal: 5000, creditBalance: 2500,
  firstKeyAt: NOW, firstCallAt: NOW, lastCallAt: NOW, paidAt: null, upgradedBeforeExhaustion: false, plan: 'Trial',
  walletBalanceCredits: 0, revenueUsd: 0, calls7d: 5, keys: [],
};

describe('journey coverage audit', () => {
  it('every one of the 24 C-stages has a catalog nudge and a telemetry event', () => {
    expect(ALL_STAGES).toHaveLength(24);
    ALL_STAGES.forEach((s) => {
      expect(catalogCoversStage(s)).toBe(true);
      expect(STAGE_META[s].event).toBeTruthy();
    });
  });

  it('every missing-triggers-table trigger maps to a telemetry event', () => {
    const triggers: TriggerId[] = ['usage_10', 'usage_25', 'usage_50', 'usage_75', 'usage_100', 'decision_window', 'key_expiry_7', 'key_expiry_1', 'key_expired', 'inactivity_7', 'wallet_low', 'wallet_depleted', 'wallet_zero'];
    triggers.forEach((t) => {
      const evt = triggerEvent(t, anyAccount, NOW);
      expect(evt).not.toBeNull();
      expect(evt?.name).toBeTruthy();
    });
  });

  it('the key-lifecycle + inactivity triggers each have a dedicated nudge', () => {
    ['key_expiry_7', 'key_expiry_1', 'key_expired', 'inactivity_7'].forEach((code) => {
      expect(NUDGE_CATALOG.some((n) => n.code === code)).toBe(true);
    });
  });

  it('every transition maps to a real catalog nudge; every lead class that signals sales has an event', () => {
    Object.keys(TRANSITION_NUDGE).forEach((t) => {
      const id = TRANSITION_NUDGE[t as keyof typeof TRANSITION_NUDGE] as string;
      expect(nudgeById(id)).toBeTruthy();
    });
    (['sql', 'sales_ready', 'hot', 'dead'] as const).forEach((c) => expect(LEAD_CLASS_EVENT[c]).toBeTruthy());
  });

  it('every catalog nudge is well-formed (unique id, copy, channel, valid funnel/priority)', () => {
    const ids = NUDGE_CATALOG.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    NUDGE_CATALOG.forEach((n) => {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body.length).toBeGreaterThan(0);
      expect(n.channels.length).toBeGreaterThan(0);
      expect(['lead', 'feature', 'both']).toContain(n.funnel);
      expect(['P0', 'P1', 'P2']).toContain(n.priority);
    });
  });
});
