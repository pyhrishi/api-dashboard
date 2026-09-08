/**
 * PLG funnel — single source of truth (Phase 0–7).
 *
 * Models Zintlr's growth funnel from an anonymous TOFU visitor through trial,
 * activation, conversion, wallet health, and churn. Every funnel surface — the
 * landing page, the in-product nudges, and the CSM/lifecycle cockpit — reads the
 * predicates here, so the funnel is one coherent lens over real state rather than
 * scattered conditionals.
 *
 * Everything is PURE and deterministic (FNV, injected `now`, no `Math.random`), so
 * the stage a given account sits in, the cohort distribution on the board, and the
 * lead classification are all reproducible and unit-testable.
 *
 * NOTE: `riskScore` is a documented STUB pending "Section B" (the trial risk +
 * OTP-request rules). Its shape is final; the thresholds are provisional and clearly
 * marked, so Phase-1 (M2) can wire the gate and swap the rule set in later.
 */

// ── Phases & stages ───────────────────────────────────────────────────────────

export type FunnelPhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FunnelPhase {
  id: FunnelPhaseId;
  label: string;
  /** Which broad funnel band this phase belongs to. */
  band: 'acquisition' | 'activation' | 'conversion' | 'retention';
}

export const FUNNEL_PHASES: FunnelPhase[] = [
  { id: 0, label: 'Pre-account (TOFU)', band: 'acquisition' },
  { id: 1, label: 'Account & trial gate', band: 'activation' },
  { id: 2, label: 'Trial provisioning', band: 'activation' },
  { id: 3, label: 'Activation & consumption', band: 'activation' },
  { id: 4, label: 'Conversion window', band: 'conversion' },
  { id: 5, label: 'Conversion outcome', band: 'conversion' },
  { id: 6, label: 'Paid wallet health', band: 'retention' },
  { id: 7, label: 'Re-up / churn', band: 'retention' },
];

/** Stable stage codes matching the funnel spec (C0-a … C7-b). */
export type FunnelStageCode =
  | 'C0-a' | 'C0-b'
  | 'C1-a' | 'C1-b' | 'C1-c' | 'C1-d'
  | 'C2-a' | 'C2-b'
  | 'C3-a' | 'C3-b' | 'C3-c' | 'C3-d' | 'C3-e' | 'C3-f'
  | 'C4-a'
  | 'C5-a' | 'C5-b' | 'C5-c'
  | 'C6-a' | 'C6-b' | 'C6-c' | 'C6-d'
  | 'C7-a' | 'C7-b';

export interface FunnelStage {
  code: FunnelStageCode;
  phase: FunnelPhaseId;
  label: string;
  description: string;
  /** A key milestone the funnel is optimized around (shown emphasized). */
  milestone?: 'sql' | 'sales_ready' | 'decision' | 'converted' | 'dead' | 'churn_risk';
}

