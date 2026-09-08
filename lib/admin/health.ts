/**
 * Account health scoring (deep feature 3) — pure, deterministic.
 *
 * One score per customer, blended from the signals the console already has: usage
 * trend (this week vs last), wallet runway, 24h error rate, dormancy, trial burn and
 * engagement. From the same factors we derive a churn risk and an expansion score, so
 * the portfolio splits cleanly into "call these before they leave" and "call these to
 * grow". No I/O, no randomness.
 */

import type { Customer, WalletSnapshot, Plan, FunnelStage } from './types';

const DAY = 86_400_000;

export interface HealthInput {
  customer: Customer;
  calls7d: number;
  callsPrior7d: number;
  credits7d: number;
  errorRate24h: number;
  /** Days since the last call; null if never. */
  lastCallAgoDays: number | null;
  wallet: WalletSnapshot;
  activeKeys: number;
  openRequests: number;
  ageDays: number;
}

export interface HealthFactor {
  key: string;
  label: string;
  detail: string;
  /** Signed points contributed to churn (+) or expansion (−); 0 = neutral. */
  churn: number;
  expansion: number;
}

export type HealthBand = 'healthy' | 'watch' | 'at_risk';
export type HealthTag = 'churn_watch' | 'expansion_ready' | 'dormant' | 'new';

