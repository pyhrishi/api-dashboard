/**
 * Gateway Data Privacy & Compliance Engine
 * Handles real-time payload redaction for DPDP, GDPR, and CCPA compliance.
 *
 * Field-level PII masking (F-313) is applied here via the shared policy engine
 * (`@/lib/pii-masking`): instead of the old email/phone-only redaction, live-key
 * responses are masked field-by-field per a masking policy (per-field strategy —
 * partial / hash / tokenize / redact), covering emails, phones, government IDs,
 * dates of birth, addresses, IPs, names and social URLs. Sandbox (`sk_test_`) keys
 * are never masked (mirrors the product-wide live-vs-sandbox split).
 */

import { defaultPolicy, maskPayload, type MaskingPolicy } from '@/lib/pii-masking';

type PrivacyFramework = 'GDPR' | 'CCPA' | 'DPDP' | 'NONE';

export function detectPrivacyFramework(countryCode: string | null): PrivacyFramework {
  if (!countryCode) return 'NONE';
  
  const euCountries = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
  
  if (euCountries.includes(countryCode.toUpperCase())) return 'GDPR';
  if (countryCode.toUpperCase() === 'US-CA') return 'CCPA'; // Mocking California specifically
  if (countryCode.toUpperCase() === 'IN') return 'DPDP';
  
  return 'NONE';
}

// Global Do-Not-Sell / Opt-Out Registry (Simulated Distributed Ledger)
const OptOutRegistry = new Set([
  'eve.jones@acme.com',      // Opted out via CCPA Do-Not-Sell
  'charlie.williams@acme.com' // Opted out via GDPR Right to be Forgotten
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const optedOutEmail = (v: unknown): boolean => {
  const email = isRecord(v) ? v.email : undefined;
  return typeof email === 'string' && OptOutRegistry.has(email.toLowerCase());
};

export function enforceOptOutPropagation(data: unknown): { sanitizedData: unknown; optOutsRemoved: number } {
  let optOutsRemoved = 0;

  if (data === null || data === undefined) {
    return { sanitizedData: data, optOutsRemoved: 0 };
  }

  if (Array.isArray(data)) {
    const originalLength = data.length;
    const sanitizedArray = data
      .filter((item: unknown) => !optedOutEmail(item))
      .map((item: unknown) => {
        const result = enforceOptOutPropagation(item);
        optOutsRemoved += result.optOutsRemoved;
        return result.sanitizedData;
      });

    optOutsRemoved += (originalLength - sanitizedArray.length);
    return { sanitizedData: sanitizedArray, optOutsRemoved };
  }

  if (isRecord(data)) {
    if (optedOutEmail(data)) {
      return { sanitizedData: null, optOutsRemoved: 1 };
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const result = enforceOptOutPropagation(data[key]);
        sanitizedObj[key] = result.sanitizedData;
        optOutsRemoved += result.optOutsRemoved;
      }
    }
    return { sanitizedData: sanitizedObj, optOutsRemoved };
  }

  return { sanitizedData: data, optOutsRemoved: 0 };
}

/**
 * Field-level PII masking (F-313). Masks every PII field in a payload per the given
 * masking policy (defaults to the org default — mask-by-default). Pure; returns the
 * masked clone plus the keys that were masked (used for the X-PII-Masked header).
 */
export function maskFieldLevelPii(payload: unknown, policy: MaskingPolicy = defaultPolicy()): { masked: unknown; maskedKeys: string[] } {
  const { masked, maskedKeys } = maskPayload(payload, policy);
  return { masked, maskedKeys };
}

/**
 * Compliance masking applied to live-key responses. Any detected framework triggers
 * full field-level masking under the default policy; NONE is a passthrough (the
 * call site decides whether a live key with no detected framework is masked).
 */
export function applyPrivacyMasking(payload: unknown, framework: PrivacyFramework): unknown {
  if (framework === 'NONE' || !payload) return payload;
  return maskFieldLevelPii(payload).masked;
}