export const FUNNEL_STAGES: FunnelStage[] = [
  { code: 'C0-a', phase: 0, label: 'Landed on LP', description: 'Anonymous visitor on the API landing page; de-anon + instrumentation active.' },
  { code: 'C0-b', phase: 0, label: 'On sign-up / login', description: 'Reached the auth surface (sandbox-fire gate or CTA).' },
  { code: 'C1-a', phase: 1, label: 'Signed up', description: 'Account created / logged in.' },
  { code: 'C1-b', phase: 1, label: 'Onboarded', description: 'Cleared onboarding — role + use-case captured.' },
  { code: 'C1-c', phase: 1, label: 'Availed trial', description: 'Requested trial; risk evaluated (instant grant or OTP).' },
  { code: 'C1-d', phase: 1, label: 'Passed OTP', description: 'Phone OTP verified (only when the risk gate triggered it).' },
  { code: 'C2-a', phase: 2, label: 'Trial provisioned', description: 'Free credits granted (Public APIs only; spent before paid).' },
  { code: 'C2-b', phase: 2, label: 'First key generated', description: 'First API key created (PM path = one click).' },
  { code: 'C3-a', phase: 3, label: 'First API fire', description: 'First successful call (<10 min target).', milestone: 'sql' },
  { code: 'C3-b', phase: 3, label: '10% trial used', description: 'Early consumption signal.' },
  { code: 'C3-c', phase: 3, label: '25% trial used', description: 'Building habit.' },
  { code: 'C3-d', phase: 3, label: '50% trial used', description: 'Halfway — sales-ready.', milestone: 'sales_ready' },
  { code: 'C3-e', phase: 3, label: '75% trial used', description: 'Heavy trial engagement.' },
  { code: 'C3-f', phase: 3, label: '100% trial used', description: 'Trial fully consumed.' },
  { code: 'C4-a', phase: 4, label: 'Decision window', description: '≥80% consumed or ≤2 days to expiry — the conversion moment.', milestone: 'decision' },
  { code: 'C5-a', phase: 5, label: 'Expired, not activated', description: 'Dead lead — win-back sequence runs first.', milestone: 'dead' },
  { code: 'C5-b', phase: 5, label: 'Upgraded in-trial', description: 'Funnel-driven lead — converted during trial.', milestone: 'converted' },
  { code: 'C5-c', phase: 5, label: 'Direct upgrade', description: 'Hot lead — topped up without exhausting trial; AE on high spend.', milestone: 'converted' },
  { code: 'C6-a', phase: 6, label: 'Paid active', description: 'First top-up complete; baseline healthy paying state.' },
  { code: 'C6-b', phase: 6, label: 'Balanced burn', description: 'Balance vs. time ≈ 1:1 — good, just monitor.' },
  { code: 'C6-c', phase: 6, label: 'Slow burn', description: 'Off-proportion — feature-discovery nudge; happy vs. stalling.', milestone: 'churn_risk' },
  { code: 'C6-d', phase: 6, label: 'Fast burn', description: 'Heavy user — low-balance alert + auto-reload.' },
  { code: 'C7-a', phase: 7, label: 'Re-upped', description: 'Topped up again — retention / LTV.' },
  { code: 'C7-b', phase: 7, label: 'Zero balance', description: 'No upgrade yet — dunning + revocation warning.', milestone: 'churn_risk' },
];

const STAGE_BY_CODE: Record<string, FunnelStage> =
  FUNNEL_STAGES.reduce((acc, s) => { acc[s.code] = s; return acc; }, {} as Record<string, FunnelStage>);

export function stageByCode(code: FunnelStageCode): FunnelStage { return STAGE_BY_CODE[code]; }
export function stageIndex(code: FunnelStageCode): number { return FUNNEL_STAGES.findIndex((s) => s.code === code); }
export function phaseById(id: FunnelPhaseId): FunnelPhase { return FUNNEL_PHASES[id]; }

// ── Lead classification & buckets ─────────────────────────────────────────────

export type LeadClass = 'prospect' | 'sql' | 'sales_ready' | 'funnel_driven' | 'hot' | 'dead';
export type BurnBucket = 'balanced' | 'slow' | 'fast';

export const LEAD_LABELS: Record<LeadClass, string> = {
  prospect: 'Prospect',
  sql: 'Sales Qualified',
  sales_ready: 'Sales Ready',
  funnel_driven: 'Funnel-Driven',
  hot: 'Hot',
  dead: 'Dead',
};

const DAY = 86_400_000;

// ── Deterministic hashing ─────────────────────────────────────────────────────

export function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Account funnel snapshot ───────────────────────────────────────────────────

/** The live signals used to place an account on the funnel. */
export interface AccountFunnelInput {
  signedUp: boolean;
  onboarded: boolean;
  trialGranted: boolean;
  firstKeyAt: number | null;
  firstFireAt: number | null;
  /** 0–100 percent of trial credits consumed. */
  trialUsedPct: number;
  trialExpiresAt: number | null;
  paid: boolean;
  walletBalance: number;
  walletOpenedAt: number | null;
  /** Credits burned per day (rolling). */
  spendPerDay: number;
  /** True once the account has topped up at least once after going paid. */
  reUpped: boolean;
}

/** Which C3 consumption milestone a used-percent has reached. */
export function trialPhase(usedPct: number): 0 | 10 | 25 | 50 | 75 | 100 {
  if (usedPct >= 100) return 100;
  if (usedPct >= 75) return 75;
  if (usedPct >= 50) return 50;
  if (usedPct >= 25) return 25;
  if (usedPct >= 10) return 10;
  return 0;
}

/** The conversion decision window: ≥80% consumed OR within ~2 days of expiry. */
export function conversionWindowOpen(input: Pick<AccountFunnelInput, 'trialUsedPct' | 'trialExpiresAt' | 'paid'>, now: number): boolean {
  if (input.paid) return false;
  // An already-expired trial is a dead lead (win-back), not an open conversion window.
  if (input.trialExpiresAt != null && input.trialExpiresAt <= now) return false;
  if (input.trialUsedPct >= 80) return true;
  if (input.trialExpiresAt != null) return input.trialExpiresAt - now <= 2 * DAY;
  return false;
}

