'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useGrowthLiveInputs } from '@/components/GrowthAlertsWatcher';
import { liveDeveloperRecord, TRIAL_CREDITS } from '@/lib/growth-kpis';
import { useNudgeState } from '@/lib/nudges';
import { TRIAL_DURATION_DAYS, type LifecycleAccount, type LifecycleKey } from '@/lib/lifecycle';

const DAY = 86_400_000;

/**
 * The console-side adapter: maps live store state to a `LifecycleAccount` (the
 * `lib/lifecycle.ts` input contract), reusing the growth-kpis `liveDeveloperRecord`
 * for the funnel/wallet fields and reading trial / onboarding / key-expiry from the
 * store. One place, so the nudge orchestrator, the cockpit (Step 5) and tests agree.
 *
 * Account-gate fields (email verified, trial decision, OTP) default to "cleared" in
 * the console — a user who is in the console is past those gates; the pre-auth
 * surfaces (Step 6) drive C0/C1-a with their own state.
 */
export function useLifecycleAccount(now: number): LifecycleAccount {
  const { live } = useGrowthLiveInputs();
  const { activeKeys, creditBalance, completedOnboardingSteps } = useStore();
  const persistedTrialStart = useNudgeState((s) => s.trialStartedAt);

  return useMemo<LifecycleAccount>(() => {
    const dev = liveDeveloperRecord(live, now);
    const keys: LifecycleKey[] = activeKeys.map((k) => ({
      id: k.id,
      expiresAt: k.expiresAt ? Date.parse(k.expiresAt) : null,
      status: k.status,
    }));
    const onboardingComplete = activeKeys.length > 0 || completedOnboardingSteps.includes('firstCall');

    // Anchor the trial window so a live (non-paid) demo account stays mid-trial rather
    // than reading "expired" off an old seeded signup — keeps the console in the active
    // consumption funnel. A genuinely recent signup keeps its real remaining days; the
    // dead-lead path (C5-a) is exercised in the cockpit/scenarios, not the live console.
    const daysSinceSignup = dev.signupAt !== null ? Math.max(0, Math.floor((now - dev.signupAt) / DAY)) : 0;
    const cappedTrialAgeDays = Math.min(daysSinceSignup, TRIAL_DURATION_DAYS - 4);
    const derivedTrialStart = dev.paidAt !== null ? dev.signupAt : now - cappedTrialAgeDays * DAY;
    // Prefer the persisted authoritative start (Step 3) so the window counts down stably.
    const trialStartedAt = persistedTrialStart ?? derivedTrialStart;

    return {
      signupAt: dev.signupAt,
      signupStarted: true,
      emailVerified: true,
      onboardingComplete,
      trialDecision: 'allow',
      otpVerified: true,
      trialGranted: true,
      trialStartedAt,
      trialCreditsTotal: TRIAL_CREDITS,
      creditBalance,
      firstKeyAt: dev.firstKeyAt,
      firstCallAt: dev.firstCallAt,
      lastCallAt: live.requestLog.reduce<number | null>((max, l) => {
        const t = Date.parse(l.timestamp);
        return Number.isFinite(t) && (max === null || t > max) ? t : max;
      }, dev.firstCallAt),
      paidAt: dev.paidAt,
      upgradedBeforeExhaustion: dev.paidAt !== null && dev.trialCreditsUsedPct < 100,
      plan: dev.plan,
      walletBalanceCredits: creditBalance,
      revenueUsd: dev.revenueUsd,
      calls7d: dev.calls7d,
      keys,
    };
  }, [live, now, activeKeys, creditBalance, completedOnboardingSteps, persistedTrialStart]);
}
