/**
 * Payload size & depth limits — gateway enforcement (F-314).
 *
 * Runs before any sub-router touches a request body: measures the raw body (a
 * cloned stream, so downstream parsers are untouched) and the URL against the
 * org's effective limits, rejects with a 413/414/422 that names the dimension,
 * the measured value, the limit, and the fix, and advertises the headline limits
 * on every response (`X-Payload-Limit-Bytes`, `X-Payload-Limit-Depth`).
 *
 * Also serves the `/v1/limits/payload` meta routes: GET (limits + rejection
 * ledger), PATCH (admin overrides — tighten only), POST `/check` (a free dry run
 * that measures a body without executing anything). The SSOT (`@/lib/payload-limits`)
 * is shared with the console, so the analyzer's prediction == the edge's verdict.
 *
 * In-memory, per-isolate, deterministic — no `Math.random`. The ledger is seeded
 * lazily per org so the console reads as a running system.
 */

import { orgHandleForKey } from '@/lib/encryption';
import { tierForKey, type ThroughputTier } from '@/lib/throughput-tiers';
import {
  resolveLimits, resolveLimitsForPath, measurePayload, evaluatePayload, normalizeOverrides, payloadLimitHeaders,
  TIER_PAYLOAD_LIMITS, DIMENSIONS, ENDPOINT_PROFILES,
  type PayloadLimits, type PayloadOverrides, type PayloadMeasure, type PayloadVerdict, type PayloadViolation, type PayloadDimension, type EndpointProfile,
} from '@/lib/payload-limits';

// ── Per-org state ────────────────────────────────────────────────────────────

export interface RejectionRecord {
  id: string;
  at: number;
  orgId: string;
  method: string;
  path: string;
  dimension: PayloadDimension;
  measured: number;
  limit: number;
  code: string;
  status: number;
}

interface OrgState {
  overrides: PayloadOverrides;
  rejections: RejectionRecord[];
  seq: number;
}

const LEDGER_CAP = 200;
const stateByOrg = new Map<string, OrgState>();

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Seed a handful of plausible past rejections so the ledger reads as continuous. */
function seedRejections(orgId: string, tier: ThroughputTier, now: number): RejectionRecord[] {
  const limits = TIER_PAYLOAD_LIMITS[tier];
  const seeds: { path: string; dimension: PayloadDimension; factor: number; hoursAgo: number }[] = [
    { path: '/v1/batch/enrich', dimension: 'arrayLength', factor: 2.4, hoursAgo: 3 },
    { path: '/v1/batch/enrich', dimension: 'bytes', factor: 1.35, hoursAgo: 9 },
    { path: '/v1/enrich/stream', dimension: 'depth', factor: 2.5, hoursAgo: 26 },
    { path: '/v1/people/search/ai', dimension: 'stringLength', factor: 1.8, hoursAgo: 41 },
  ];
  // Vary how many seeds an org gets (2–4), deterministically.
  const count = 2 + (fnv(orgId) % 3);
  return seeds.slice(0, count).map((s, i) => {
    const spec = DIMENSIONS.find((d) => d.key === s.dimension)!;
    const limit = limits[spec.limitKey];
    return {
      id: `rej_${fnv(`${orgId}:${i}`).toString(16)}`,
      at: now - s.hoursAgo * 3_600_000 - (fnv(`${orgId}:m:${i}`) % 3_000_000),
      orgId,
      method: 'POST',
      path: s.path,
      dimension: s.dimension,
      measured: Math.round(limit * s.factor),
      limit,
      code: spec.code,
      status: spec.status,
    };
  });
}

function stateFor(orgId: string, apiKey: string | undefined, now: number): OrgState {
  let s = stateByOrg.get(orgId);
  if (!s) {
    s = { overrides: {}, rejections: seedRejections(orgId, tierForKey(apiKey ?? ''), now), seq: 0 };
    stateByOrg.set(orgId, s);
  }
  return s;
}

// ── Limits for a key ─────────────────────────────────────────────────────────

export interface EffectiveLimits {
  orgId: string;
  tier: ThroughputTier;
  limits: PayloadLimits;
  ceiling: PayloadLimits;
  overrides: PayloadOverrides;
}

export function limitsForKey(apiKey: string | undefined, now: number = Date.now()): EffectiveLimits {
  const orgId = orgHandleForKey(apiKey);
  const tier = tierForKey(apiKey ?? '');
  const s = stateFor(orgId, apiKey, now);
  return { orgId, tier, limits: resolveLimits(tier, s.overrides), ceiling: TIER_PAYLOAD_LIMITS[tier], overrides: { ...s.overrides } };
}

export function attachPayloadLimitHeaders(headers: HeadersInit, limits: PayloadLimits): void {
  Object.assign(headers as Record<string, string>, payloadLimitHeaders(limits));
}

// ── Enforcement ──────────────────────────────────────────────────────────────

export type GuardResult =
  | { ok: true; effective: EffectiveLimits; measure: PayloadMeasure; profile: EndpointProfile | null }
  | { ok: false; effective: EffectiveLimits; measure: PayloadMeasure; profile: EndpointProfile | null; violation: PayloadViolation; verdict: PayloadVerdict };