/**
 * Wallet burn bucket for a paying account. Compares the remaining runway (balance /
 * spendPerDay, in days) against the time the wallet has been open. Roughly-1:1 is
 * balanced; lots of runway left relative to age is slow; little runway is fast.
 */
export function walletBurnBucket(input: Pick<AccountFunnelInput, 'walletBalance' | 'walletOpenedAt' | 'spendPerDay'>, now: number): BurnBucket {
  const { walletBalance, walletOpenedAt, spendPerDay } = input;
  if (!walletOpenedAt || spendPerDay <= 0) return 'slow';
  const runwayDays = walletBalance / spendPerDay;
  const ageDays = Math.max(1, (now - walletOpenedAt) / DAY);
  const ratio = runwayDays / ageDays;
  if (ratio > 2) return 'slow';   // lots of runway relative to age → under-using
  if (ratio < 0.5) return 'fast'; // burning it down quickly → heavy user
  return 'balanced';
}

/** Classify a lead deterministically from its funnel signals. */
export function classifyLead(input: AccountFunnelInput, now: number): LeadClass {
  if (input.paid) {
    // A paying account that topped up quickly / burns fast reads as Hot.
    if (input.reUpped || walletBurnBucket(input, now) === 'fast') return 'hot';
    return 'funnel_driven';
  }
  if (input.trialExpiresAt != null && input.trialExpiresAt < now && input.trialUsedPct < 100 && !input.firstFireAt) return 'dead';
  if (input.trialExpiresAt != null && input.trialExpiresAt < now && !input.paid) return 'dead';
  if (input.trialUsedPct >= 50) return 'sales_ready';
  if (input.firstFireAt) return 'sql';
  return 'prospect';
}

/** The single stage code an account currently occupies. */
export function currentStage(input: AccountFunnelInput, now: number): FunnelStageCode {
  if (input.paid) {
    if (input.walletBalance <= 0) return 'C7-b';
    if (input.reUpped) return 'C7-a';
    const bucket = walletBurnBucket(input, now);
    return bucket === 'fast' ? 'C6-d' : bucket === 'slow' ? 'C6-c' : 'C6-b';
  }
  if (input.trialExpiresAt != null && input.trialExpiresAt < now) return 'C5-a'; // expired, not converted
  if (conversionWindowOpen(input, now)) return 'C4-a';
  if (input.firstFireAt) {
    const p = trialPhase(input.trialUsedPct);
    return p === 100 ? 'C3-f' : p === 75 ? 'C3-e' : p === 50 ? 'C3-d' : p === 25 ? 'C3-c' : p === 10 ? 'C3-b' : 'C3-a';
  }
  if (input.firstKeyAt) return 'C2-b';
  if (input.trialGranted) return 'C2-a';
  if (input.onboarded) return 'C1-b';
  if (input.signedUp) return 'C1-a';
  return 'C0-a';
}

// ── Risk score (STUB — pending Section B) ─────────────────────────────────────

export interface RiskSignals {
  email: string;
  /** ISO country of the signup, if known. */
  country?: string;
  /** Disposable/free email domain flag. */
  disposableEmail?: boolean;
  /** Prior signups from the same device/IP fingerprint. */
  priorSignups?: number;
}

export interface RiskDecision {
  score: number;              // 0 (safe) – 100 (risky)
  decision: 'grant' | 'otp';  // instant free credits, or require OTP (with skip)
  /** Provisional until Section B lands. */
  provisional: true;
  reasons: string[];
}

/**
 * PROVISIONAL trial-risk gate. Deterministic placeholder until Section B specifies
 * the real criteria. Shape is final so M2 can wire the gate now and swap the rules.
 */
export function riskScore(signals: RiskSignals): RiskDecision {
  const reasons: string[] = [];
  let score = fnv(`risk:${signals.email.toLowerCase()}`) % 40; // deterministic 0–39 base
  if (signals.disposableEmail) { score += 35; reasons.push('Disposable email domain'); }
  if ((signals.priorSignups ?? 0) > 0) { score += 20; reasons.push(`${signals.priorSignups} prior signup(s) on this fingerprint`); }
  if (signals.country && !['US'].includes(signals.country)) { score += 5; reasons.push('Non-US signup (coverage/consent gating)'); }
  score = Math.min(100, score);
  return { score, decision: score >= 50 ? 'otp' : 'grant', provisional: true, reasons };
}

