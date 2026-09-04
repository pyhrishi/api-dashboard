import { PrivacySettings } from './store';

export const PII_PATTERNS = {
  creditCard: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})/,
  ssn: /^(?!666|000|9\d{2})\d{3}-(?!00)\d{2}-(?!0{4})\d{4}$/,
  phone: /^\+?[1-9]\d{1,14}$/, // Simplified E.164
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
};

export type PIIType = 'creditCard' | 'ssn' | 'phone' | 'email';

export function checkIsPii(value: string): PIIType | null {
  if (typeof value !== 'string') return null;
  if (PII_PATTERNS.creditCard.test(value)) return 'creditCard';
  if (PII_PATTERNS.ssn.test(value)) return 'ssn';
  if (PII_PATTERNS.email.test(value)) return 'email';
  if (PII_PATTERNS.phone.test(value)) return 'phone';
  return null;
}

export function applySmartMask(value: string, type: PIIType | 'key'): string {
  if (type === 'creditCard') {
    return `**** **** **** ${value.slice(-4)}`;
  }
  if (type === 'ssn') {
    return `***-**-${value.slice(-4)}`;
  }
  if (type === 'email') {
    const [local, domain] = value.split('@');
    return `${local[0]}***@${domain}`;
  }
  if (type === 'phone') {
    return `***-***-${value.slice(-4)}`;
  }
  // Generic key mask
  return '********';
}

/**
 * Deep clones and sanitizes an object/array based on privacy settings.
 * This ensures exported payloads don't contain raw PII.
 */
export function sanitizeLogData<T>(data: T, privacySettings: PrivacySettings): T {
  if (data === null || typeof data !== 'object') {
    if (typeof data === 'string') {
      const piiType = privacySettings.autoRedactPII ? checkIsPii(data) : null;
      if (piiType) {
        return `[REDACTED: ${applySmartMask(data, piiType)}]` as unknown as T;
      }
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item, privacySettings)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // 1. Check if the key is explicitly redacted
    if (privacySettings.customKeys.includes(key.toLowerCase())) {
      result[key] = '[REDACTED BY KEY]';
      continue;
    }

    // 2. Otherwise, recursively sanitize
    result[key] = sanitizeLogData(value, privacySettings);
  }

  return result as unknown as T;
}
