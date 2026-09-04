/**
 * Gateway Internal Logger
 * Ensures all internal logs are sanitized and stripped of Personally Identifiable Information (PII)
 * before being written to stdout or an external SIEM/Log aggregator.
 */

const PII_PATTERNS = [
  // Email pattern
  { regex: /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, replacer: '[EMAIL_REDACTED]' },
  // Credit Card (Basic Visa/MC/Amex pattern)
  { regex: /\b(?:\d[ -]*?){13,16}\b/g, replacer: '[CREDIT_CARD_REDACTED]' },
  // SSN (US)
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacer: '[SSN_REDACTED]' },
  // Basic Phone Number (International/US)
  { regex: /\b\+?1?[-.]?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g, replacer: '[PHONE_REDACTED]' }
];

export function redactPII(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    let sanitized = payload;
    for (const pattern of PII_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, pattern.replacer);
    }
    return sanitized;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => redactPII(item));
  }

  if (typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    const sanitizedObj: Record<string, unknown> = {};
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        // Redact specific sensitive keys instantly regardless of value
        if (['password', 'secret', 'token', 'apikey', 'authorization'].includes(key.toLowerCase())) {
          sanitizedObj[key] = '[SECRET_REDACTED]';
        } else {
          sanitizedObj[key] = redactPII(source[key]);
        }
      }
    }
    return sanitizedObj;
  }

  return payload;
}

export const Logger = {
  info: (message: string, context?: unknown) => {
    const sanitizedContext = context ? redactPII(context) : undefined;
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      context: sanitizedContext
    }));
  },
  warn: (message: string, context?: unknown) => {
    const sanitizedContext = context ? redactPII(context) : undefined;
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      context: sanitizedContext
    }));
  },
  error: (message: string, context?: unknown) => {
    const sanitizedContext = context ? redactPII(context) : undefined;
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      context: sanitizedContext
    }));
  }
};

export function logRequest(requestId: string, method: string, path: string, status: number, duration: number) {
  Logger.info(`[${method}] ${path} - ${status} (${duration}ms)`, { requestId, status, duration });
}