// ── Deterministic demo cohort (for the funnel board) ──────────────────────────

export interface CohortAccount {
  id: string;
  name: string;
  stage: FunnelStageCode;
  leadClass: LeadClass;
  trialUsedPct: number;
  walletBalance: number;
  paid: boolean;
  createdAt: number;
  /** CSM fields (M5): conversion-window membership + expiry + spend + AE routing. */
  inWindow: boolean;
  daysToExpiry: number | null;
  spendPerDay: number;
  aeAssigned: boolean;
}

/** High-spend threshold (credits/day) that routes a Hot lead to an AE. */
export const AE_SPEND_THRESHOLD = 120;

const FIRST_NAMES = ['Ava', 'Liam', 'Noah', 'Mia', 'Ethan', 'Zoe', 'Kai', 'Ivy', 'Leo', 'Nora', 'Ravi', 'Sana', 'Diego', 'Yuki', 'Omar', 'Elsa'];
const COMPANIES = ['Northwind', 'Acme', 'Globex', 'Umbra', 'Initech', 'Hooli', 'Stark', 'Wayne', 'Zenith', 'Vertex', 'Lumen', 'Cortex'];

/**
 * A stable, realistic cohort spread across the funnel — deterministic from `seed`,
 * so the board reads as a live pipeline without any `Math.random`. Each account is
 * built from ONE coherent input at a deterministic "depth", and BOTH its stage and
 * lead class are derived from that same input — so the board can never show a
 * mismatched stage/lead. `now` anchors ages/expiries.
 */
export function generateCohort(seed: string, n: number, now: number): CohortAccount[] {
  const out: CohortAccount[] = [];
  for (let i = 0; i < n; i++) {
    const h = fnv(`${seed}:${i}`);
    // Depth 0–7 with a realistic funnel-narrowing bias: most accounts sit near the
    // top (acquisition/activation) and progressively fewer reach conversion/retention.
    const depth = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7][h % 22];
    const createdAt = now - ((h % 20) + 1) * DAY;
    const trialUsedPct = depth >= 3 ? (fnv(`${seed}:pct:${i}`) % 101) : 0;
    const expiredOutcome = depth === 5; // conversion outcome: some convert, some die
    const converts = expiredOutcome && (h % 2 === 0);
    // Trial expiry is decoupled from account age: accounts still progressing keep an
    // active (future) trial so they stay in their phase; only the conversion-outcome
    // cohort that didn't convert is actually expired.
    const trialExpiresAt = expiredOutcome && !converts ? now - DAY : now + 7 * DAY;
    const paid = depth >= 6 || converts;
    const spendPerDay = paid ? ((fnv(`${seed}:spd:${i}`) % 200) + 10) : 0;
    const walletBalance = paid ? (fnv(`${seed}:bal:${i}`) % 5000) : 0;

    const input: AccountFunnelInput = {
      signedUp: depth >= 1,
      onboarded: depth >= 1,
      trialGranted: depth >= 2,
      firstKeyAt: depth >= 2 ? createdAt : null,
      firstFireAt: depth >= 3 ? createdAt : null,
      trialUsedPct: depth === 4 ? Math.max(85, trialUsedPct) : trialUsedPct, // conversion window
      trialExpiresAt,
      paid,
      walletBalance,
      walletOpenedAt: paid ? createdAt : null,
      spendPerDay,
      reUpped: depth === 7,
    };
    const stage = currentStage(input, now);
    const leadClass = classifyLead(input, now);
    out.push({
      id: `acct_${h.toString(36)}`,
      name: `${FIRST_NAMES[h % FIRST_NAMES.length]} @ ${COMPANIES[(h >>> 4) % COMPANIES.length]}`,
      stage,
      leadClass,
      trialUsedPct: input.trialUsedPct,
      walletBalance,
      paid,
      createdAt,
      inWindow: conversionWindowOpen(input, now),
      daysToExpiry: input.trialExpiresAt != null ? Math.round((input.trialExpiresAt - now) / DAY) : null,
      spendPerDay,
      aeAssigned: leadClass === 'hot' && spendPerDay >= AE_SPEND_THRESHOLD,
    });
  }
  return out;
}

/** Count how many cohort accounts sit in each phase. */
export function phaseDistribution(cohort: CohortAccount[]): Record<FunnelPhaseId, number> {
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<FunnelPhaseId, number>;
  cohort.forEach((a) => { dist[stageByCode(a.stage).phase] += 1; });
  return dist;
}
