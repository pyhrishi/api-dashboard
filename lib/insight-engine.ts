/**
 * State-aware Insight Engine.
 *
 * Deterministic, dependency-free reasoning over real console state (request
 * logs, feature requests, tickets). It replaces the previous hardcoded "AI"
 * strings so the Root-Cause Analysis, ticket triage, and duplicate-detection
 * features actually reflect what happened — while staying bulletproof in a live
 * demo (no network, no latency, no failure modes). Same inputs → same output.
 */

// ─── Root-Cause Analysis ──────────────────────────────────────────────────────

export interface RcaLog {
  status: number;
  ip?: string;
  timestamp?: string;
  duration?: number;
}

interface StatusExplanation {
  label: string;
  cause: string;
  action: string;
}

/** Map a dominant HTTP status to a plausible cause + recommended action. */
function explainStatus(status: number): StatusExplanation {
  if (status === 429) return {
    label: 'Too Many Requests',
    cause: 'Traffic bursts are exceeding your token-bucket rate limit.',
    action: 'add client-side exponential backoff, or request a rate-limit increase from Billing',
  };
  if (status === 401) return {
    label: 'Unauthorized',
    cause: 'Requests are arriving with a missing, malformed, or expired API key.',
    action: 'rotate the affected key and confirm the "Authorization: Bearer <key>" header',
  };
  if (status === 403) return {
    label: 'Forbidden',
    cause: 'The key lacks the required scope, or the caller IP is outside the allowlist.',
    action: 'widen the key scopes or add the caller IP to the allowlist under Security',
  };
  if (status === 404) return {
    label: 'Not Found',
    cause: 'Calls are hitting a deprecated or mistyped endpoint path.',
    action: 'check the migration guide and switch to the replacement endpoint',
  };
  if (status === 410) return {
    label: 'Gone',
    cause: 'This endpoint has been sunset and permanently removed.',
    action: 'migrate to the replacement endpoint referenced in the deprecation notice',
  };
  if (status === 400 || status === 422) return {
    label: 'Bad Request',
    cause: 'Payloads are failing schema validation (missing or malformed parameters).',
    action: 'validate inputs against the endpoint parameter schema before sending',
  };
  if (status >= 500) return {
    label: 'Server Error',
    cause: 'Upstream services returned errors — likely a transient outage or a circuit-breaker trip.',
    action: 'retry with backoff and check the Infrastructure status page for the affected region',
  };
  return {
    label: 'Error',
    cause: 'A mix of client and server conditions produced these failures.',
    action: 'inspect the individual log entries to isolate the dominant failure mode',
  };
}

/**
 * Produce a specific, data-grounded root-cause narrative from the real failing
 * requests for an endpoint. Deterministic — no randomness.
 */
export function generateRootCauseAnalysis(endpoint: string, logs: RcaLog[]): string {
  const total = logs.length;
  if (total === 0) {
    return `No failing requests were recorded for ${endpoint} in the selected window — there is nothing to analyze. Traffic looks healthy.`;
  }

  const statusCounts: Record<number, number> = {};
  const ipCounts: Record<string, number> = {};
  for (const log of logs) {
    statusCounts[log.status] = (statusCounts[log.status] || 0) + 1;
    if (log.ip) ipCounts[log.ip] = (ipCounts[log.ip] || 0) + 1;
  }

  const [dominantStatusStr, dominantCount] = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantStatus = Number(dominantStatusStr);
  const dominantPct = Math.round((dominantCount / total) * 100);
  const uniqueIps = Object.keys(ipCounts).length;

  const topIpEntry = Object.entries(ipCounts).sort((a, b) => b[1] - a[1])[0];
  const concentration = topIpEntry
    ? { ip: topIpEntry[0], pct: Math.round((topIpEntry[1] / total) * 100) }
    : null;

  const { label, cause, action } = explainStatus(dominantStatus);

  const ipClause = uniqueIps > 0
    ? ` across ${uniqueIps} client IP${uniqueIps === 1 ? '' : 's'}`
    : '';
  const concentrationClause = concentration && concentration.pct >= 40 && uniqueIps > 1
    ? ` — with ${concentration.pct}% originating from a single source (${concentration.ip})`
    : '';

  return `Analysis complete. ${dominantPct}% of the ${total} failure${total === 1 ? '' : 's'} on ${endpoint} `
    + `were ${dominantStatus} ${label}${ipClause}${concentrationClause}. ${cause} `
    + `Recommended action: ${action}.`;
}

// ─── Ticket Triage ────────────────────────────────────────────────────────────

export interface TriageLog {
  status: number;
  method?: string;
  path?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
}

export interface TriageSuggestion {
  severity: 'low' | 'medium' | 'high';
  summary: string;
  resolution: string;
}

