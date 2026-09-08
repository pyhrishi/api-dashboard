/**
 * Pricing — the single source of truth for what Zinbit costs.
 *
 * Before this module, pricing lived in three places that disagreed: the marketing
 * slider (`components/PricingSliderModal.tsx`), the gateway's volume discount
 * (`src/lib/gateway/billing.ts`), and the console billing page's hardcoded tiers.
 * This module reconciles them so the console Cost Calculator shows *exactly* what
 * the gateway bills (the seam is closed) and the billing page and gateway import
 * the same tables from here.
 *
 * Pure/deterministic — no I/O, no Math.random. Dollar amounts are USD.
 */

import { ENDPOINTS } from '@/data/endpoints';

export type TierId = 'starter' | 'growth' | 'enterprise';

export interface PricingTier {
  id: TierId;
  name: 'Starter' | 'Growth' | 'Enterprise';
  /** Credits included in the monthly subscription. */
  includedCredits: number;
  /** Monthly subscription price (USD) on a monthly cycle. */
  monthlyPrice: number;
  blurb: string;
  highlights: string[];
}

/**
 * The canonical subscription tiers (previously hardcoded in the billing page).
 * Price-per-credit falls as you move up — the economy-of-scale the calculator
 * makes visible.
 */
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    includedCredits: 10_000,
    monthlyPrice: 99,
    blurb: 'For a first integration and early production traffic.',
    highlights: ['10k credits / mo', 'Sandbox + live keys', 'Community support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    includedCredits: 100_000,
    monthlyPrice: 499,
    blurb: 'For scaling teams enriching at real volume.',
    highlights: ['100k credits / mo', 'Volume discounts kick in', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    includedCredits: 5_000_000,
    monthlyPrice: 2_999,
    blurb: 'For production scale with governance and the best unit economics.',
    highlights: ['5M credits / mo', 'Deepest volume discounts', 'SSO, DPA, SLA, residency'],
  },
];

/** Yearly billing gives two months free (pay for 10, get 12). */
export const YEARLY_MONTHS_FREE = 2;

/** Overage (soft mode) is billed at this multiple of the in-plan marginal credit rate. */
export const OVERAGE_MULTIPLIER = 1.3;

export type BillingCycle = 'monthly' | 'yearly';
export type OverageMode = 'hard' | 'soft';

/**
 * Volume-discount bands — mirrors the gateway's `calculateVolumeDiscount`
 * (`src/lib/gateway/billing.ts` imports `volumeDiscountPct` from here, so the two
 * can never drift). Discount is chosen from cumulative monthly credit volume and
 * reduces the credits charged per call, exactly as the gateway does.
 */
export interface VolumeBand {
  /** Inclusive lower bound of monthly credits for this band. */
  minCredits: number;
  discountPct: number;
  label: string;
}

export const VOLUME_BANDS: VolumeBand[] = [
  { minCredits: 500_001, discountPct: 50, label: 'Enterprise scale' },
  { minCredits: 100_001, discountPct: 25, label: 'Scale' },
  { minCredits: 20_001, discountPct: 10, label: 'Growth' },
  { minCredits: 0, discountPct: 0, label: 'Standard' },
];

/** The volume band a given monthly credit volume falls into. */
export function volumeBand(monthlyCredits: number): VolumeBand {
  const v = Number.isFinite(monthlyCredits) ? Math.max(0, monthlyCredits) : 0;
  // Bands are ordered high→low; the first whose floor we clear wins.
  return VOLUME_BANDS.find((b) => v >= b.minCredits) ?? VOLUME_BANDS[VOLUME_BANDS.length - 1];
}

/** Percentage volume discount for a monthly credit volume (0, 10, 25, or 50). */
export function volumeDiscountPct(monthlyCredits: number): number {
  return volumeBand(monthlyCredits).discountPct;
}

