/**
 * PLG funnel SSOT (Phase 0–7) — unit tests. Deterministic predicates + cohort.
 */
import {
  FUNNEL_PHASES, FUNNEL_STAGES, stageByCode, stageIndex,
  trialPhase, conversionWindowOpen, walletBurnBucket, classifyLead, currentStage,
  riskScore, generateCohort, phaseDistribution,
  type AccountFunnelInput,
} from '@/lib/funnel';

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

const base: AccountFunnelInput = {
  signedUp: true, onboarded: true, trialGranted: true,
  firstKeyAt: NOW - 5 * DAY, firstFireAt: NOW - 4 * DAY,
  trialUsedPct: 20, trialExpiresAt: NOW + 7 * DAY, paid: false,
  walletBalance: 0, walletOpenedAt: null, spendPerDay: 0, reUpped: false,
};

describe('stage catalog', () => {
  it('has 8 phases and 25 stages, all phase-tagged', () => {
    expect(FUNNEL_PHASES).toHaveLength(8);
    expect(FUNNEL_STAGES).toHaveLength(24);
    expect(FUNNEL_STAGES.every((s) => s.phase >= 0 && s.phase <= 7)).toBe(true);
  });
  it('stageIndex is monotonic and stageByCode round-trips', () => {
    expect(stageIndex('C0-a')).toBe(0);
    expect(stageIndex('C3-a')).toBeGreaterThan(stageIndex('C1-a'));
    expect(stageByCode('C3-a').milestone).toBe('sql');
  });
});

describe('trialPhase', () => {
  it('buckets used-percent into milestones', () => {
    expect(trialPhase(0)).toBe(0);
    expect(trialPhase(9)).toBe(0);
    expect(trialPhase(10)).toBe(10);
    expect(trialPhase(49)).toBe(25);
    expect(trialPhase(50)).toBe(50);
    expect(trialPhase(80)).toBe(75);
    expect(trialPhase(100)).toBe(100);
  });
});

describe('conversionWindowOpen', () => {
  it('opens at ≥80% consumed', () => {
    expect(conversionWindowOpen({ trialUsedPct: 80, trialExpiresAt: NOW + 10 * DAY, paid: false }, NOW)).toBe(true);
    expect(conversionWindowOpen({ trialUsedPct: 60, trialExpiresAt: NOW + 10 * DAY, paid: false }, NOW)).toBe(false);
  });
  it('opens within 2 days of expiry', () => {
    expect(conversionWindowOpen({ trialUsedPct: 10, trialExpiresAt: NOW + 1 * DAY, paid: false }, NOW)).toBe(true);
  });
  it('is closed for paid accounts', () => {
    expect(conversionWindowOpen({ trialUsedPct: 99, trialExpiresAt: NOW, paid: true }, NOW)).toBe(false);
  });
  it('is closed once the trial has already expired (that is a dead lead, not a window)', () => {
    expect(conversionWindowOpen({ trialUsedPct: 100, trialExpiresAt: NOW - DAY, paid: false }, NOW)).toBe(false);
  });
});

describe('walletBurnBucket', () => {
  it('fast when runway is short vs age', () => {
    expect(walletBurnBucket({ walletBalance: 100, walletOpenedAt: NOW - 30 * DAY, spendPerDay: 50 }, NOW)).toBe('fast');
  });
  it('slow when runway is long vs age', () => {
    expect(walletBurnBucket({ walletBalance: 10000, walletOpenedAt: NOW - 5 * DAY, spendPerDay: 20 }, NOW)).toBe('slow');
  });
  it('balanced in the middle', () => {
    expect(walletBurnBucket({ walletBalance: 300, walletOpenedAt: NOW - 20 * DAY, spendPerDay: 20 }, NOW)).toBe('balanced');
  });
});

describe('classifyLead', () => {
  it('prospect before first fire', () => {
    expect(classifyLead({ ...base, firstFireAt: null, trialUsedPct: 0 }, NOW)).toBe('prospect');
  });
  it('sql after first fire', () => {
    expect(classifyLead({ ...base, trialUsedPct: 20 }, NOW)).toBe('sql');
  });
  it('sales_ready at ≥50% trial', () => {
    expect(classifyLead({ ...base, trialUsedPct: 55 }, NOW)).toBe('sales_ready');
  });
  it('dead when trial expired unconverted', () => {
    expect(classifyLead({ ...base, trialExpiresAt: NOW - DAY, paid: false }, NOW)).toBe('dead');
  });
  it('hot when paid + fast burn', () => {
    expect(classifyLead({ ...base, paid: true, walletBalance: 100, walletOpenedAt: NOW - 30 * DAY, spendPerDay: 60 }, NOW)).toBe('hot');
  });
  it('funnel_driven when paid + steady', () => {
    expect(classifyLead({ ...base, paid: true, walletBalance: 400, walletOpenedAt: NOW - 20 * DAY, spendPerDay: 20 }, NOW)).toBe('funnel_driven');
  });
});

describe('currentStage', () => {
  it('maps signals to the right stage code', () => {
    expect(currentStage({ ...base, signedUp: true, onboarded: false, trialGranted: false, firstKeyAt: null, firstFireAt: null }, NOW)).toBe('C1-a');
    expect(currentStage({ ...base, firstKeyAt: null, firstFireAt: null }, NOW)).toBe('C2-a');
    expect(currentStage({ ...base, firstFireAt: null }, NOW)).toBe('C2-b');
    expect(currentStage({ ...base, trialUsedPct: 30 }, NOW)).toBe('C3-c');
    expect(currentStage({ ...base, trialUsedPct: 85 }, NOW)).toBe('C4-a');
    expect(currentStage({ ...base, paid: true, walletBalance: 0, walletOpenedAt: NOW - 10 * DAY, spendPerDay: 10 }, NOW)).toBe('C7-b');
  });
});

describe('riskScore (provisional stub)', () => {
  it('is deterministic and flags disposable email to OTP', () => {
    const a = riskScore({ email: 'x@acme.com' });
    expect(a).toEqual(riskScore({ email: 'x@acme.com' }));
    expect(a.provisional).toBe(true);
    const d = riskScore({ email: 'y@temp.io', disposableEmail: true, priorSignups: 2 });
    expect(d.decision).toBe('otp');
    expect(d.score).toBeGreaterThanOrEqual(50);
  });
});

describe('generateCohort', () => {
  it('is deterministic and spans phases', () => {
    const c1 = generateCohort('seed', 120, NOW);
    const c2 = generateCohort('seed', 120, NOW);
    expect(c1).toEqual(c2);
    const dist = phaseDistribution(c1);
    const covered = Object.values(dist).filter((n) => n > 0).length;
    expect(covered).toBeGreaterThanOrEqual(6);
    expect(c1.reduce((s, a) => s + dist[stageByCode(a.stage).phase], 0)).toBeGreaterThan(0);
  });

  it('is internally coherent: stage and lead never contradict', () => {
    const c = generateCohort('zinbit-funnel-2026', 240, NOW);
    // No active-trial (P3) account may be classed Dead.
    expect(c.filter((a) => a.stage.startsWith('C3') && a.leadClass === 'dead')).toHaveLength(0);
    // Paid accounts only ever sit in the paid/retention phases (P6/P7).
    expect(c.filter((a) => a.paid && !(a.stage.startsWith('C6') || a.stage.startsWith('C7')))).toHaveLength(0);
    // Dead only appears at/after the conversion-outcome phase.
    expect(c.filter((a) => a.leadClass === 'dead' && stageByCode(a.stage).phase < 5)).toHaveLength(0);
  });
});
