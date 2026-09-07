/**
 * Content-Security-Policy — single source of truth (F-315).
 *
 * Hardens the *console app* (its HTML responses) against XSS and clickjacking. This
 * is distinct from the `Content-Security-Policy` the API gateway sets on JSON
 * responses (`default-src 'none'` in gateway/security.ts) — that locks down API
 * payloads; this governs the pages a browser actually renders.
 *
 * Everything here is PURE and Edge-safe (no zustand, no Node APIs) so `middleware.ts`
 * — which runs on the Edge runtime — can import `buildCspHeader` and `generateNonce`
 * without pulling a store or Node crypto into the Edge bundle. The console page and
 * the report route import the same builders + `parseViolationReport`, so the policy
 * a user sees is byte-for-byte the policy the middleware serves.
 *
 * Rollout model: the header defaults to **report-only** (never blocks — the standard,
 * safe way to introduce a CSP on a live app), and an admin opts into **enforce** via
 * a cookie the middleware reads. The shipped directives use `'unsafe-inline'` because
 * the console is largely statically prerendered (a nonce can't be injected into
 * prerendered <script> tags); the nonce below is generated for the documented
 * dynamic-hardening path and surfaced as `x-nonce` for server components.
 */

export type CspMode = 'report-only' | 'enforce';

/** The cookie the console sets and the middleware reads to pick the mode. */
export const CSP_MODE_COOKIE = 'zinbit_csp_mode';
/** Where browsers POST violation reports (our collector route). */
export const CSP_REPORT_PATH = '/api/csp-report';
/** The `report-to` group name (paired with a Report-To response header). */
export const CSP_REPORT_GROUP = 'csp-endpoint';

export interface CspDirective {
  name: string;
  /** Sources; an empty array renders the directive bare (e.g. `upgrade-insecure-requests`). */
  values: string[];
  description: string;
}

/**
 * The console's directives. Deliberately explicit so the console page can render and
 * explain each one. `'unsafe-inline'` on script/style is the pragmatic stance for a
 * prerendered Next app (see file header); `frame-ancestors 'none'`, `object-src
 * 'none'` and `base-uri 'self'` are the real hardening wins.
 */
export const CSP_DIRECTIVES: CspDirective[] = [
  { name: 'default-src', values: ["'self'"], description: 'Fallback for any resource type not set below.' },
  { name: 'base-uri', values: ["'self'"], description: 'Blocks <base> tag hijacking of relative URLs.' },
  { name: 'object-src', values: ["'none'"], description: 'Disallows <object>/<embed>/<applet> (legacy plugin XSS).' },
  { name: 'frame-ancestors', values: ["'none'"], description: 'Clickjacking protection — the console can’t be framed.' },
  { name: 'form-action', values: ["'self'"], description: 'Forms may only submit to the same origin.' },
  { name: 'script-src', values: ["'self'", "'unsafe-inline'"], description: 'Scripts from same origin (inline allowed for prerendered pages).' },
  { name: 'style-src', values: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], description: 'Styles from same origin + Google Fonts stylesheets.' },
  { name: 'img-src', values: ["'self'", 'data:', 'blob:'], description: 'Images from same origin, data: and blob: URIs.' },
  { name: 'font-src', values: ["'self'", 'https://fonts.gstatic.com'], description: 'Fonts from same origin + Google Fonts files.' },
  { name: 'connect-src', values: ["'self'", 'https:'], description: 'XHR/fetch/WebSocket to same origin + HTTPS (telemetry).' },
  { name: 'frame-src', values: ["'none'"], description: 'No embedded <iframe> content.' },
];

/**
 * Render the directive list into a policy string. When `nonce` is provided it is
 * added to `script-src` for the dynamic-hardening path; note a browser ignores
 * `'unsafe-inline'` when a nonce is present, so only pass a nonce on dynamically
 * rendered responses. `reportPath` wires `report-uri` (+ the `report-to` group).
 */
