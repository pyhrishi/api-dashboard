import {
  primaryStage, activeTriggers, triggerEvent, leadScoreOf, trialCreditsUsedPct, daysToExpiry, isTrialExpired,
  soonestKeyExpiryDays, detectTransitions, detectStateMilestones, inDecisionWindow, walletRunwayDays, accountFromDeveloper,
  STAGE_META, ALL_STAGES, TRIAL_DURATION_DAYS,
  type LifecycleAccount, type LifecycleStage,
} from '@/lib/lifecycle';
import { TRIAL_CREDITS } from '@/lib/growth-kpis';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const DAY = 86_400_000;

/** A fully activated trial account, 0% used — override per test. */
function acct(over: Partial<LifecycleAccount> = {}): LifecycleAccount {
  return {
    signupAt: NOW - 3 * DAY, signupStarted: true, emailVerified: true, onboardingComplete: true,
    trialDecision: 'allow', otpVerified: true, trialGranted: true, trialStartedAt: NOW - 3 * DAY,
    trialCreditsTotal: TRIAL_CREDITS, creditBalance: TRIAL_CREDITS,
    firstKeyAt: NOW - 2 * DAY, firstCallAt: NOW - 2 * DAY, lastCallAt: NOW - 3600_000,
    paidAt: null, upgradedBeforeExhaustion: false, plan: 'Trial', walletBalanceCredits: 0, revenueUsd: 0,
    calls7d: 10, keys: [{ id: 'k1', expiresAt: null, status: 'active' }],
    ...over,
  };
}
const balanceForPct = (pct: number) => Math.round(TRIAL_CREDITS * (1 - pct / 100));

describe('primary stage — the journey', () => {
  it('walks Phase 0 → 1 → 2', () => {
    expect(primaryStage(acct({ signupAt: null, signupStarted: false }), NOW)).toBe('C0-a');
    expect(primaryStage(acct({ signupAt: null, signupStarted: true }), NOW)).toBe('C0-b');
    expect(primaryStage(acct({ emailVerified: false }), NOW)).toBe('C1-a');
    expect(primaryStage(acct({ onboardingComplete: false }), NOW)).toBe('C1-b');
    expect(primaryStage(acct({ trialGranted: false, trialDecision: 'pending' }), NOW)).toBe('C1-c');
    expect(primaryStage(acct({ trialGranted: false, trialDecision: 'challenge', otpVerified: false }), NOW)).toBe('C1-d');
    expect(primaryStage(acct({ firstKeyAt: null, firstCallAt: null }), NOW)).toBe('C2-b');
  });

  it('activation and consumption thresholds', () => {
    expect(primaryStage(acct({ firstCallAt: null }), NOW)).toBe('C3-a');
    expect(primaryStage(acct({ creditBalance: TRIAL_CREDITS }), NOW)).toBe('C3-a'); // 0% used
    expect(primaryStage(acct({ creditBalance: balanceForPct(12) }), NOW)).toBe('C3-b');
    expect(primaryStage(acct({ creditBalance: balanceForPct(28) }), NOW)).toBe('C3-c');
    expect(primaryStage(acct({ creditBalance: balanceForPct(52) }), NOW)).toBe('C3-d');
    expect(primaryStage(acct({ creditBalance: balanceForPct(78) }), NOW)).toBe('C3-e');
    expect(primaryStage(acct({ creditBalance: balanceForPct(82) }), NOW)).toBe('C4-a'); // ≥80 → decision
    expect(primaryStage(acct({ creditBalance: 0 }), NOW)).toBe('C3-f'); // 100%
  });

  it('decision window can be triggered by time even at low usage', () => {
    const nearExpiry = acct({ trialStartedAt: NOW - (TRIAL_DURATION_DAYS - 1) * DAY, creditBalance: balanceForPct(20) });
    expect(daysToExpiry(nearExpiry, NOW)).toBe(1);
    expect(primaryStage(nearExpiry, NOW)).toBe('C4-a');
  });

  it('expired unpaid trial → dead-lead stage; paid leaves the funnel', () => {
    const expired = acct({ trialStartedAt: NOW - (TRIAL_DURATION_DAYS + 2) * DAY, firstCallAt: null, firstKeyAt: null });
    expect(isTrialExpired(expired, NOW)).toBe(true);
    expect(primaryStage(expired, NOW)).toBe('C5-a');
    // paid takes precedence over an expired trial
    expect(primaryStage(acct({ ...expired, paidAt: NOW, plan: 'Starter', walletBalanceCredits: 5000, calls7d: 0 }), NOW)).toBe('C6-a');
  });

  it('paid wallet health sub-stages', () => {
    const paid = acct({ paidAt: NOW - DAY, plan: 'Starter', creditBalance: 0 });
    expect(primaryStage({ ...paid, walletBalanceCredits: 10000, calls7d: 0 }, NOW)).toBe('C6-a');   // fresh/idle
    expect(primaryStage({ ...paid, walletBalanceCredits: 1000, calls7d: 100 }, NOW)).toBe('C6-b');  // ~3.8wk runway
    expect(primaryStage({ ...paid, walletBalanceCredits: 10000, calls7d: 100 }, NOW)).toBe('C6-c'); // slow burn
    expect(primaryStage({ ...paid, walletBalanceCredits: 300, calls7d: 100 }, NOW)).toBe('C6-d');   // quick burn
    expect(primaryStage({ ...paid, walletBalanceCredits: 0, calls7d: 100 }, NOW)).toBe('C7-b');     // empty
  });
});