/** The next band up and how many more credits/month unlock it — null at the top band. */
export function nextVolumeBand(monthlyCredits: number): { band: VolumeBand; creditsToUnlock: number } | null {
  const v = Number.isFinite(monthlyCredits) ? Math.max(0, monthlyCredits) : 0;
  // Bands above the current one, lowest floor first.
  const above = [...VOLUME_BANDS].reverse().find((b) => b.minCredits > v);
  if (!above) return null;
  return { band: above, creditsToUnlock: above.minCredits - v };
}

export function tierById(id: TierId): PricingTier {
  return PRICING_TIERS.find((t) => t.id === id) ?? PRICING_TIERS[0];
}

/** The in-plan marginal price of one credit for a tier (USD). */
export function pricePerCredit(tier: PricingTier): number {
  return tier.monthlyPrice / tier.includedCredits;
}

/** The subscription cost for a cycle, expressed as an equivalent monthly figure. */
export function monthlyPlanCost(tier: PricingTier, cycle: BillingCycle): number {
  if (cycle === 'yearly') return (tier.monthlyPrice * (12 - YEARLY_MONTHS_FREE)) / 12;
  return tier.monthlyPrice;
}

/** The full amount billed for a cycle (monthly figure, or the 12-month total). */
export function billedAmount(tier: PricingTier, cycle: BillingCycle): number {
  if (cycle === 'yearly') return tier.monthlyPrice * (12 - YEARLY_MONTHS_FREE);
  return tier.monthlyPrice;
}

// --- Endpoint credit lookup (from the real catalog) ---------------------------

const CREDIT_BY_ID: Record<string, number> = ENDPOINTS.reduce((acc, e) => {
  acc[e.id] = e.creditCost;
  return acc;
}, {} as Record<string, number>);

/** The per-call credit cost of an endpoint (0 if unknown). */
export function endpointCredits(endpointId: string): number {
  return CREDIT_BY_ID[endpointId] ?? 0;
}

/**
 * The credits charged for one call after the volume discount, matching the
 * gateway: `Math.max(1, Math.ceil(base * (1 - discount)))` — never below 1.
 */
export function discountedCallCredits(baseCredits: number, discountPct: number): number {
  if (baseCredits <= 0) return 0;
  if (discountPct <= 0) return baseCredits;
  return Math.max(1, Math.ceil(baseCredits * (1 - discountPct / 100)));
}

// --- Cost estimation ----------------------------------------------------------

export interface LineItem {
  endpointId: string;
  callsPerMonth: number;
}

export interface CostLine {
  endpointId: string;
  callsPerMonth: number;
  unitCredits: number;
  effectiveUnitCredits: number;
  credits: number;
}

export interface CostEstimate {
  /** Credits before the volume discount. */
  rawCredits: number;
  /** Credits actually charged after the per-call volume discount. */
  effectiveCredits: number;
  volumeDiscountPct: number;
  volumeBandLabel: string;
  tier: PricingTier;
  cycle: BillingCycle;
  includedCredits: number;
  overageCredits: number;
  /** True when the mix exceeds included credits under a hard cap (calls would be refused). */
  blocked: boolean;
  /** Subscription, expressed monthly. */
  planCost: number;
  /** Overage charge (soft mode only). */
  overageCost: number;
  totalMonthly: number;
  /** Blended $ per call across the whole mix. */
  effectivePricePerCall: number;
  totalCalls: number;
  perLine: CostLine[];
}