/**
 * Measure + judge one request. Records a rejection in the org ledger. GET/HEAD
 * bodies are ignored (only the URL is checked). An unparseable body is judged on
 * bytes/URL only — the pipeline then treats it as an empty body. Ingest endpoints
 * (`/v1/jobs`, `/v1/enrich/stream`) get their profile's ceilings so the escape
 * hatch the fix messages recommend is actually open. Fast path: a body already
 * over the byte cap is never parsed, and the depth walk stops once it's over.
 */
export function guardPayload(apiKey: string | undefined, method: string, url: string, rawBody: string, now: number = Date.now()): GuardResult {
  const base = limitsForKey(apiKey, now);
  const path = pathOnly(url);
  const { limits, profile } = resolveLimitsForPath(base.tier, base.overrides, path);
  const effective: EffectiveLimits = { ...base, limits };
  const body = method === 'GET' || method === 'HEAD' ? '' : rawBody;
  const measure = measurePayload(body, pathWithQuery(url), { skipParseAboveBytes: limits.maxBodyBytes, stopAtDepth: limits.maxDepth });
  const verdict = evaluatePayload(measure, limits, effective.tier);
  if (verdict.ok || !verdict.primary) return { ok: true, effective, measure, profile };
  const s = stateFor(effective.orgId, apiKey, now);
  s.seq += 1;
  s.rejections.unshift({
    id: `rej_${fnv(`${effective.orgId}:${now}:${s.seq}`).toString(16)}`,
    at: now,
    orgId: effective.orgId,
    method,
    path: pathOnly(url),
    dimension: verdict.primary.dimension,
    measured: verdict.primary.measured,
    limit: verdict.primary.limit,
    code: verdict.primary.code,
    status: verdict.primary.status,
  });
  if (s.rejections.length > LEDGER_CAP) s.rejections.length = LEDGER_CAP;
  return { ok: false, effective, measure, profile, violation: verdict.primary, verdict };
}

/** The URL as the developer sees it in the catalog — `/v1/...?query`, no `/api` prefix. */
function pathWithQuery(url: string): string {
  try { const u = new URL(url); return `${u.pathname.replace(/^\/api/, '')}${u.search}`; } catch { return url; }
}
function pathOnly(url: string): string {
  try { return new URL(url).pathname.replace(/^\/api/, ''); } catch { return url; }
}

// ── Dry run (POST /v1/limits/payload/check) ──────────────────────────────────

export interface DryRunResult {
  tier: ThroughputTier;
  limits: PayloadLimits;
  /** The endpoint profile that applied to `target`, if any. */
  profile: EndpointProfile | null;
  target: string;
  measure: PayloadMeasure;
  verdict: PayloadVerdict;
  /** What the gateway would have returned for a real call with this body. */
  wouldReturn: { status: number; code: string | null };
}

/** Measure a body against the org's limits without executing or recording anything. */
export function dryRunPayload(apiKey: string | undefined, rawBody: string, targetPath: string = '/v1/batch/enrich', now: number = Date.now()): DryRunResult {
  const base = limitsForKey(apiKey, now);
  const target = targetPath.replace(/^\/api/, '').split('?')[0] || '/v1/batch/enrich';
  const { limits, profile } = resolveLimitsForPath(base.tier, base.overrides, target);
  const measure = measurePayload(rawBody, target);
  const verdict = evaluatePayload(measure, limits, base.tier);
  return {
    tier: base.tier,
    limits,
    profile,
    target,
    measure,
    verdict,
    wouldReturn: verdict.primary ? { status: verdict.primary.status, code: verdict.primary.code } : { status: 200, code: null },
  };
}

// ── Snapshot + settings (GET / PATCH /v1/limits/payload) ─────────────────────

export interface PayloadLimitsSnapshot extends EffectiveLimits {
  /** Endpoint profiles that replace some dimensions on every plan (the escape hatches). */
  profiles: readonly EndpointProfile[];
  rejections: RejectionRecord[];
  stats: { total: number; last24h: number; byDimension: Record<PayloadDimension, number> };
}

export function getPayloadLimitsSnapshot(apiKey: string | undefined, now: number = Date.now()): PayloadLimitsSnapshot {
  const effective = limitsForKey(apiKey, now);
  const s = stateFor(effective.orgId, apiKey, now);
  const byDimension = DIMENSIONS.reduce((acc, d) => { acc[d.key] = 0; return acc; }, {} as Record<PayloadDimension, number>);
  let last24h = 0;
  s.rejections.forEach((r) => { byDimension[r.dimension] += 1; if (now - r.at <= 86_400_000) last24h += 1; });
  return { ...effective, profiles: ENDPOINT_PROFILES, rejections: s.rejections.slice(0, 50), stats: { total: s.rejections.length, last24h, byDimension } };
}

export function updatePayloadOverrides(apiKey: string | undefined, body: unknown, now: number = Date.now()): PayloadLimitsSnapshot {
  const orgId = orgHandleForKey(apiKey);
  const s = stateFor(orgId, apiKey, now);
  const { set, clear } = normalizeOverrides(body);
  clear.forEach((k) => { delete s.overrides[k]; });
  s.overrides = { ...s.overrides, ...set };
  return getPayloadLimitsSnapshot(apiKey, now);
}

/** Test/demo hook — clear the per-isolate state. */
export function __resetPayloadLimits(): void {
  stateByOrg.clear();
}
