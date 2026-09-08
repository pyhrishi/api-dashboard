import {
  NUDGE_CATALOG, activeNudges, eligibleNudges, topModal, frequencyOk, isDismissed, isSnoozed, nudgeStats,
  catalogCoversStage, inProduct, useNudgeState, nudgeById, TRANSITION_NUDGE, resolveNudge,
  type NudgeStateData, type NudgeSpec,
} from '@/lib/nudges';
import { ALL_STAGES, type LifecycleAccount } from '@/lib/lifecycle';
import { TRIAL_CREDITS } from '@/lib/growth-kpis';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const DAY = 86_400_000;

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
const emptyState = (): NudgeStateData => ({ records: {}, unsubscribed: false, leadScore: 0, leadClass: 'anonymous', lastStage: null, stageHistory: [], profile: { role: null, useCase: null, captured: false, skipped: false }, trialStartedAt: null, deliveries: [], reengagementTouches: {}, simulatedOffsetMs: 0 });
const balanceForPct = (pct: number) => Math.round(TRIAL_CREDITS * (1 - pct / 100));

describe('catalog integrity', () => {
  it('serves every one of the 24 lifecycle stages', () => {
    ALL_STAGES.forEach((s) => expect(catalogCoversStage(s)).toBe(true));
  });
  it('every entry has a unique id and non-empty copy', () => {
    const ids = NUDGE_CATALOG.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    NUDGE_CATALOG.forEach((n) => { expect(n.title).toBeTruthy(); expect(n.body).toBeTruthy(); expect(n.channels.length).toBeGreaterThan(0); });
  });
  it('in-app nudges carry an actionable CTA (except passive progress indicators)', () => {
    NUDGE_CATALOG.filter((n) => inProduct(n) && n.surface !== 'progress').forEach((n) => {
      expect(Boolean(n.cta)).toBe(true);
    });
  });
  it('"don\'t nag" healthy stages are email-only (no in-app)', () => {
    ['n-c6a-healthy', 'n-c6b-balanced'].forEach((id) => expect(inProduct(nudgeById(id) as NudgeSpec)).toBe(false));
  });
  it('every transition maps to a real catalog nudge, and celebrations are transition-only', () => {
    Object.keys(TRANSITION_NUDGE).forEach((t) => {
      const id = TRANSITION_NUDGE[t as keyof typeof TRANSITION_NUDGE] as string;
      expect(Boolean(nudgeById(id))).toBe(true);
    });
    // The first-fire celebration must never surface via ordinary stage/trigger selection.
    const celebrate = acct({ firstCallAt: NOW - DAY, creditBalance: TRIAL_CREDITS });
    expect(eligibleNudges(celebrate, NOW).map((n) => n.id)).not.toContain('n-c3a-celebrate');
  });
});

describe('selection', () => {
  it('shows the first-key nudge at C2-b and nothing dismissed', () => {
    const a = acct({ firstKeyAt: null, firstCallAt: null });
    const shown = activeNudges(a, emptyState(), NOW);
    expect(shown.map((n) => n.id)).toContain('n-c2b-firstkey');
  });
  it('the consumption cascade suppresses lower milestones — only the current one is eligible', () => {
    // At 55% used, the 10% and 25% progress nudges are superseded; only the 50% banner shows.
    const ids = eligibleNudges(acct({ creditBalance: balanceForPct(55) }), NOW).map((n) => n.id);
    expect(ids).toContain('n-c3d-used50');
    expect(ids).not.toContain('n-c3b-used10');
    expect(ids).not.toContain('n-c3c-used25');
    expect(ids).not.toContain('n-c3e-used75');
    // At 100%, every lower consumption nudge is suppressed; only the exhausted modal remains.
    const at100 = eligibleNudges(acct({ creditBalance: 0 }), NOW).map((n) => n.id);
    expect(at100).toContain('n-c3f-used100');
    ['n-c3b-used10', 'n-c3c-used25', 'n-c3d-used50', 'n-c3e-used75', 'n-c4a-decision'].forEach((id) => expect(at100).not.toContain(id));
  });
  it('sorts by priority (P0 first)', () => {
    const a = acct({ creditBalance: balanceForPct(82) }); // decision (P0) + progress (P1) + banners
    const shown = activeNudges(a, emptyState(), NOW);
    expect(shown[0].priority).toBe('P0');
  });
  it('resolveNudge injects live data into the decision-window copy', () => {
    const spec = nudgeById('n-c4a-decision') as NudgeSpec;
    const r = resolveNudge(spec, acct({ creditBalance: balanceForPct(85) }), NOW);
    expect(r.body).toMatch(/85% of your trial/);
    expect(r.body).not.toEqual(spec.body); // context overrode the static copy
    // a nudge without context falls back to its catalog copy
    const plain = nudgeById('n-c2b-firstkey') as NudgeSpec;
    expect(resolveNudge(plain, acct(), NOW).body).toEqual(plain.body);
  });
  it('topModal picks the highest-priority modal/celebration', () => {
    const a = acct({ creditBalance: 0 }); // 100% used → C3-f modal
    const m = topModal(a, emptyState(), NOW);
    expect(m?.id).toBe('n-c3f-used100');
  });
  it('dismissed and snoozed nudges are withheld', () => {
    const a = acct({ firstKeyAt: null, firstCallAt: null });
    const dismissed: NudgeStateData = { ...emptyState(), records: { 'n-c2b-firstkey': { id: 'n-c2b-firstkey', status: 'dismissed', seenCount: 1, firstSeenAt: NOW, lastSeenAt: NOW } } };
    expect(activeNudges(a, dismissed, NOW).map((n) => n.id)).not.toContain('n-c2b-firstkey');
    expect(isDismissed(dismissed, 'n-c2b-firstkey')).toBe(true);
    const snoozed: NudgeStateData = { ...emptyState(), records: { 'n-c2b-firstkey': { id: 'n-c2b-firstkey', status: 'snoozed', seenCount: 1, firstSeenAt: NOW, lastSeenAt: NOW, snoozedUntil: NOW + DAY } } };
    expect(isSnoozed(snoozed, 'n-c2b-firstkey', NOW)).toBe(true);
    expect(isSnoozed(snoozed, 'n-c2b-firstkey', NOW + 2 * DAY)).toBe(false); // snooze expires
  });
});

