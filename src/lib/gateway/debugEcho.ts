/**
 * Request replay & debug echo (F-074) — gateway module, single source of truth.
 *
 * Send any request with `X-Debug-Echo: true` and the gateway does NOT execute it;
 * instead it returns exactly how it *read* the request — the parsed params, the
 * redacted headers, which endpoint matched, the resolved region/node, the key
 * type + environment, the privacy framework that would apply, what the call
 * would cost, and which edge policies fired. A dry run for integration debugging:
 * see the gateway's interpretation before spending a real call.
 *
 * `buildDebugEcho` is pure — it formats a context the route handler assembles
 * (it does not recompute region/framework, so the echo can never disagree with a
 * live call). Deterministic; no I/O, no Math.random.
 */

export type PolicyStatus = 'ok' | 'skipped' | 'applied' | 'blocked';

export interface DebugEchoContext {
  method: string;
  path: string;
  params: Record<string, unknown>;
  headers: Record<string, string>;
  bodyPresent: boolean;
  apiKey: string;
  region: string;
  node: string;
  countryCode: string;
  privacyFramework: string;
  endpointId?: string;
  endpointName?: string;
  endpointMatched: boolean;
  baseCreditCost?: number;
  wouldCharge?: number;
  rateLimit?: { limit: number; remaining: number };
}

export interface DebugEchoPolicy {
  name: string;
  status: PolicyStatus;
  detail: string;
}

export interface DebugEcho {
  received: {
    method: string;
    path: string;
    params: Record<string, unknown>;
    headers: Record<string, string>;
    body_present: boolean;
  };
  interpreted: {
    endpoint: { id: string; name: string; matched: boolean } | null;
    region: string;
    node: string;
    environment: 'sandbox' | 'live' | 'unknown';
    auth: { scheme: string; key_prefix: string; key_type: 'sandbox' | 'live' | 'jwt' | 'unknown' };
    privacy: { framework: string; country_code: string; masking_applies: boolean };
    rate_limit?: { limit: number; remaining: number };
  };
  billing: { base_cost: number; would_charge: number; note: string };
  policies: DebugEchoPolicy[];
  note: string;
}

/** Headers whose values are sensitive and must be masked in the echo. */
const SENSITIVE_HEADERS = new Set(['authorization', 'x-api-key', 'cookie', 'idempotency-key']);

/** Redact sensitive header values, keeping a recognizable prefix for auth. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (!SENSITIVE_HEADERS.has(key)) { out[k] = v; continue; }
    if (key === 'authorization') {
      const m = v.match(/^(Bearer\s+)(\S+)/i);
      out[k] = m ? `${m[1]}${keyPrefixOf(m[2])}••••` : 'Bearer ••••';
    } else if (key === 'x-api-key') {
      out[k] = `${keyPrefixOf(v)}••••`;
    } else {
      out[k] = '••••';
    }
  }
  return out;
}

function keyPrefixOf(key: string): string {
  if (!key) return '';
  const underscore = key.lastIndexOf('_');
  return underscore > 0 ? key.slice(0, underscore + 1) : key.slice(0, 8);
}

function keyTypeOf(apiKey: string): 'sandbox' | 'live' | 'jwt' | 'unknown' {
  if (apiKey.startsWith('sk_test_')) return 'sandbox';
  if (apiKey.startsWith('sk_live_')) return 'live';
  if (apiKey.split('.').length === 3) return 'jwt';
  return 'unknown';
}

/** Build the debug echo — the gateway's own read of the request. */
export function buildDebugEcho(ctx: DebugEchoContext): DebugEcho {
  const keyType = keyTypeOf(ctx.apiKey);
  const environment: 'sandbox' | 'live' | 'unknown' = keyType === 'sandbox' ? 'sandbox' : keyType === 'live' ? 'live' : 'unknown';
  const maskingApplies = keyType === 'live' && ctx.privacyFramework !== 'NONE';
  const baseCost = ctx.baseCreditCost ?? 0;
  const wouldCharge = ctx.wouldCharge ?? baseCost;

  const policies: DebugEchoPolicy[] = [
    { name: 'Authentication', status: keyType === 'unknown' ? 'blocked' : 'ok', detail: keyType === 'unknown' ? 'No recognizable API key' : `Accepted ${keyType} key` },
    { name: 'Rate limit', status: 'ok', detail: ctx.rateLimit ? `${ctx.rateLimit.remaining}/${ctx.rateLimit.limit} remaining in window` : 'Within limit' },
    { name: 'Routing', status: ctx.endpointMatched ? 'ok' : 'blocked', detail: ctx.endpointMatched ? `Matched ${ctx.endpointId} in ${ctx.region}` : `No endpoint matches ${ctx.method} ${ctx.path}` },
    { name: 'PII masking', status: maskingApplies ? 'applied' : 'skipped', detail: maskingApplies ? `${ctx.privacyFramework} masking on live key` : keyType === 'sandbox' ? 'Sandbox key returns unmasked synthetic data' : 'No framework in effect' },
    { name: 'Metered billing', status: ctx.endpointMatched ? 'ok' : 'skipped', detail: ctx.endpointMatched ? `${wouldCharge} credit(s) would be charged` : 'Not billed — no endpoint matched' },
  ];

  return {
    received: {
      method: ctx.method,
      path: ctx.path,
      params: ctx.params,
      headers: redactHeaders(ctx.headers),
      body_present: ctx.bodyPresent,
    },
    interpreted: {
      endpoint: ctx.endpointId ? { id: ctx.endpointId, name: ctx.endpointName ?? ctx.endpointId, matched: ctx.endpointMatched } : null,
      region: ctx.region,
      node: ctx.node,
      environment,
      auth: { scheme: 'Bearer', key_prefix: keyPrefixOf(ctx.apiKey), key_type: keyType },
      privacy: { framework: ctx.privacyFramework, country_code: ctx.countryCode, masking_applies: maskingApplies },
      rate_limit: ctx.rateLimit,
    },
    billing: {
      base_cost: baseCost,
      would_charge: wouldCharge,
      note: ctx.endpointMatched ? 'This is a dry run — no credits were charged.' : 'No endpoint matched, so nothing would be charged.',
    },
    policies,
    note: 'Debug echo: the request was inspected, not executed. Remove the X-Debug-Echo header to run it for real.',
  };
}