describe('helpers', () => {
  it('trial used %, expiry, and key expiry', () => {
    expect(trialCreditsUsedPct(acct({ creditBalance: balanceForPct(40) }))).toBe(40);
    expect(trialCreditsUsedPct(acct({ paidAt: NOW }))).toBe(100); // paid reads 100 (trial spent first)
    expect(daysToExpiry(acct({ trialStartedAt: NOW - 4 * DAY }), NOW)).toBe(TRIAL_DURATION_DAYS - 4);
    expect(soonestKeyExpiryDays(acct({ keys: [{ id: 'a', expiresAt: NOW + 3 * DAY, status: 'active' }, { id: 'b', expiresAt: NOW + 9 * DAY, status: 'active' }] }), NOW)).toBe(3);
    expect(soonestKeyExpiryDays(acct({ keys: [{ id: 'a', expiresAt: NOW + 3 * DAY, status: 'revoked' }] }), NOW)).toBeNull();
  });
});

describe('active triggers', () => {
  it('consumption milestones are cumulative and add the decision edge past 80%', () => {
    expect(activeTriggers(acct({ creditBalance: balanceForPct(55) }), NOW).sort()).toEqual(['usage_10', 'usage_25', 'usage_50']);
    expect(activeTriggers(acct({ creditBalance: balanceForPct(82) }), NOW).sort()).toEqual(['decision_window', 'usage_10', 'usage_25', 'usage_50', 'usage_75']);
  });
  it('key expiry buckets', () => {
    expect(activeTriggers(acct({ keys: [{ id: 'k', expiresAt: NOW + 3 * DAY, status: 'active' }] }), NOW)).toContain('key_expiry_7');
    expect(activeTriggers(acct({ keys: [{ id: 'k', expiresAt: NOW + 12 * 3600_000, status: 'active' }] }), NOW)).toContain('key_expiry_1');
    expect(activeTriggers(acct({ keys: [{ id: 'k', expiresAt: NOW - DAY, status: 'active' }] }), NOW)).toContain('key_expired');
  });
  it('inactivity and wallet depletion', () => {
    expect(activeTriggers(acct({ lastCallAt: NOW - 8 * DAY }), NOW)).toContain('inactivity_7');
    expect(activeTriggers(acct({ paidAt: NOW, plan: 'Starter', walletBalanceCredits: 300, calls7d: 100 }), NOW)).toContain('wallet_low');
    expect(activeTriggers(acct({ paidAt: NOW, plan: 'Starter', walletBalanceCredits: 0 }), NOW)).toContain('wallet_zero');
  });
  it('maps triggers to Mixpanel events with the right props', () => {
    expect(triggerEvent('usage_50', acct(), NOW)).toEqual({ name: 'usage_threshold_hit', props: { threshold_pct: 50 } });
    expect(triggerEvent('key_expiry_1', acct(), NOW)).toEqual({ name: 'key_expiry_warned', props: { days_remaining: 1 } });
    const inact = triggerEvent('inactivity_7', acct({ lastCallAt: NOW - 9 * DAY }), NOW);
    expect(inact?.name).toBe('inactivity_detected');
    expect(inact?.props.days_inactive).toBe(9);
  });
});

