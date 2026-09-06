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

// ─── Match-rate transparency (F-029) ──────────────────────────────────────────
//
// Explains, per request, *why* a lookup matched or missed, and aggregates an
// honest match rate over real request logs. "Honest" means the denominator is
// only genuine coverage attempts (matched + missed) — malformed input, auth,
// rate-limit, and server errors are excluded, and pure transforms (title
// normalization, email verification, domain auth) don't count as coverage
// lookups at all. Deterministic: same logs → same numbers.

/** The subset of a request-log record this engine needs (structurally satisfied by ApiLog). */
export interface MatchLog {
  path: string;
  method?: string;
  status: number;
  response?: unknown;
  request?: { parameters?: Record<string, unknown> };
  timestamp?: string;
  environment?: string;
}

export type MatchVerdict = 'matched' | 'missed' | 'error' | 'excluded';
export type IdentifierKind =
  | 'email' | 'domain' | 'phone' | 'linkedin' | 'ip' | 'cin' | 'title' | 'query' | 'other';
export type EndpointKind = 'lookup' | 'transform' | 'other';

export interface MatchExplanation {
  verdict: MatchVerdict;
  /** Short label, e.g. "Matched on email" / "Outside coverage". */
  label: string;
  /** One-sentence plain-English reason. */
  detail: string;
  identifier: IdentifierKind;
  endpointKind: EndpointKind;
  /** Deterministic recovery suggestion for a coverage miss, else null. */
  recovery: string | null;
  /** Whether this request counts toward the match-rate denominator. */
  counts: boolean;
}

const IDENTIFIER_LABEL: Record<IdentifierKind, string> = {
  email: 'Email', domain: 'Domain', phone: 'Phone', linkedin: 'LinkedIn URL',
  ip: 'IP address', cin: 'CIN', title: 'Job title', query: 'Free-form query', other: 'Identifier',
};

/** Classify a request path into an endpoint kind + the identifier it keys on. */
export function classifyLookup(path: string, params?: Record<string, unknown>): {
  kind: EndpointKind; identifier: IdentifierKind; endpointLabel: string;
} {
  const p = path.toLowerCase();
  // Pure transforms — deterministic computation that always returns; not coverage.
  if (p.includes('/titles/normalize')) return { kind: 'transform', identifier: 'title', endpointLabel: 'Title normalize' };
  if (p.includes('/email/verify')) return { kind: 'transform', identifier: 'email', endpointLabel: 'Email verify' };
  if (p.includes('/email/domain-auth')) return { kind: 'transform', identifier: 'domain', endpointLabel: 'Domain auth' };

  // Coverage lookups — can match or miss.
  const paramKeys = params ? Object.keys(params) : [];
  const has = (k: string) => paramKeys.includes(k);
  let identifier: IdentifierKind = 'other';
  if (has('email')) identifier = 'email';
  else if (has('phone')) identifier = 'phone';
  else if (has('linkedin_url')) identifier = 'linkedin';
  else if (has('ip')) identifier = 'ip';
  else if (has('cin')) identifier = 'cin';
  else if (has('title')) identifier = 'title';
  else if (has('domain')) identifier = 'domain';
  else if (has('query')) identifier = 'query';
  // Fall back to the path when params are absent (e.g. replayed logs).
  else if (p.includes('/people/social')) identifier = 'email';
  else if (p.includes('/people/phone')) identifier = 'email';
  else if (p.includes('/people')) identifier = 'email';
  else if (p.includes('/companies') || p.includes('/domain-to') || p.includes('/firmographics')) identifier = 'domain';
  else if (p.includes('/enrichment/ip') || p.includes('/ip-to')) identifier = 'ip';
  else if (p.includes('/linkedin')) identifier = 'linkedin';
  else if (p.includes('/cin')) identifier = 'cin';

  const isLookup =
    p.includes('/people') || p.includes('/companies') || p.includes('/enrichment') ||
    p.includes('/domain-to') || p.includes('/ip-to') || p.includes('/linkedin') ||
    p.includes('/cin') || p.includes('/identity') || p.includes('/reverse') || p.includes('/firmographics');

  if (!isLookup) return { kind: 'other', identifier: 'other', endpointLabel: prettyPath(path) };
  return { kind: 'lookup', identifier, endpointLabel: prettyPath(path) };
}

