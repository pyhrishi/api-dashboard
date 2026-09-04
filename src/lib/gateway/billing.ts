// Mocked in-memory billing store (Hashes Only)
import { createHash } from 'crypto';

export type BillingPlan = 'prepaid' | 'postpaid' | 'metered';
export type MsaStatus = 'ACTIVE' | 'EXPIRED' | 'PENDING_SIGNATURE';
export type DpaStatus = 'ACTIVE' | 'REQUIRED' | 'NOT_APPLICABLE';

export interface ApiKeyRecord {
  hash: string;
  plan: BillingPlan;
  credits: number; // for prepaid
  usage: number;   // for metered/postpaid
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

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Default billing plan for a lazily-provisioned key, inferred from its prefix.
 * Live keys get a pre-paid balance (so calls deduct and can eventually 402);
 * test/sandbox keys get a generous metered allowance (effectively free).
 */
function provisionRecord(key: string, hash: string): ApiKeyRecord | undefined {
  if (key.startsWith('sk_live_')) {
    return { hash, plan: 'prepaid', credits: 1000, usage: 0, status: 'ACTIVE', msaStatus: 'ACTIVE', dpaStatus: 'ACTIVE' };
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

  // Volume discounts are based on cumulative usage in the current billing cycle
  const cumulativeUsage = record.usage || 0;
  
  if (cumulativeUsage > 500000) {
    // 50% Volume Discount (Enterprise Scale)
    return { cost: Math.max(1, Math.ceil(baseCost * 0.5)), discountPct: 50 };
  } else if (cumulativeUsage > 100000) {
    // 25% Volume Discount (Startup Scale)
    return { cost: Math.max(1, Math.ceil(baseCost * 0.75)), discountPct: 25 };
  } else if (cumulativeUsage > 20000) {
    // 10% Volume Discount
    return { cost: Math.max(1, Math.ceil(baseCost * 0.90)), discountPct: 10 };
  }

  return { cost: baseCost, discountPct: 0 };
}

export function deductCredits(key: string, cost: number): { success: boolean, remaining: number, error?: string } {
  const record = getApiKeyRecord(key);

  if (!record) {
    return { success: false, remaining: 0, error: 'Invalid API Key' };
  }

  if (record.plan === 'prepaid') {
    if ((record.credits || 0) < cost) {
      return { 
        success: false, 
        remaining: record.credits || 0, 
        error: 'Insufficient pre-paid credits. Please top up your ledger at console.zinbit.zintlr.com/billing to continue using the API.' 
      };
    }
    
    record.credits = (record.credits || 0) - cost;
    return { 
      success: true, 
      remaining: record.credits 
    };
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