describe('lead score & classification', () => {
  it('classifies across the funnel', () => {
    expect(leadScoreOf(acct({ signupAt: null, signupStarted: false }), NOW).class).toBe('anonymous');
    expect(leadScoreOf(acct({ firstKeyAt: null, firstCallAt: null, creditBalance: TRIAL_CREDITS }), NOW).class).toBe('warm');
    expect(leadScoreOf(acct({ firstCallAt: NOW - DAY, creditBalance: balanceForPct(10) }), NOW).class).toBe('sql');
    expect(leadScoreOf(acct({ creditBalance: balanceForPct(60) }), NOW).class).toBe('sales_ready');
    expect(leadScoreOf(acct({ paidAt: NOW, upgradedBeforeExhaustion: true }), NOW).class).toBe('hot');
    expect(leadScoreOf(acct({ paidAt: NOW, upgradedBeforeExhaustion: false }), NOW).class).toBe('customer');
  });
  it('distinguishes dead (never activated) from called-then-cold', () => {
    const expired = acct({ trialStartedAt: NOW - (TRIAL_DURATION_DAYS + 2) * DAY });
    const dead = leadScoreOf({ ...expired, firstCallAt: null, creditBalance: TRIAL_CREDITS }, NOW);
    expect(dead.class).toBe('dead');
    expect(dead.everActivated).toBe(false);
    const cold = leadScoreOf({ ...expired, firstCallAt: NOW - 10 * DAY, creditBalance: balanceForPct(30) }, NOW);
    expect(cold.class).toBe('sql'); // called, so not "dead"
    expect(cold.everActivated).toBe(true);
  });
  it('sales-routable only for live sales signals', () => {
    expect(leadScoreOf(acct({ firstCallAt: NOW - DAY, creditBalance: balanceForPct(10) }), NOW).salesRoutable).toBe(true); // sql
    expect(leadScoreOf(acct({ creditBalance: balanceForPct(60) }), NOW).salesRoutable).toBe(true); // sales_ready
    expect(leadScoreOf(acct({ paidAt: NOW, upgradedBeforeExhaustion: false }), NOW).salesRoutable).toBe(false); // customer
    expect(leadScoreOf(acct({ firstKeyAt: null, firstCallAt: null, creditBalance: TRIAL_CREDITS }), NOW).salesRoutable).toBe(false); // warm, pre-activation
  });
});

describe('transitions', () => {
  it('detects one-shot journey edges', () => {
    expect(detectTransitions(acct(), acct())).toEqual([]);
    expect(detectTransitions(acct({ trialGranted: false, trialDecision: 'pending' }), acct({ trialGranted: true }))).toEqual(['trial_granted']);
    expect(detectTransitions(acct({ firstKeyAt: null }), acct({ firstKeyAt: NOW }))).toEqual(['first_key']);
    expect(detectTransitions(acct({ firstCallAt: null }), acct({ firstCallAt: NOW }))).toEqual(['first_call']);
    expect(detectTransitions(acct({ paidAt: null }), acct({ paidAt: NOW, upgradedBeforeExhaustion: false }))).toEqual(['upgraded_in_trial']);
    expect(detectTransitions(acct({ paidAt: null }), acct({ paidAt: NOW, upgradedBeforeExhaustion: true }))).toEqual(['direct_upgrade']);
    expect(detectTransitions(acct({ paidAt: NOW - DAY, walletBalanceCredits: 100 }), acct({ paidAt: NOW - DAY, walletBalanceCredits: 5000 }))).toEqual(['reup']);
  });
  it('does not fire when nothing changed or balance drops', () => {
    expect(detectTransitions(acct({ paidAt: NOW, walletBalanceCredits: 5000 }), acct({ paidAt: NOW, walletBalanceCredits: 1000 }))).toEqual([]);
  });
});