describe('frequency capping', () => {
  const once = NUDGE_CATALOG.find((n) => n.frequency.cap === 0) as NudgeSpec;
  const capped = NUDGE_CATALOG.find((n) => n.frequency.cap > 0) as NudgeSpec;
  it('cap 0 = show once ever', () => {
    const fresh = emptyState();
    expect(frequencyOk(fresh, once, NOW)).toBe(true);
    const seen: NudgeStateData = { ...fresh, records: { [once.id]: { id: once.id, status: 'active', seenCount: 1, firstSeenAt: NOW, lastSeenAt: NOW } } };
    expect(frequencyOk(seen, once, NOW)).toBe(false);
  });
  it('capped nudges honour the rolling window', () => {
    const atCap: NudgeStateData = { ...emptyState(), records: { [capped.id]: { id: capped.id, status: 'active', seenCount: capped.frequency.cap, firstSeenAt: NOW, lastSeenAt: NOW } } };
    expect(frequencyOk(atCap, capped, NOW)).toBe(false); // inside window, at cap
    const afterWindow = NOW + (capped.frequency.windowHours + 1) * 3_600_000;
    expect(frequencyOk(atCap, capped, afterWindow)).toBe(true); // window rolled over
  });
});

describe('useNudgeState store', () => {
  beforeEach(() => useNudgeState.getState().resetNudges());
  it('records shows, dismiss, snooze, convert', () => {
    const s = useNudgeState.getState();
    s.recordShown('n-c2b-firstkey', NOW);
    s.recordShown('n-c2b-firstkey', NOW + 1000);
    expect(useNudgeState.getState().records['n-c2b-firstkey'].seenCount).toBe(2);
    s.dismiss('n-c2b-firstkey', NOW + 2000);
    expect(useNudgeState.getState().records['n-c2b-firstkey'].status).toBe('dismissed');
    // a dismissed nudge is not re-shown
    s.recordShown('n-c2b-firstkey', NOW + 3000);
    expect(useNudgeState.getState().records['n-c2b-firstkey'].seenCount).toBe(2);
    s.convert('n-c3f-used100', NOW);
    expect(useNudgeState.getState().records['n-c3f-used100'].convertedAt).toBe(NOW);
  });
  it('recordStage dedupes consecutive identical stages and keeps history', () => {
    const s = useNudgeState.getState();
    expect(s.recordStage('C2-b', NOW)).toBe(true);
    expect(s.recordStage('C2-b', NOW + 1000)).toBe(false);
    expect(s.recordStage('C3-a', NOW + 2000)).toBe(true);
    expect(useNudgeState.getState().stageHistory.map((h) => h.stage)).toEqual(['C2-b', 'C3-a']);
  });
  it('nudgeStats summarizes the funnel', () => {
    const s = useNudgeState.getState();
    s.recordShown('a', NOW); s.recordShown('b', NOW); s.convert('a', NOW); s.dismiss('c', NOW);
    const stats = nudgeStats(useNudgeState.getState());
    expect(stats.shown).toBe(2);
    expect(stats.converted).toBe(1);
    expect(stats.conversionPct).toBe(50);
  });
});