/** Suggest a triage severity + resolution by reasoning over the linked failing log. */
export function suggestTriage(log: TriageLog | null | undefined): TriageSuggestion {
  if (!log) {
    return {
      severity: 'low',
      summary: 'No request log is attached to this ticket.',
      resolution: 'Ask the customer for a request ID or a reproducible example so the call can be traced in Logs.',
    };
  }

  const status = log.status;
  const where = log.path ? ` on ${log.method || 'GET'} ${log.path}` : '';
  const { label, cause, action } = explainStatus(status);

  const severity: TriageSuggestion['severity'] =
    status >= 500 ? 'high' : status === 429 ? 'medium' : status >= 400 ? 'medium' : 'low';

  if (status < 400) {
    return {
      severity: 'low',
      summary: `The linked request${where} succeeded (${status}).`,
      resolution: 'The failure is likely downstream of the API. Confirm the customer is reading the response envelope correctly and check their integration code.',
    };
  }

  return {
    severity,
    summary: `The linked request${where} failed with ${status} ${label}. ${cause}`,
    resolution: `Suggested reply: ${action}. Share the request ID and the relevant Logs entry with the customer.`,
  };
}

// ─── Duplicate Feature-Request Detection ──────────────────────────────────────

export interface SimilarItem {
  id: string;
  title: string;
}

export interface DuplicateMatch extends SimilarItem {
  score: number; // 0..1 similarity
}

/** Normalize a title into a set of meaningful word tokens. */
function tokenize(text: string): Set<string> {
  const stop = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'add', 'support', 'please', 'we', 'need', 'want', 'ability', 'able', 'feature', 'request']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
  );
}

/** Jaccard similarity between two token sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach(t => { if (b.has(t)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the most similar existing item to `title`. Returns the best match above
 * `threshold`, or null. Deterministic token-overlap (Jaccard) similarity.
 */
export function findDuplicate(title: string, existing: SimilarItem[], threshold = 0.34): DuplicateMatch | null {
  const target = tokenize(title);
  if (target.size === 0) return null;

  let best: DuplicateMatch | null = null;
  for (const item of existing) {
    const score = jaccard(target, tokenize(item.title));
    if (score >= threshold && (!best || score > best.score)) {
      best = { ...item, score };
    }
  }
  return best;
}

// ─── Bulk Enrichment Jobs ─────────────────────────────────────────────────────

export interface BulkSummaryRow {
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';
  httpStatus?: number;
  error?: string;
  durationMs?: number;
}

export interface BulkJobSummary {
  headline: string;
  detail: string;
  /** Deterministic next step the user can act on. */
  action: string;
  matchRate: number; // 0..1 over attempted rows
}

/**
 * Explain how a bulk job went and what to do next, from its real per-row results.
 * Deterministic — the same rows always yield the same summary.
 */
export function summarizeBulkJob(rows: BulkSummaryRow[]): BulkJobSummary {
  const attempted = rows.filter(r => r.status === 'succeeded' || r.status === 'failed');
  const succeeded = rows.filter(r => r.status === 'succeeded').length;
  const failed = rows.filter(r => r.status === 'failed');
  const skipped = rows.filter(r => r.status === 'skipped').length;
  const matchRate = attempted.length ? succeeded / attempted.length : 0;
  const pct = Math.round(matchRate * 100);

  if (attempted.length === 0) {
    return {
      headline: skipped > 0 ? `${skipped} rows were skipped before any credits were spent` : 'Nothing has run yet',
      detail: skipped > 0 ? 'Every skipped row failed input validation, so no request was sent and nothing was billed.' : 'Start the job to see match rate, failures, and a recommended next step here.',
      action: skipped > 0 ? 'Fix the highlighted inputs in your source file and re-upload.' : 'Click Run to begin.',
      matchRate,
    };
  }

  // Dominant failure status
  const byStatus = new Map<number, number>();
  failed.forEach(f => { const s = f.httpStatus ?? 0; byStatus.set(s, (byStatus.get(s) ?? 0) + 1); });
  let dominant = 0; let dominantCount = 0;
  byStatus.forEach((count, status) => { if (count > dominantCount) { dominant = status; dominantCount = count; } });

  const durations = attempted.map(r => r.durationMs ?? 0).filter(d => d > 0).sort((a, b) => a - b);
  const p50 = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  if (failed.length === 0) {
    return {
      headline: `${pct}% match rate — every attempted row enriched`,
      detail: `${succeeded} rows succeeded${skipped ? `, ${skipped} skipped for invalid input` : ''}. Median latency ${p50}ms.`,
      action: 'Download the results, or wire a webhook so future batches deliver themselves.',
      matchRate,
    };
  }

  const share = Math.round((dominantCount / failed.length) * 100);
  const why = explainStatus(dominant);
  const notFoundHint = dominant === 404
    ? ' These identifiers are outside current coverage — Reverse Enrichment or Identity Resolve may recover some of them.'
    : '';
  return {
    headline: `${pct}% match rate — ${failed.length} of ${attempted.length} rows failed`,
    detail: `${share}% of failures were ${dominant || 'network'} ${why.label}. ${why.cause}${notFoundHint}`,
    action: dominant === 429
      ? 'Retry the failed rows — the runner already backs off, but a higher rate limit from Billing removes the ceiling.'
      : dominant >= 500
        ? 'Retry the failed rows now; upstream errors are usually transient.'
        : `Retry only the failed rows after you ${why.action}.`,
    matchRate,
  };
}
