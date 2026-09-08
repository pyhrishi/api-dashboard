/**
 * Gateway Internal Logger
 *
 * Every internal line is redacted of PII and secrets *before* it is serialized and
 * written (F-322). The logger is a thin facade over `logRedaction.ts` — the single
 * path to stdout — so policy, metrics, the redacted tail and the canary self-test
 * all describe exactly what these calls produce. Callers may include `requestId`
 * and `apiKey` in the context: the request id is preserved for tracing, the key is
 * used only to attribute the line to its org and is written as its sha256: fingerprint.
 */

import { writeLine } from '@/lib/gateway/logRedaction';
import type { RedactedLogLine } from '@/lib/log-redaction';

export const Logger = {
  info: (message: string, context?: unknown): RedactedLogLine => writeLine('INFO', message, context),
  warn: (message: string, context?: unknown): RedactedLogLine => writeLine('WARN', message, context),
  error: (message: string, context?: unknown): RedactedLogLine => writeLine('ERROR', message, context),
};

/** The terminal access-log line for a request; `apiKey` only attributes the line to its org. */
export function logRequest(requestId: string, method: string, path: string, status: number, duration: number, apiKey?: string): RedactedLogLine {
  return writeLine('INFO', `[${method}] ${path} - ${status} (${duration}ms)`, { requestId, method, path, status, duration }, apiKey);
}
