/**
 * PII redaction in internal logs — the gateway side (F-322).
 *
 * Every structured log line the gateway writes goes through `writeLine` here, and
 * nowhere else: the record is redacted by the SSOT engine (`@/lib/log-redaction`)
 * with the org's policy *before* it is serialized, so no unredacted copy ever
 * exists. This module also makes the promise inspectable:
 *   - per-org **policy** synced from the console over `PATCH /v1/logs/redaction`
 *     (floor-clamped — a sync can weaken nothing below the catalog floors);
 *   - per-org **metrics** (lines written, values stripped, by type) and a ring
 *     buffer of the last lines *exactly as written*, served by `GET /v1/logs/redaction`
 *     so a reviewer sees real output, not a claim;
 *   - a **canary self-test** run on every report — zero leaks, every time;
 *   - `POST /v1/logs/redaction/test` — a dry run that redacts a payload and returns
 *     the result without logging anything;
 *   - `X-Log-Redaction: <n>` on every response — how many values were stripped from
 *     this request's internal log lines.
 *
 * Org identity is the F-321 digest handle (`orgHandleForKey`), which is also the
 * correlation-token salt, so the console's local tester and the gateway produce
 * byte-identical tokens. In-memory, per-isolate. Deterministic; no `Math.random`.
 */

import {
  defaultLogPolicy, normalizeLogRedactionPatch, normalizeLogPolicy, redactLogRecord, logPolicyStrength, selfTest,
  LOG_PII_CATALOG, LOG_REDACTION_POSTURE,
  type LogRedactionPolicy, type LogPiiType, type RedactedLogLine, type LogRedactionMetrics, type LogRedactionReport,
  type RedactLogResult, TAIL_CAPACITY,
} from '@/lib/log-redaction';
import { orgHandleForKey } from '@/lib/encryption';

export { TAIL_CAPACITY };

interface OrgLogState {
  policy: LogRedactionPolicy;
  metrics: LogRedactionMetrics;
  tail: RedactedLogLine[];
  seq: number;
}

const stateByOrg = new Map<string, OrgLogState>();

function emptyByType(): Record<LogPiiType, number> {
  return LOG_PII_CATALOG.reduce((acc, s) => { acc[s.type] = 0; return acc; }, {} as Record<LogPiiType, number>);
}

function stateFor(org: string): OrgLogState {
  let s = stateByOrg.get(org);
  if (!s) {
    s = { policy: defaultLogPolicy(), metrics: { lines: 0, findings: 0, byType: emptyByType(), lastLineAt: null }, tail: [], seq: 0 };
    stateByOrg.set(org, s);
  }
  return s;
}

/** The org handle (and correlation salt) for a key — the F-321 digest handle. */
export function orgForKey(apiKey: string | undefined | null): string {
  return orgHandleForKey(apiKey);
}

/** The effective policy for a key's org (defaults until synced). */
export function getLogRedactionPolicy(apiKey: string | undefined | null): LogRedactionPolicy {
  return stateFor(orgForKey(apiKey)).policy;
}

export interface LogRedactionUpdateResult {
  policy: LogRedactionPolicy;
  strength: number;
  /** Parts of the request that were ignored because they were invalid or below a floor. */
  ignored: string[];
}

/** Apply a validated patch for the key's org. Invalid or below-floor parts are dropped, never applied. */
export function updateLogRedactionPolicy(apiKey: string | undefined | null, body: unknown): LogRedactionUpdateResult {
  const s = stateFor(orgForKey(apiKey));
  const patch = normalizeLogRedactionPatch(body);
  const ignored: string[] = [];
  if (typeof body === 'object' && body !== null) {
    const rec = body as Record<string, unknown>;
    if (typeof rec.strategies === 'object' && rec.strategies !== null) {
      Object.keys(rec.strategies as Record<string, unknown>).forEach((t) => {
        if (!patch.strategies || !(t in patch.strategies)) ignored.push(`strategies.${t}`);
      });
    }
    if ('retentionDays' in rec && patch.retentionDays === undefined) ignored.push('retentionDays');
    if ('enabled' in rec) ignored.push('enabled (redaction cannot be disabled)');
  }
  s.policy = normalizeLogPolicy({
    strategies: { ...s.policy.strategies, ...(patch.strategies ?? {}) },
    customKeys: patch.customKeys ?? s.policy.customKeys,
    allowKeys: patch.allowKeys ?? s.policy.allowKeys,
    retentionDays: patch.retentionDays ?? s.policy.retentionDays,
  });
  return { policy: s.policy, strength: logPolicyStrength(s.policy), ignored };
}