export function buildCspHeader(opts: { nonce?: string; reportPath?: string } = {}): string {
  const { nonce, reportPath = CSP_REPORT_PATH } = opts;
  const parts = CSP_DIRECTIVES.map((d) => {
    let values = d.values;
    if (d.name === 'script-src' && nonce) {
      // Drop 'unsafe-inline' (browsers ignore it alongside a nonce) and pin the nonce.
      values = values.filter((v) => v !== "'unsafe-inline'").concat(`'nonce-${nonce}'`);
    }
    return values.length ? `${d.name} ${values.join(' ')}` : d.name;
  });
  parts.push(`report-uri ${reportPath}`);
  parts.push(`report-to ${CSP_REPORT_GROUP}`);
  return parts.join('; ');
}

/** The HTTP header name for the chosen mode. */
export function cspHeaderName(mode: CspMode): string {
  return mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}

/** The `Report-To` header value pairing the group with our collector. */
export function reportToHeader(reportPath: string = CSP_REPORT_PATH): string {
  return JSON.stringify({ group: CSP_REPORT_GROUP, max_age: 10886400, endpoints: [{ url: reportPath }] });
}

/** Additional defense-in-depth headers we attach alongside the CSP. */
export function hardeningHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

/**
 * A URL-safe base64 nonce from Web Crypto (Edge-safe). Falls back to a
 * timestamp-derived value only if crypto is unavailable (never in practice).
 */
export function generateNonce(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return btoa(`${Date.now()}`).replace(/=+$/, '');
  }
}

// ── Violation reports ─────────────────────────────────────────────────────────

/** A normalized CSP violation (from either report format). */
export interface CspViolation {
  id: string;
  documentUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  blockedUri: string;
  disposition: 'report' | 'enforce';
  sourceFile?: string;
  lineNumber?: number;
  at: number;
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * Parse a posted violation into our shape. Browsers post either the legacy
 * `{ "csp-report": {...} }` (application/csp-report) or the Reporting API
 * `{ type:"csp-violation", body:{...} }` (application/reports+json, often batched).
 * Returns [] on anything unrecognized — never throws.
 */
export function parseViolationReport(body: unknown, now: number = Date.now()): CspViolation[] {
  const out: CspViolation[] = [];
  const push = (r: Record<string, unknown>, disposition?: string) => {
    // Support both kebab-case (legacy) and camelCase (Reporting API) keys.
    const documentUri = asString(r['document-uri']) ?? asString(r.documentURL) ?? asString(r.documentUri) ?? 'unknown';
    const effective = asString(r['effective-directive']) ?? asString(r.effectiveDirective) ?? asString(r['violated-directive']) ?? asString(r.violatedDirective) ?? 'unknown';
    const violated = asString(r['violated-directive']) ?? asString(r.violatedDirective) ?? effective;
    const blockedUri = asString(r['blocked-uri']) ?? asString(r.blockedURL) ?? asString(r.blockedUri) ?? 'inline';
    const disp = (disposition ?? asString(r.disposition)) === 'enforce' ? 'enforce' : 'report';
    out.push({
      id: `cspv_${(now).toString(36)}_${out.length}_${Math.abs(hashStr(`${blockedUri}${effective}${documentUri}`)).toString(36)}`,
      documentUri, violatedDirective: violated, effectiveDirective: effective, blockedUri,
      disposition: disp,
      sourceFile: asString(r['source-file']) ?? asString(r.sourceFile),
      lineNumber: asNumber(r['line-number']) ?? asNumber(r.lineNumber),
      at: now,
    });
  };

  if (typeof body !== 'object' || body === null) return out;

  if (Array.isArray(body)) {
    // Reporting API batch: array of { type, body }.
    for (const item of body) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'csp-violation') {
        const b = (item as Record<string, unknown>).body;
        if (b && typeof b === 'object') push(b as Record<string, unknown>);
      }
    }
    return out;
  }

  const rec = body as Record<string, unknown>;
  if (rec['csp-report'] && typeof rec['csp-report'] === 'object') {
    push(rec['csp-report'] as Record<string, unknown>);
  } else if (rec.type === 'csp-violation' && rec.body && typeof rec.body === 'object') {
    push(rec.body as Record<string, unknown>);
  } else if (rec['effective-directive'] || rec.effectiveDirective || rec['violated-directive']) {
    push(rec); // a bare report body
  }
  return out;
}

/** Small FNV-1a for stable violation ids (deterministic, no Math.random in the SSOT). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