/** "/v1/people/social" → "People · social". */
function prettyPath(path: string): string {
  const seg = path.replace(/^\/?v1\//, '').replace(/^\//, '').split('/').filter(Boolean);
  if (seg.length === 0) return path;
  const head = seg[0].charAt(0).toUpperCase() + seg[0].slice(1);
  return seg.length > 1 ? `${head} · ${seg.slice(1).join(' ')}` : head;
}

/** True when a 200 body actually carries a resolved entity (vs an empty/no-match 200). */
function hasResolvedData(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const r = response as Record<string, unknown>;
  if (r.success === false) return false;
  if ('error' in r && r.error) return false;
  // Explicit no-match markers some endpoints use.
  if (r.matched === false || r.found === false) return false;
  const data = 'data' in r ? r.data : r;
  if (data === null || data === undefined) return false;
  if (typeof data !== 'object') return true;
  const payload = data as Record<string, unknown>;
  // Strip envelope-only keys, then require at least one real field.
  const meaningful = Object.keys(payload).filter((k) => !['success', 'matched', 'found'].includes(k));
  return meaningful.length > 0;
}

const recoveryFor = (id: IdentifierKind): string => {
  switch (id) {
    case 'email': return 'Try Reverse Enrichment or resolve the domain to reach the company instead.';
    case 'phone': return 'Run Identity Resolve on the number, or fall back to an email lookup.';
    case 'domain': return 'Check the domain for typos, or use Reverse IP to identify the visitor.';
    case 'linkedin': return 'Resolve the profile by work email instead of the LinkedIn URL.';
    case 'ip': return 'IP maps to a non-corporate network — try an email or domain lookup.';
    case 'cin': return 'Confirm the CIN against the MCA registry, or resolve by domain.';
    default: return 'Try Auto-detect (Identity Resolve) with any other identifier you have.';
  }
};

/** Explain a single request: why it matched, missed, errored, or was excluded. */
export function explainMatch(log: MatchLog): MatchExplanation {
  const { kind, identifier } = classifyLookup(log.path, log.request?.parameters);
  const idLabel = IDENTIFIER_LABEL[identifier];

  if (kind === 'other') {
    return { verdict: 'excluded', label: 'Not a lookup', detail: 'This request is not a coverage lookup, so it does not affect match rate.', identifier, endpointKind: kind, recovery: null, counts: false };
  }
  if (kind === 'transform') {
    return { verdict: 'excluded', label: 'Computed result', detail: 'A deterministic transform that always returns — not a dataset coverage lookup, so it is excluded from match rate.', identifier, endpointKind: kind, recovery: null, counts: false };
  }

  const s = log.status;
  if (s === 400 || s === 422) {
    return { verdict: 'error', label: 'Invalid input', detail: `The ${idLabel.toLowerCase()} failed validation, so no lookup ran. Excluded from match rate.`, identifier, endpointKind: kind, recovery: 'Fix the input format and retry.', counts: false };
  }
  if (s === 401 || s === 403) {
    return { verdict: 'error', label: 'Auth / scope', detail: 'The request was rejected before any lookup (key or scope), so it is excluded from match rate.', identifier, endpointKind: kind, recovery: 'Check the key and its scopes in API Keys.', counts: false };
  }
  if (s === 429) {
    return { verdict: 'error', label: 'Rate limited', detail: 'Throttled before the lookup ran — excluded from match rate.', identifier, endpointKind: kind, recovery: 'Add backoff or raise the rate limit in Billing.', counts: false };
  }
  if (s >= 500) {
    return { verdict: 'error', label: 'Server error', detail: 'An upstream error prevented the lookup — excluded from match rate.', identifier, endpointKind: kind, recovery: 'Retry; upstream errors are usually transient.', counts: false };
  }
  if (s === 404) {
    return { verdict: 'missed', label: 'Outside coverage', detail: `No record for that ${idLabel.toLowerCase()} in the current dataset.`, identifier, endpointKind: kind, recovery: recoveryFor(identifier), counts: true };
  }
  if (s >= 200 && s < 300) {
    if (hasResolvedData(log.response)) {
      return { verdict: 'matched', label: `Matched on ${idLabel.toLowerCase()}`, detail: `Resolved a record from the ${idLabel.toLowerCase()} with corroborating signals.`, identifier, endpointKind: kind, recovery: null, counts: true };
    }
    return { verdict: 'missed', label: 'No match', detail: `The lookup ran but returned no record for that ${idLabel.toLowerCase()}.`, identifier, endpointKind: kind, recovery: recoveryFor(identifier), counts: true };
  }
  return { verdict: 'error', label: `HTTP ${s}`, detail: 'Unexpected status — excluded from match rate.', identifier, endpointKind: kind, recovery: null, counts: false };
}

export interface MatchRateBucket {
  key: string;
  label: string;
  attempted: number;
  matched: number;
  missed: number;
  matchRate: number; // 0..1
}
export interface MissReason {
  key: string;
  label: string;
  count: number;
  share: number; // 0..1 of all misses
  recovery: string | null;
}
export interface MatchRateSummary {
  total: number;      // all logs considered
  attempted: number;  // matched + missed (the honest denominator)
  matched: number;
  missed: number;
  errors: number;
  excluded: number;
  matchRate: number;  // matched / attempted
  byEndpoint: MatchRateBucket[];
  byIdentifier: MatchRateBucket[];
  missReasons: MissReason[];
}

const rate = (matched: number, attempted: number) => (attempted > 0 ? Math.round((matched / attempted) * 1000) / 1000 : 0);

/** Aggregate an honest match-rate summary over a set of request logs. */
export function aggregateMatchRate(logs: MatchLog[]): MatchRateSummary {
  let matched = 0, missed = 0, errors = 0, excluded = 0;
  const endpoint = new Map<string, MatchRateBucket>();
  const identifier = new Map<string, MatchRateBucket>();
  const missBy = new Map<string, number>();

  for (const log of logs) {
    const ex = explainMatch(log);
    if (ex.verdict === 'excluded') { excluded++; continue; }
    if (ex.verdict === 'error') { errors++; continue; }

    const { endpointLabel } = classifyLookup(log.path, log.request?.parameters);
    const epKey = endpointLabel;
    const idKey = ex.identifier;
    const ep = endpoint.get(epKey) ?? { key: epKey, label: endpointLabel, attempted: 0, matched: 0, missed: 0, matchRate: 0 };
    const id = identifier.get(idKey) ?? { key: idKey, label: IDENTIFIER_LABEL[ex.identifier], attempted: 0, matched: 0, missed: 0, matchRate: 0 };

    ep.attempted++; id.attempted++;
    if (ex.verdict === 'matched') { matched++; ep.matched++; id.matched++; }
    else { missed++; ep.missed++; id.missed++; missBy.set(ex.label, (missBy.get(ex.label) ?? 0) + 1); }

    endpoint.set(epKey, ep); identifier.set(idKey, id);
  }

  const attempted = matched + missed;
  const finalize = (m: Map<string, MatchRateBucket>) =>
    Array.from(m.values()).map((b) => ({ ...b, matchRate: rate(b.matched, b.attempted) }))
      .sort((a, b) => b.attempted - a.attempted);

  const missReasons: MissReason[] = Array.from(missBy.entries())
    .map(([label, count]) => ({
      key: label, label, count,
      share: missed > 0 ? Math.round((count / missed) * 1000) / 1000 : 0,
      recovery: label === 'Outside coverage' ? recoveryFor('email') : null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: logs.length, attempted, matched, missed, errors, excluded,
    matchRate: rate(matched, attempted),
    byEndpoint: finalize(endpoint),
    byIdentifier: finalize(identifier),
    missReasons,
  };
}
