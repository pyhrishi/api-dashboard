/**
 * CORS configuration (F-082) — gateway module, single source of truth.
 *
 * Browser front-ends calling the API need CORS. This module holds the policy the
 * gateway actually applies — the allowed origins, methods, headers, credentials
 * flag, and preflight max-age — and evaluates it against an incoming `Origin`.
 * The console panel reads and edits this policy over `/v1/cors`, so what you set
 * genuinely governs the real preflight (the seam is closed): you can fire a live
 * OPTIONS from the panel and see exactly these headers come back.
 *
 * In-memory + seeded (like the other gateway registries). Pure/deterministic —
 * no I/O, no Math.random.
 *
 * Exposed response headers: a browser can only read CORS-safelisted headers
 * unless the gateway lists the rest in `Access-Control-Expose-Headers`. Every
 * `X-*`/`RateLimit-*` header the API advertises is listed here so JS clients on
 * an allowed origin can actually read them (request id, credits, rate-limit,
 * and the F-312 encryption guarantee).
 */

export type CorsMode = 'allowlist' | 'wildcard' | 'disabled';

export interface CorsPolicy {
  mode: CorsMode;
  allowedOrigins: string[];
  allowCredentials: boolean;
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAgeSeconds: number;
}

export interface CorsEvaluation {
  /** Whether the origin is permitted (a same-origin / no-Origin request is always allowed). */
  allowed: boolean;
  reason: string;
  /** The Access-Control-* headers to attach (empty when nothing should be sent). */
  headers: Record<string, string>;
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key', 'X-Debug-Echo'];
/** Response headers an allowed browser origin may read (see module doc). */
export const EXPOSED_RESPONSE_HEADERS = [
  'X-Request-Id', 'X-Credits-Cost', 'X-Region', 'X-Served-By',
  'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Policy',
  'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-RateLimit-Tier',
  'X-Encryption-Transit', 'X-Encryption-Rest',
  'X-Payload-Limit-Bytes', 'X-Payload-Limit-Depth',
  'X-PII-Masked', 'X-Privacy-Framework',
  'X-Credits-Bucket', 'X-Free-Credits-Remaining',
  'X-Key-Fingerprint',
  'X-Log-Redaction',
];

const ORIGIN_RE = /^https?:\/\/[a-zA-Z0-9.-]+(:\d{1,5})?$/;

let policy: CorsPolicy = seedPolicy();

function seedPolicy(): CorsPolicy {
  return {
    mode: 'allowlist',
    allowedOrigins: ['https://app.zinbit.zintlr.com', 'https://console.zinbit.zintlr.com', 'http://localhost:3000'],
    allowCredentials: true,
    allowedMethods: [...DEFAULT_METHODS],
    allowedHeaders: [...DEFAULT_HEADERS],
    maxAgeSeconds: 86_400,
  };
}

/** A valid CORS origin is `scheme://host[:port]` with no path, query, or trailing slash. */
export function isValidOrigin(origin: string): boolean {
  return ORIGIN_RE.test(String(origin || '').trim());
}

/** Normalize an origin for comparison (lowercase, strip a trailing slash). */
function normalizeOrigin(origin: string): string {
  return String(origin || '').trim().replace(/\/$/, '').toLowerCase();
}

export function getCorsPolicy(): CorsPolicy {
  return { ...policy, allowedOrigins: [...policy.allowedOrigins], allowedMethods: [...policy.allowedMethods], allowedHeaders: [...policy.allowedHeaders] };
}

export type PatchResult = { success: true; policy: CorsPolicy } | { success: false; code: string; message: string };

/** Merge a partial policy update. Validates mode + numeric bounds. */
export function updateCorsPolicy(patch: Partial<CorsPolicy>): PatchResult {
  const next: CorsPolicy = getCorsPolicy();
  if (patch.mode !== undefined) {
    if (!['allowlist', 'wildcard', 'disabled'].includes(patch.mode)) {
      return { success: false, code: 'INVALID_MODE', message: 'mode must be allowlist, wildcard, or disabled.' };
    }
    next.mode = patch.mode;
  }
  if (patch.allowCredentials !== undefined) next.allowCredentials = Boolean(patch.allowCredentials);
  if (patch.maxAgeSeconds !== undefined) {
    const n = Number(patch.maxAgeSeconds);
    if (!Number.isFinite(n) || n < 0 || n > 86_400) return { success: false, code: 'INVALID_MAX_AGE', message: 'maxAgeSeconds must be between 0 and 86400.' };
    next.maxAgeSeconds = Math.round(n);
  }
  if (Array.isArray(patch.allowedMethods)) next.allowedMethods = patch.allowedMethods.map((m) => String(m).toUpperCase()).filter(Boolean);
  if (Array.isArray(patch.allowedHeaders)) next.allowedHeaders = patch.allowedHeaders.map((h) => String(h).trim()).filter(Boolean);
  if (Array.isArray(patch.allowedOrigins)) {
    const bad = patch.allowedOrigins.find((o) => !isValidOrigin(o));
    if (bad) return { success: false, code: 'INVALID_ORIGIN', message: `"${bad}" is not a valid origin (expected scheme://host[:port]).` };
    next.allowedOrigins = Array.from(new Set(patch.allowedOrigins.map(normalizeOrigin)));
  }
  policy = next;
  return { success: true, policy: getCorsPolicy() };
}

export function addAllowedOrigin(origin: string): PatchResult {
  if (!isValidOrigin(origin)) return { success: false, code: 'INVALID_ORIGIN', message: `"${origin}" is not a valid origin (expected scheme://host[:port]).` };
  const norm = normalizeOrigin(origin);
  if (policy.allowedOrigins.map(normalizeOrigin).includes(norm)) return { success: true, policy: getCorsPolicy() };
  policy = { ...getCorsPolicy(), allowedOrigins: [...policy.allowedOrigins, norm] };
  return { success: true, policy: getCorsPolicy() };
}

export function removeAllowedOrigin(origin: string): PatchResult {
  const norm = normalizeOrigin(origin);
  policy = { ...getCorsPolicy(), allowedOrigins: policy.allowedOrigins.filter((o) => normalizeOrigin(o) !== norm) };
  return { success: true, policy: getCorsPolicy() };
}

export function resetCorsPolicy(): void {
  policy = seedPolicy();
}

/**
 * Evaluate an incoming Origin against the policy and produce the CORS headers to
 * attach. `requestMethod` is the actual method (or the requested method on a
 * preflight). A request with no Origin is same-origin and always allowed.
 */
export function evaluateCors(origin: string | null | undefined, requestMethod?: string): CorsEvaluation {
  if (!origin) return { allowed: true, reason: 'No Origin — same-origin request', headers: {} };
  if (policy.mode === 'disabled') return { allowed: false, reason: 'CORS is disabled', headers: {} };

  const norm = normalizeOrigin(origin);
  const methodOk = !requestMethod || policy.allowedMethods.includes(requestMethod.toUpperCase());

  let allowOrigin: string | null = null;
  let reason: string;
  if (policy.mode === 'wildcard') {
    // A credentialed response cannot use "*", so reflect the origin instead.
    allowOrigin = policy.allowCredentials ? origin : '*';
    reason = 'Wildcard mode — all origins allowed';
  } else {
    const listed = policy.allowedOrigins.map(normalizeOrigin).includes(norm);
    if (listed) { allowOrigin = origin; reason = methodOk ? 'Origin is on the allowlist' : `Origin allowed but method ${requestMethod} is not`; }
    else { allowOrigin = null; reason = 'Origin is not on the allowlist'; }
  }

  if (!allowOrigin) return { allowed: false, reason, headers: {} };

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': policy.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': policy.allowedHeaders.join(', '),
    'Access-Control-Max-Age': String(policy.maxAgeSeconds),
    // Let allowed browser origins read the gateway's advertised response headers
    // (request id, credits, rate-limit, and the F-312 encryption guarantee) —
    // without this, only the CORS-safelisted headers are visible to JS clients.
    'Access-Control-Expose-Headers': EXPOSED_RESPONSE_HEADERS.join(', '),
  };
  if (policy.allowCredentials) headers['Access-Control-Allow-Credentials'] = 'true';
  if (allowOrigin !== '*') headers['Vary'] = 'Origin';

  return { allowed: methodOk, reason, headers };
}

export interface CorsStats {
  mode: CorsMode;
  origin_count: number;
  credentials: boolean;
  policy: CorsPolicy;
}

export function getCorsStats(): CorsStats {
  return { mode: policy.mode, origin_count: policy.allowedOrigins.length, credentials: policy.allowCredentials, policy: getCorsPolicy() };
}

/** Reset to seed — test-only alias. */
export function __resetCors(): void {
  resetCorsPolicy();
}