describe('conversion & wallet milestones (Step 3)', () => {
  it('inDecisionWindow by usage or time, never when paid or pre-activation', () => {
    expect(inDecisionWindow(acct({ creditBalance: balanceForPct(82) }), NOW)).toBe(true);
    expect(inDecisionWindow(acct({ creditBalance: balanceForPct(40) }), NOW)).toBe(false);
    expect(inDecisionWindow(acct({ trialStartedAt: NOW - (TRIAL_DURATION_DAYS - 1) * DAY, creditBalance: balanceForPct(20) }), NOW)).toBe(true);
    expect(inDecisionWindow(acct({ paidAt: NOW, creditBalance: balanceForPct(90) }), NOW)).toBe(false);
    expect(inDecisionWindow(acct({ firstCallAt: null, creditBalance: balanceForPct(90) }), NOW)).toBe(false);
  });
  it('walletRunwayDays from 7-day burn', () => {
    expect(walletRunwayDays(acct({ paidAt: NOW, walletBalanceCredits: 2600, calls7d: 70 }))).toBe(100);
    expect(walletRunwayDays(acct({ paidAt: NOW, walletBalanceCredits: 0, calls7d: 70 }))).toBe(0);
    expect(walletRunwayDays(acct({ paidAt: NOW, walletBalanceCredits: 5000, calls7d: 0 }))).toBeNull();
  });
  it('detectStateMilestones fires once per crossing', () => {
    const decision = detectStateMilestones(acct({ creditBalance: balanceForPct(40) }), acct({ creditBalance: balanceForPct(85) }), NOW);
    expect(decision.map((m) => m.name)).toEqual(['decision_window_entered']);
    const quick = detectStateMilestones(acct({ paidAt: NOW, walletBalanceCredits: 10000, calls7d: 0 }), acct({ paidAt: NOW, walletBalanceCredits: 300, calls7d: 100 }), NOW);
    expect(quick.map((m) => m.name)).toContain('wallet_low');
    const empty = detectStateMilestones(acct({ paidAt: NOW, walletBalanceCredits: 500 }), acct({ paidAt: NOW, walletBalanceCredits: 0 }), NOW);
    expect(empty.map((m) => m.name).sort()).toEqual(['dunning_started', 'wallet_zero']);
    // no double-fire when already in the state
    expect(detectStateMilestones(acct({ creditBalance: balanceForPct(85) }), acct({ creditBalance: balanceForPct(90) }), NOW)).toEqual([]);
  });
});

describe('accountFromDeveloper (cockpit population view)', () => {
  it('maps a developer record onto a lifecycle account and back to a plausible stage', () => {
    const paid = accountFromDeveloper({ signupAt: NOW - 20 * DAY, firstKeyAt: NOW - 19 * DAY, firstCallAt: NOW - 19 * DAY, calls7d: 60, trialCreditsUsedPct: 100, paidAt: NOW - 5 * DAY, walletBalanceCredits: 8000, revenueUsd: 199, plan: 'Starter' }, NOW);
    expect(paid.paidAt).not.toBeNull();
    expect(['C6-a', 'C6-b', 'C6-c', 'C6-d', 'C7-b']).toContain(primaryStage(paid, NOW));
    const trial = accountFromDeveloper({ signupAt: NOW - 2 * DAY, firstKeyAt: NOW - DAY, firstCallAt: NOW - DAY, calls7d: 5, trialCreditsUsedPct: 30, paidAt: null, walletBalanceCredits: 0, revenueUsd: 0, plan: 'Trial' }, NOW);
    expect(trial.creditBalance).toBe(Math.round(TRIAL_CREDITS * 0.7));
    expect(primaryStage(trial, NOW)).toBe('C3-c'); // 30% used
    const noKey = accountFromDeveloper({ signupAt: NOW - DAY, firstKeyAt: null, firstCallAt: null, calls7d: 0, trialCreditsUsedPct: 0, paidAt: null, walletBalanceCredits: 0, revenueUsd: 0, plan: 'Trial' }, NOW);
    expect(noKey.onboardingComplete).toBe(false);
    expect(primaryStage(noKey, NOW)).toBe('C1-b'); // no key → still onboarding
  });
});

describe('stage catalog integrity', () => {
  it('has metadata for all 24 stages with valid funnel/priority', () => {
    expect(ALL_STAGES).toHaveLength(24);
    ALL_STAGES.forEach((s) => {
      const m = STAGE_META[s];
      expect(m.code).toBe(s);
      expect(['lead', 'feature', 'both']).toContain(m.funnel);
      expect(['P0', 'P1', 'P2']).toContain(m.priority);
      expect(m.event).toBeTruthy();
    });
  });
  it('the four sales-signal stages are tagged', () => {
    const signals = ALL_STAGES.filter((s) => STAGE_META[s].salesSignal).map((s) => s as LifecycleStage);
    expect(signals.sort()).toEqual(['C3-a', 'C3-d', 'C5-a', 'C5-c']);
  });
});