// ── Writing lines ────────────────────────────────────────────────────────────

export type LogLevel = RedactedLogLine['level'];

/** Anything that can be attributed: the context may carry the key/request id the route already has. */
function attribution(context: unknown, apiKey: string | undefined | null): { org: string; requestId: string | null } {
  let key = apiKey ?? undefined;
  let requestId: string | null = null;
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    const rec = context as Record<string, unknown>;
    if (!key && typeof rec.apiKey === 'string') key = rec.apiKey;
    if (typeof rec.requestId === 'string') requestId = rec.requestId;
  }
  return { org: orgForKey(key), requestId };
}

const SINK: Record<LogLevel, (line: string) => void> = {
  INFO: (l) => console.log(l),
  WARN: (l) => console.warn(l),
  ERROR: (l) => console.error(l),
};

/**
 * The only way a gateway line reaches stdout. Redacts message + context with the
 * org policy, serializes, writes, and records the line in the org's tail + metrics.
 */
export function writeLine(level: LogLevel, message: string, context?: unknown, apiKey?: string | undefined | null): RedactedLogLine {
  const { org, requestId } = attribution(context, apiKey);
  const s = stateFor(org);
  const at = Date.now();
  const result: RedactLogResult = redactLogRecord({ message, context: context ?? undefined }, s.policy, org);
  const redacted = result.redacted as { message: string; context?: unknown };
  const line = JSON.stringify({
    level, timestamp: new Date(at).toISOString(), requestId: requestId ?? undefined,
    message: redacted.message, context: redacted.context, redacted: result.total || undefined,
  });
  SINK[level](line);

  s.seq += 1;
  const entry: RedactedLogLine = {
    id: `${org}:${s.seq}`,
    at,
    level,
    message: redacted.message,
    requestId,
    findings: result.total,
    types: Array.from(new Set(result.findings.map((f) => f.type))),
    preview: Array.from(new Set(result.findings.map((f) => f.after))).slice(0, 4),
    line,
  };
  s.tail.unshift(entry);
  if (s.tail.length > TAIL_CAPACITY) s.tail.length = TAIL_CAPACITY;
  s.metrics.lines += 1;
  s.metrics.findings += result.total;
  result.findings.forEach((f) => { s.metrics.byType[f.type] += 1; });
  s.metrics.lastLineAt = at;
  return entry;
}

// ── Dry run + report ─────────────────────────────────────────────────────────

export interface DryRunResult extends RedactLogResult {
  org: string;
  strength: number;
}

/** Redact a payload with the org policy and return the result. Nothing is written or counted. */
export function dryRunRedaction(apiKey: string | undefined | null, payload: unknown): DryRunResult {
  const org = orgForKey(apiKey);
  const policy = stateFor(org).policy;
  return { ...redactLogRecord(payload, policy, org), org, strength: logPolicyStrength(policy) };
}

export function getLogRedactionReport(apiKey: string | undefined | null, now: number = Date.now()): LogRedactionReport {
  const org = orgForKey(apiKey);
  const s = stateFor(org);
  return {
    org,
    policy: s.policy,
    strength: logPolicyStrength(s.policy),
    metrics: { ...s.metrics, byType: { ...s.metrics.byType } },
    tail: s.tail.slice(),
    selfTest: selfTest(s.policy, org),
    posture: LOG_REDACTION_POSTURE,
    generatedAt: now,
  };
}

/** `X-Log-Redaction: <n>` — values stripped from this request's internal log lines so far. */
export function attachLogRedactionHeader(headers: HeadersInit, count: number): void {
  (headers as Record<string, string>)['X-Log-Redaction'] = String(Math.max(0, count));
}

/** Test/demo hook — clears per-isolate policy, metrics and tails. */
export function __resetLogRedaction(): void {
  stateByOrg.clear();
}