/** Estimate the monthly cost of a call-mix on a tier — what the gateway would bill. */
export function estimateCost(
  mix: LineItem[],
  tierId: TierId,
  cycle: BillingCycle = 'monthly',
  overageMode: OverageMode = 'soft',
): CostEstimate {
  const tier = tierById(tierId);
  const clean = mix.filter((l) => l.endpointId && l.callsPerMonth > 0);

  const rawCredits = clean.reduce((sum, l) => sum + endpointCredits(l.endpointId) * l.callsPerMonth, 0);
  const discountPct = volumeDiscountPct(rawCredits);

  const perLine: CostLine[] = clean.map((l) => {
    const unit = endpointCredits(l.endpointId);
    const effUnit = discountedCallCredits(unit, discountPct);
    return {
      endpointId: l.endpointId,
      callsPerMonth: l.callsPerMonth,
      unitCredits: unit,
      effectiveUnitCredits: effUnit,
      credits: effUnit * l.callsPerMonth,
    };
  });

  const effectiveCredits = perLine.reduce((sum, l) => sum + l.credits, 0);
  const totalCalls = clean.reduce((sum, l) => sum + l.callsPerMonth, 0);

  const includedCredits = tier.includedCredits;
  const overageCredits = Math.max(0, effectiveCredits - includedCredits);
  const blocked = overageMode === 'hard' && overageCredits > 0;

  const planCost = monthlyPlanCost(tier, cycle);
  const overageRate = pricePerCredit(tier) * OVERAGE_MULTIPLIER;
  const overageCost = overageMode === 'soft' ? overageCredits * overageRate : 0;

  const totalMonthly = planCost + overageCost;
  const effectivePricePerCall = totalCalls > 0 ? totalMonthly / totalCalls : 0;

  return {
    rawCredits,
    effectiveCredits,
    volumeDiscountPct: discountPct,
    volumeBandLabel: volumeBand(rawCredits).label,
    tier,
    cycle,
    includedCredits,
    overageCredits,
    blocked,
    planCost,
    overageCost,
    totalMonthly,
    effectivePricePerCall,
    totalCalls,
    perLine,
  };
}

export interface TierRecommendation {
  recommended: TierId;
  /** Total monthly cost per tier for this mix, cheapest first is `recommended`. */
  byTier: { tierId: TierId; totalMonthly: number; blocked: boolean }[];
}

/**
 * The cheapest tier for a mix. A tier that would be blocked (hard cap exceeded)
 * is only chosen if every tier is blocked; otherwise the cheapest unblocked wins.
 */
export function recommendTier(
  mix: LineItem[],
  cycle: BillingCycle = 'monthly',
  overageMode: OverageMode = 'soft',
): TierRecommendation {
  const byTier = PRICING_TIERS.map((t) => {
    const est = estimateCost(mix, t.id, cycle, overageMode);
    return { tierId: t.id, totalMonthly: est.totalMonthly, blocked: est.blocked };
  });
  const unblocked = byTier.filter((t) => !t.blocked);
  const pool = unblocked.length > 0 ? unblocked : byTier;
  const best = pool.reduce((a, b) => (b.totalMonthly < a.totalMonthly ? b : a));
  return { recommended: best.tierId, byTier };
}

export interface ForecastPoint {
  month: number;
  credits: number;
  totalMonthly: number;
}

/**
 * Project spend forward `months` at a monthly growth rate, re-pricing each month
 * (so crossing a volume-discount or plan boundary shows up). Deterministic.
 */
export function forecast(
  mix: LineItem[],
  tierId: TierId,
  growthPct: number,
  months = 12,
  cycle: BillingCycle = 'monthly',
  overageMode: OverageMode = 'soft',
): ForecastPoint[] {
  const g = 1 + (Number.isFinite(growthPct) ? growthPct : 0) / 100;
  const points: ForecastPoint[] = [];
  for (let m = 0; m < months; m++) {
    const factor = Math.pow(g, m);
    const scaled = mix.map((l) => ({ endpointId: l.endpointId, callsPerMonth: Math.round(l.callsPerMonth * factor) }));
    const est = estimateCost(scaled, tierId, cycle, overageMode);
    points.push({ month: m + 1, credits: est.effectiveCredits, totalMonthly: est.totalMonthly });
  }
  return points;
}

/** Format a USD amount for display (no cents above $10 to keep tiles clean). */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const abs = Math.abs(amount);
  const digits = abs > 0 && abs < 10 ? 2 : 0;
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
}