export interface Health {
  customerId: string;
  customerName: string;
  plan: Plan;
  stage: FunnelStage;
  score: number;
  band: HealthBand;
  churnRisk: number;
  expansionScore: number;
  usageTrendPct: number | null;
  factors: HealthFactor[];
  tags: HealthTag[];
  owner: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export function computeHealth(input: HealthInput): Health {
  const { customer: c, calls7d, callsPrior7d, errorRate24h, lastCallAgoDays, wallet, openRequests, ageDays } = input;
  const factors: HealthFactor[] = [];
  let churn = 0;
  let expansion = 0;

  const usageTrendPct = callsPrior7d > 0 ? Math.round(((calls7d - callsPrior7d) / callsPrior7d) * 100) : calls7d > 0 ? 100 : null;

  if (c.stage === 'churned') {
    return { customerId: c.id, customerName: c.name, plan: c.plan, stage: c.stage, score: 0, band: 'at_risk', churnRisk: 100, expansionScore: 0, usageTrendPct, owner: c.owner, tags: ['churn_watch'], factors: [{ key: 'churned', label: 'Churned', detail: 'Account is marked churned.', churn: 100, expansion: 0 }] };
  }

  // Usage trend
  if (usageTrendPct !== null) {
    if (usageTrendPct <= -25) { const p = Math.min(30, Math.abs(usageTrendPct) * 0.4); churn += p; factors.push({ key: 'usage_down', label: 'Usage declining', detail: `${Math.abs(usageTrendPct)}% fewer calls than last week`, churn: Math.round(p), expansion: 0 }); }
    else if (usageTrendPct >= 25) { const p = Math.min(35, usageTrendPct * 0.4); expansion += p; factors.push({ key: 'usage_up', label: 'Usage growing', detail: `${usageTrendPct}% more calls than last week`, churn: 0, expansion: Math.round(p) }); }
    else factors.push({ key: 'usage_flat', label: 'Usage steady', detail: `${usageTrendPct >= 0 ? '+' : ''}${usageTrendPct}% week over week`, churn: 0, expansion: 0 });
  }

  // Wallet runway
  if (wallet.atZero) { churn += 25; factors.push({ key: 'wallet_zero', label: 'Wallet at zero', detail: `Balance 0 for ${wallet.hoursAtZero ?? 0}h — calls rejected`, churn: 25, expansion: 0 }); }
  else if (wallet.belowTenPct) { churn += 12; factors.push({ key: 'wallet_low', label: 'Wallet below 10%', detail: `${wallet.balance.toLocaleString()} of ${wallet.lastTopUpAmount.toLocaleString()} left`, churn: 12, expansion: 8 }); expansion += 8; }
  else if (wallet.label === 'early' && wallet.daysToExhaust !== null && wallet.daysToExhaust < 14) { expansion += 12; factors.push({ key: 'burn_fast', label: 'Burning faster than cadence', detail: `~${Math.round(wallet.daysToExhaust)}d of runway — an upsell moment`, churn: 0, expansion: 12 }); }

  // Error rate
  if (errorRate24h >= 5) { const p = Math.min(20, errorRate24h * 1.5); churn += p; factors.push({ key: 'errors', label: 'Elevated error rate', detail: `${errorRate24h}% of calls failing (24h)`, churn: Math.round(p), expansion: 0 }); }

  // Dormancy
  if (lastCallAgoDays === null || lastCallAgoDays > 7) { churn += 22; factors.push({ key: 'dormant', label: 'Dormant', detail: lastCallAgoDays === null ? 'No calls yet' : `No calls in ${Math.round(lastCallAgoDays)} days`, churn: 22, expansion: 0 }); }
  else if (lastCallAgoDays > 3) { churn += 8; factors.push({ key: 'quiet', label: 'Quiet lately', detail: `Last call ${Math.round(lastCallAgoDays)} days ago`, churn: 8, expansion: 0 }); }

  // Trial burn → expansion moment
  if (c.plan === 'Trial' && wallet.remainingOfLastTopUp !== null) {
    const used = Math.round((1 - wallet.remainingOfLastTopUp) * 100);
    if (used >= 60 && !wallet.atZero) { expansion += 25; factors.push({ key: 'trial_hot', label: 'Trial converting', detail: `${used}% of the trial grant used — ready for a plan`, churn: 0, expansion: 25 }); }
  }

  // Stage momentum
  if ((c.stage === 'expanding' || c.stage === 'paying') && (usageTrendPct ?? 0) > 0) { expansion += 10; factors.push({ key: 'momentum', label: 'Paying & growing', detail: `${c.stage} with rising usage`, churn: 0, expansion: 10 }); }

  // Friction: open asks / needs-info
  if (openRequests > 0) { const p = Math.min(10, openRequests * 5); churn += p; factors.push({ key: 'requests', label: 'Open access requests', detail: `${openRequests} awaiting a decision`, churn: Math.round(p), expansion: 4 }); expansion += Math.min(8, openRequests * 4); }

  const churnRisk = clamp(churn);
  const expansionScore = clamp(expansion);
  const score = clamp(100 - churnRisk + 0.15 * expansionScore);
  const band: HealthBand = score >= 70 ? 'healthy' : score >= 45 ? 'watch' : 'at_risk';

  const tags: HealthTag[] = [];
  if (churnRisk >= 45) tags.push('churn_watch');
  if (expansionScore >= 45) tags.push('expansion_ready');
  if (lastCallAgoDays !== null && lastCallAgoDays > 7) tags.push('dormant');
  if (ageDays < 7) tags.push('new');

  return { customerId: c.id, customerName: c.name, plan: c.plan, stage: c.stage, score, band, churnRisk, expansionScore, usageTrendPct, factors: factors.sort((a, b) => (b.churn + b.expansion) - (a.churn + a.expansion)), tags, owner: c.owner };
}

export interface HealthDistribution { healthy: number; watch: number; at_risk: number }
export interface Portfolio {
  all: Health[];
  churnWatch: Health[];
  expansionReady: Health[];
  distribution: HealthDistribution;
  medianScore: number | null;
  avgChurnRisk: number;
}

export function portfolioHealth(inputs: HealthInput[]): Portfolio {
  const all = inputs.map(computeHealth).sort((a, b) => b.churnRisk - a.churnRisk || a.score - b.score);
  const distribution: HealthDistribution = { healthy: 0, watch: 0, at_risk: 0 };
  all.forEach((h) => { distribution[h.band] += 1; });
  const scores = all.map((h) => h.score).sort((a, b) => a - b);
  const medianScore = scores.length ? scores[Math.floor(scores.length / 2)] : null;
  return {
    all,
    churnWatch: all.filter((h) => h.tags.includes('churn_watch')).slice(0, 12),
    expansionReady: all.filter((h) => h.tags.includes('expansion_ready')).sort((a, b) => b.expansionScore - a.expansionScore).slice(0, 12),
    distribution,
    medianScore,
    avgChurnRisk: all.length ? Math.round(all.reduce((s, h) => s + h.churnRisk, 0) / all.length) : 0,
  };
}

export const BAND_LABEL: Record<HealthBand, string> = { healthy: 'Healthy', watch: 'Watch', at_risk: 'At risk' };
export const TAG_LABEL: Record<HealthTag, string> = { churn_watch: 'Churn watch', expansion_ready: 'Expansion ready', dormant: 'Dormant', new: 'New' };
export { DAY as HEALTH_DAY };
