/**
 * Console-side redaction for exported / displayed request logs (Logs page, JsonViewer).
 *
 * Detection is delegated to the F-322 log-redaction SSOT (`lib/log-redaction.ts`) so
 * the console, the gateway's internal logger and the tests share ONE set of PII
 * patterns. The output format here (`[REDACTED: j***@acme.com]`, `[REDACTED BY KEY]`)
 * is the console's own display contract and is unchanged.
 */

import { PrivacySettings } from './store';
import { redactString, defaultLogPolicy, type LogPiiType } from './log-redaction';

export type PIIType = 'creditCard' | 'ssn' | 'phone' | 'email';

const DETECT_POLICY = defaultLogPolicy();
const TYPE_MAP: Partial<Record<LogPiiType, PIIType>> = { credit_card: 'creditCard', government_id: 'ssn', phone: 'phone', email: 'email' };

/**
 * Classify a whole value as one PII kind (or null). Uses the SSOT detectors: the
 * value must be consumed entirely by a single detector to count as PII.
 */
export function checkIsPii(value: string): PIIType | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const { text, findings } = redactString(value.trim(), DETECT_POLICY, 'console');
  if (findings.length !== 1) return null;
  const mapped = TYPE_MAP[findings[0].type];
  if (!mapped) return null;
  // The detector must have matched the entire value, not a fragment of a longer string.
  return text === findings[0].after ? mapped : null;
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
