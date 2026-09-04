/**
 * Canonical API identity for Zinbit by Zintlr.
 *
 * Single source of truth for the public API host, the authentication header,
 * and URL composition. Every marketing demo, docs snippet, code generator,
 * the CLI, and the console must import from here rather than hardcoding a host
 * or header — this is what keeps the prototype internally consistent.
 *
 * NOTE: endpoint paths (see src/data/endpoints.ts) already include the version
 * segment (e.g. `/v1/people/phone`), so the base URLs intentionally do NOT
 * include a `/v1` suffix. Compose a full URL as `${API_BASE_URL}${endpoint.path}`.
 */

export const API_HOST = 'api.zinbit.zintlr.com';
export const API_SANDBOX_HOST = 'sandbox.zinbit.zintlr.com';

/** Live/production API base URL (no version segment — paths carry `/v1`). */
export const API_BASE_URL = `https://${API_HOST}`;
/** Sandbox API base URL. */
export const API_SANDBOX_BASE_URL = `https://${API_SANDBOX_HOST}`;

/** The console/dashboard host (used in billing/upgrade copy, emails, etc.). */
export const CONSOLE_HOST = 'console.zinbit.zintlr.com';

/** The HTTP header name and scheme used to authenticate every API request. */
export const AUTH_HEADER = 'Authorization';
export const AUTH_SCHEME = 'Bearer';

/** Build the `Authorization` header value for a given API key. */
export function authHeaderValue(apiKey: string): string {
  return `${AUTH_SCHEME} ${apiKey}`;
}

/** Resolve the correct base URL for an environment. */
export function apiBaseUrl(environment: 'live' | 'sandbox' = 'live'): string {
  return environment === 'sandbox' ? API_SANDBOX_BASE_URL : API_BASE_URL;
}

/**
 * Same-origin URL for calling a catalog endpoint from the console UI (Explorer, Bulk Jobs,
 * First-Call Wizard). The gateway is mounted under `/api`, so `/v1/people/phone` → `/api/v1/people/phone?...`.
 */
export function consoleApiUrl(endpointPath: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && `${v}`.length > 0)
    .map(([k, v]) => [k, `${v}`] as [string, string]);
  const qs = entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
  return `/api${endpointPath}${qs}`;
}
