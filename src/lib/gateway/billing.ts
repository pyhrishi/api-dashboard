// Mocked in-memory billing store (Hashes Only)
import { hashApiKey, type RegistryDescriptor } from '@/lib/key-hashing';
import { chargeTrial, TRIAL_FREE_CREDITS } from '@/lib/trial-credits';
import { volumeDiscountPct, discountedCallCredits } from '@/lib/pricing';

export type BillingPlan = 'prepaid' | 'postpaid' | 'metered';
export type MsaStatus = 'ACTIVE' | 'EXPIRED' | 'PENDING_SIGNATURE';
export type DpaStatus = 'ACTIVE' | 'REQUIRED' | 'NOT_APPLICABLE';

export interface ApiKeyRecord {
  hash: string;
  plan: BillingPlan;
  credits: number; // paid pre-paid balance
  usage: number;   // for metered/postpaid
  /** Trial free credits (F-M3) — spendable on Public APIs only, before paid. */
  freeCredits?: number;
  dataResidency?: string; // e.g. 'EU', 'US'
  status?: 'ACTIVE' | 'REVOKED';
  msaStatus: MsaStatus;
  dpaStatus: DpaStatus;
  monthlyLimit?: number;
}

const apiKeys: Record<string, ApiKeyRecord> = {
  // sk_test_123 -> SHA-256 hash
  '7ba88f380e2bd2b3a94f74a0f3cdb2b502fdf251f829ad44cd009de9f632ed96': { hash: '7ba88f380e2bd2b3a94f74a0f3cdb2b502fdf251f829ad44cd009de9f632ed96', plan: 'prepaid', credits: 10, usage: 0, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'NOT_APPLICABLE' },
  // sk_test_456 -> metered
  'd9d7010a300d6ef3c1bcf6ad62c64070be7f27715b0eb91705b766100ef6e3fc': { hash: 'd9d7010a300d6ef3c1bcf6ad62c64070be7f27715b0eb91705b766100ef6e3fc', plan: 'metered', credits: 0, usage: 1000, dataResidency: 'EU', status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'ACTIVE' },
  // sk_test_789 -> postpaid enterprise
  'f7e2730f8eaee5f928a3fde008ecdf9ba788880a65bb7f6fcdeec961df7cdeec': { hash: 'f7e2730f8eaee5f928a3fde008ecdf9ba788880a65bb7f6fcdeec961df7cdeec', plan: 'postpaid', credits: 0, usage: 50000, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'ACTIVE' },
  // sk_test_compromised -> Revoked Key
  '01fbf9cecc62edb3b0d24497e5fc7eb1b23832c3f8e56214041d8e6a2b22b62d': { hash: '01fbf9cecc62edb3b0d24497e5fc7eb1b23832c3f8e56214041d8e6a2b22b62d', plan: 'metered', credits: 0, usage: 0, status: 'REVOKED', msaStatus: 'ACTIVE', dpaStatus: 'NOT_APPLICABLE' },
  // sk_test_expired_msa -> Active Key but MSA Expired
  '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef': { hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', plan: 'postpaid', credits: 0, usage: 10000, status: 'ACTIVE', msaStatus: 'EXPIRED', dpaStatus: 'ACTIVE' },
  // sk_test_missing_dpa -> Active Key but missing GDPR DPA
  'c79bbf062a8f1c7f999a0f296b913a725a0757ef0e564bbcb2a7222a2570afdc': { hash: 'c79bbf062a8f1c7f999a0f296b913a725a0757ef0e564bbcb2a7222a2570afdc', plan: 'metered', credits: 0, usage: 100, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'REQUIRED' }
};

// Keys are hashed at rest (F-321): the one SSOT digest, shared with the console.
const hashKey = hashApiKey;

/** For the key-hashing audit: what this registry holds and how it is keyed. */
export function billingStorageDescriptor(): RegistryDescriptor {
  return { id: 'billing', label: 'Billing records', holds: 'plan, credits, usage, status, MSA/DPA state', keyedBy: 'sha256', entries: Object.keys(apiKeys).length, runtime: 'node' };
}

/** True when a record exists for this key's digest (no side effects — no lazy provisioning). */
export function hasBillingRecordFor(hash: string): boolean {
  return Boolean(apiKeys[hash]);
}

/**
 * Default billing plan for a lazily-provisioned key, inferred from its prefix.
 * Live keys get a pre-paid balance (so calls deduct and can eventually 402);
 * test/sandbox keys get a generous metered allowance (effectively free).
 */
function provisionRecord(key: string, hash: string): ApiKeyRecord | undefined {
  if (key.startsWith('sk_live_')) {
    // Trial provisioning (F-M3): free credits (Public-only) spent before the paid balance.
    return { hash, plan: 'prepaid', credits: 1000, freeCredits: TRIAL_FREE_CREDITS, usage: 0, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'ACTIVE' };
  }
  if (key.startsWith('sk_test_')) {
    return { hash, plan: 'metered', credits: 0, usage: 0, monthlyLimit: 100000, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'NOT_APPLICABLE' };
  }
  return undefined;
}

export function getApiKeyRecord(key: string): ApiKeyRecord | undefined {
  if (!key) return undefined;
  const hash = hashKey(key);
  if (apiKeys[hash]) return apiKeys[hash];

  // Lazily provision a record for any well-formed key created in the console,
  // so dashboard-generated keys authenticate and bill against the real gateway
  // (closes the console <-> gateway seam). Pre-seeded demo keys are untouched.
  const provisioned = provisionRecord(key, hash);
  if (provisioned) {
    apiKeys[hash] = provisioned;
    return provisioned;
  }
  return undefined;
}

export function calculateVolumeDiscount(key: string, baseCost: number): { cost: number, discountPct: number } {
  const record = getApiKeyRecord(key);
  if (!record) return { cost: baseCost, discountPct: 0 };

  // Volume discounts are based on cumulative usage in the current billing cycle.
  // The bands and the per-call rounding live in the pricing SSOT (`@/lib/pricing`),
  // so the console Cost Calculator shows exactly what this bills.
  const cumulativeUsage = record.usage || 0;
  const discountPct = volumeDiscountPct(cumulativeUsage);
  return { cost: discountedCallCredits(baseCost, discountPct), discountPct };
}

export interface DeductResult {
  success: boolean;
  remaining: number;
  error?: string;
  /** Which balance the charge came from (F-M3 trial provisioning). */
  bucket?: 'free' | 'paid' | 'mixed' | null;
  freeRemaining?: number;
  paidRemaining?: number;
}

/** Read the two-bucket ledger for a key (free trial + paid). */
export function getLedger(key: string | undefined): { free: number; paid: number } | undefined {
  const record = getApiKeyRecord(key ?? '');
  if (!record) return undefined;
  return { free: record.freeCredits ?? 0, paid: record.credits ?? 0 };
}

/**
 * Deduct `cost` credits. For pre-paid (trial) keys this enforces the F-M3 rules:
 * free trial credits are spent first and only on Public APIs (`opts.isPublic`),
 * then the paid balance. `isPublic` defaults to true for callers that don't classify.
 */
export function deductCredits(key: string, cost: number, opts?: { isPublic?: boolean }): DeductResult {
  const record = getApiKeyRecord(key);

  if (!record) {
    return { success: false, remaining: 0, error: 'Invalid API Key' };
  }

  if (record.plan === 'prepaid') {
    const isPublic = opts?.isPublic ?? true;
    const result = chargeTrial({ free: record.freeCredits ?? 0, paid: record.credits ?? 0 }, cost, isPublic);
    if (!result.ok) {
      return { success: false, remaining: (record.freeCredits ?? 0) + (record.credits ?? 0), error: result.error, bucket: null, freeRemaining: record.freeCredits ?? 0, paidRemaining: record.credits ?? 0 };
    }
    record.freeCredits = result.free;
    record.credits = result.paid;
    return { success: true, remaining: result.free + result.paid, bucket: result.bucket, freeRemaining: result.free, paidRemaining: result.paid };
  } else if (record.plan === 'postpaid') {
    // Enterprise Post-Paid Logic (No hard limits, bill at end of month)
    record.usage = (record.usage || 0) + cost;
    return {
      success: true,
      remaining: -1 // Indicates unlimited/post-paid in headers
    };
  } else {
    // Standard Metered Logic (Hard limits)
    const remaining = (record.monthlyLimit || 0) - (record.usage || 0);

    if (remaining < cost) {
      return { 
        success: false, 
        remaining, 
        error: 'Insufficient monthly credits. Please upgrade your tier at console.zinbit.zintlr.com/billing to continue using the API.' 
      };
    }

    record.usage = (record.usage || 0) + cost;
    return { 
      success: true, 
      remaining: (record.monthlyLimit || 0) - record.usage 
    };
  }
}
