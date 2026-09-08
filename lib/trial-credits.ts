/**
 * Trial credit ledger — SSOT (Phase 2, M3).
 *
 * Trial provisioning has two rules from the funnel spec:
 *   1. Free credits apply to **Public APIs only** — premium/enterprise endpoints
 *      (batch, streaming, bulk export, AI search) require a paid balance.
 *   2. Free credits are **consumed before any paid balance**.
 *
 * This module owns the classification (`isPublicApi`) and the pure charge function
 * (`chargeTrial`) that the gateway billing uses to enforce both rules, plus the
 * two-bucket ledger type the console renders. Deterministic; no side effects.
 */

export const TRIAL_FREE_CREDITS = 5000;

export interface CreditLedger {
  /** Trial free credits — spendable on Public APIs only. */
  free: number;
  /** Paid balance — spendable on any endpoint. */
  paid: number;
}

export type ChargeBucket = 'free' | 'paid' | 'mixed';

export interface ChargeResult {
  ok: boolean;
  /** Which balance(s) the charge came from (null on failure). */
  bucket: ChargeBucket | null;
  /** Amount taken from each bucket. */
  fromFree: number;
  fromPaid: number;
  /** Resulting balances. */
  free: number;
  paid: number;
  error?: string;
}

/**
 * Endpoints that are NOT free-trial eligible (premium / high-throughput / bulk).
 * Free credits can't pay for these — they need a paid balance.
 */
const PREMIUM_PREFIXES = [
  '/v1/batch',            // bulk enrichment
  '/v1/enrich/stream',    // streaming
  '/v1/export',           // bulk export
  '/v1/people/search/ai', // AI search
];

/** Path prefixes that count as customer-facing enrichment (billable Public APIs). */
const ENRICHMENT_PREFIXES = [
  '/v1/people', '/v1/directors', '/v1/email', '/v1/titles', '/v1/names',
  '/v1/companies', '/v1/company', '/v1/domains',
  '/v1/identity', '/v1/enrichment', '/v1/match', '/v1/reconcile', '/v1/records',
  '/v1/text', '/v1/currency', '/v1/accounts',
];

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

/**
 * A Public API is a customer-facing enrichment endpoint that is NOT premium.
 * Meta/ops endpoints (encryption, masking, limits, …) are not Public-billable.
 */
export function isPublicApi(path: string): boolean {
  const p = path.startsWith('/v1') ? path : `/v1${path.startsWith('/') ? '' : '/'}${path}`;
  if (matchesPrefix(p, PREMIUM_PREFIXES)) return false;
  return matchesPrefix(p, ENRICHMENT_PREFIXES);
}

/**
 * Charge `cost` credits against a ledger, honoring the two rules. Public calls spend
 * free credits first then paid; non-public calls spend paid only. Pure — returns the
 * result and the resulting balances without mutating the input.
 */
export function chargeTrial(ledger: CreditLedger, cost: number, isPublic: boolean): ChargeResult {
  const { free, paid } = ledger;
  if (cost <= 0) return { ok: true, bucket: 'free', fromFree: 0, fromPaid: 0, free, paid };

  if (isPublic) {
    const fromFree = Math.min(free, cost);
    const remaining = cost - fromFree;
    if (remaining === 0) return { ok: true, bucket: 'free', fromFree, fromPaid: 0, free: free - fromFree, paid };
    if (paid >= remaining) {
      return { ok: true, bucket: fromFree > 0 ? 'mixed' : 'paid', fromFree, fromPaid: remaining, free: free - fromFree, paid: paid - remaining };
    }
    return { ok: false, bucket: null, fromFree: 0, fromPaid: 0, free, paid, error: 'Insufficient credits — top up your balance to continue.' };
  }

  // Non-public (premium): paid only.
  if (paid >= cost) return { ok: true, bucket: 'paid', fromFree: 0, fromPaid: cost, free, paid: paid - cost };
  return {
    ok: false, bucket: null, fromFree: 0, fromPaid: 0, free, paid,
    error: free > 0 ? 'This is a premium endpoint — free trial credits don’t apply. Add a paid balance to call it.' : 'Insufficient paid balance for this premium endpoint.',
  };
}

/** Percent of the free trial consumed (for the funnel's C3 milestones). */
export function trialUsedPct(freeRemaining: number, granted: number = TRIAL_FREE_CREDITS): number {
  if (granted <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((granted - freeRemaining) / granted) * 100)));
}
