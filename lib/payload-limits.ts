/**
 * Payload size & depth limits — single source of truth (F-314).
 *
 * Oversized or deeply nested request bodies are a classic abuse vector (memory
 * exhaustion, parser recursion) and a classic developer frustration (an opaque 413
 * with no hint of what to change). This module models both halves as one thing:
 *   - the **limits** — six dimensions, sized per plan tier (the same throughput
 *     tier ladder the rate limiter uses), tightenable per org by an admin;
 *   - the **measurement** — an iterative (stack-safe) walk of a JSON payload that
 *     reports bytes, depth, longest array, key count, longest string, URL length;
 *   - the **verdict** — typed violations that name the dimension, the measured
 *     value, the limit, and a concrete fix (including a chunking plan).
 *
 * Shared by the console (`/console/payload-limits`), the gateway module
 * (`src/lib/gateway/payloadLimits.ts`), and the tests, so what the analyzer
 * predicts is exactly what the edge enforces. Deterministic — no `Math.random`.
 * Mutable org overrides live in the dedicated persisted `usePayloadLimits` store,
 * separate from the tenant store (like the other cross-cutting security stores).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TIER_ORDER, type ThroughputTier } from '@/lib/throughput-tiers';

// ── Types ────────────────────────────────────────────────────────────────────

export type PayloadDimension = 'bytes' | 'depth' | 'arrayLength' | 'keys' | 'stringLength' | 'urlLength';

export interface PayloadLimits {
  /** Maximum request body size in bytes (UTF-8). */
  maxBodyBytes: number;
  /** Maximum JSON nesting depth (a scalar at the root is depth 0; `{"a":[1]}` is depth 2). */
  maxDepth: number;
  /** Maximum number of items in any single array. */
  maxArrayLength: number;
  /** Maximum total number of object keys across the whole payload. */
  maxKeys: number;
  /** Maximum length (UTF-16 code units) of any single string value. */
  maxStringLength: number;
  /** Maximum request URL length, including the query string. */
  maxUrlLength: number;
}

export type PayloadOverrides = Partial<PayloadLimits>;

export interface PayloadMeasure {
  bytes: number;
  depth: number;
  maxArrayLength: number;
  keys: number;
  maxStringLength: number;
  urlLength: number;
  /** Whether the body parsed as JSON (structure dimensions are 0 when it didn't). */
  validJson: boolean;
  /** Whether the body was empty (no structure to measure). */
  empty: boolean;
}

export interface PayloadViolation {
  dimension: PayloadDimension;
  measured: number;
  limit: number;
  /** Gateway error code. */
  code: string;
  /** HTTP status the gateway returns. */
  status: 413 | 414 | 422;
  message: string;
  fix: string;
}

export interface PayloadVerdict {
  ok: boolean;
  violations: PayloadViolation[];
  /** The most severe violation (bytes > depth > others), if any. */
  primary: PayloadViolation | null;
}

export interface DimensionSpec {
  key: PayloadDimension;
  limitKey: keyof PayloadLimits;
  measureKey: keyof Pick<PayloadMeasure, 'bytes' | 'depth' | 'maxArrayLength' | 'keys' | 'maxStringLength' | 'urlLength'>;
  label: string;
  unit: 'bytes' | 'levels' | 'items' | 'keys' | 'chars';
  code: string;
  status: 413 | 414 | 422;
  /** Preset values an admin may pick from (each ≤ the tier ceiling applies). */
  presets: readonly number[];
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const KB = 1024;
const MB = 1024 * KB;

export const DIMENSIONS: readonly DimensionSpec[] = [
  { key: 'bytes', limitKey: 'maxBodyBytes', measureKey: 'bytes', label: 'Body size', unit: 'bytes', code: 'PAYLOAD_TOO_LARGE', status: 413, presets: [64 * KB, 128 * KB, 256 * KB, 512 * KB, 1 * MB, 2 * MB, 4 * MB] },
  { key: 'depth', limitKey: 'maxDepth', measureKey: 'depth', label: 'Nesting depth', unit: 'levels', code: 'PAYLOAD_TOO_DEEP', status: 422, presets: [8, 12, 16, 24, 32] },
  { key: 'arrayLength', limitKey: 'maxArrayLength', measureKey: 'maxArrayLength', label: 'Array length', unit: 'items', code: 'PAYLOAD_ARRAY_TOO_LONG', status: 422, presets: [100, 250, 500, 1000, 2000, 5000, 10000] },
  { key: 'keys', limitKey: 'maxKeys', measureKey: 'keys', label: 'Object keys', unit: 'keys', code: 'PAYLOAD_TOO_MANY_KEYS', status: 422, presets: [500, 1000, 2000, 5000, 10000, 50000] },
  { key: 'stringLength', limitKey: 'maxStringLength', measureKey: 'maxStringLength', label: 'String length', unit: 'chars', code: 'PAYLOAD_STRING_TOO_LONG', status: 422, presets: [1 * KB, 4 * KB, 8 * KB, 32 * KB, 128 * KB] },
  { key: 'urlLength', limitKey: 'maxUrlLength', measureKey: 'urlLength', label: 'URL length', unit: 'chars', code: 'URI_TOO_LONG', status: 414, presets: [2 * KB, 4 * KB, 8 * KB] },
];

export const DIMENSION_BY_KEY: Record<PayloadDimension, DimensionSpec> = DIMENSIONS.reduce(
  (acc, d) => { acc[d.key] = d; return acc; },
  {} as Record<PayloadDimension, DimensionSpec>,
);

/** Per-plan ceilings. Sandbox keys are Starter (the same rule the rate limiter uses). */
export const TIER_PAYLOAD_LIMITS: Record<ThroughputTier, PayloadLimits> = {
  Starter: { maxBodyBytes: 256 * KB, maxDepth: 16, maxArrayLength: 500, maxKeys: 2000, maxStringLength: 8 * KB, maxUrlLength: 4 * KB },
  Growth: { maxBodyBytes: 1 * MB, maxDepth: 24, maxArrayLength: 2000, maxKeys: 10000, maxStringLength: 32 * KB, maxUrlLength: 8 * KB },
  Enterprise: { maxBodyBytes: 4 * MB, maxDepth: 32, maxArrayLength: 10000, maxKeys: 50000, maxStringLength: 128 * KB, maxUrlLength: 8 * KB },
};

/**
 * Per-endpoint profiles — the escape hatches. A limit story that says "submit the
 * whole set as an async job" must let the job endpoint accept the whole set, so
 * ingest endpoints carry their own ceilings on every plan (matching the caps those
 * handlers already enforce: `/v1/jobs` accepts 10,000 inputs, `/v1/enrich/stream`
 * 500). Profile values replace the tier's for the named dimensions; admin
 * overrides still tighten everything else.
 */
export interface EndpointProfile {
  id: string;
  label: string;
  /** Exact `/v1/...` paths (no `/api` prefix, no query). */
  paths: readonly string[];
  limits: Partial<PayloadLimits>;
  why: string;
}

export const ENDPOINT_PROFILES: readonly EndpointProfile[] = [
  {
    id: 'ingest-jobs', label: 'Async jobs', paths: ['/v1/jobs'],
    limits: { maxArrayLength: 10_000, maxBodyBytes: 4 * MB },
    why: 'The escape hatch for anything bigger than one request — up to 10,000 inputs / 4 MB on every plan.',
  },
  {
    id: 'ingest-stream', label: 'Streaming enrich', paths: ['/v1/enrich/stream'],
    limits: { maxArrayLength: 500 },
    why: 'Streams are bounded by the stream engine’s own 500-input cap on every plan.',
  },
];

export function profileForPath(path: string | undefined): EndpointProfile | null {
  if (!path) return null;
  const clean = path.replace(/^\/api/, '').split('?')[0];
  return ENDPOINT_PROFILES.find((p) => p.paths.includes(clean)) ?? null;
}

/** Effective limits for a request: tier ⊓ overrides, then the endpoint profile's dimensions. */
export function resolveLimitsForPath(tier: ThroughputTier, overrides: PayloadOverrides, path: string | undefined): { limits: PayloadLimits; profile: EndpointProfile | null } {
  const base = resolveLimits(tier, overrides);
  const profile = profileForPath(path);
  return { limits: profile ? { ...base, ...profile.limits } : base, profile };
}

/** The next tier up whose ceiling would accept `measured` on `dimension`, if any. */
export function tierThatFits(current: ThroughputTier, dimension: PayloadDimension, measured: number): ThroughputTier | null {
  const spec = DIMENSION_BY_KEY[dimension];
  const start = TIER_ORDER.indexOf(current) + 1;
  for (let i = start; i < TIER_ORDER.length; i++) {
    if (TIER_PAYLOAD_LIMITS[TIER_ORDER[i]][spec.limitKey] >= measured) return TIER_ORDER[i];
  }
  return null;
}

/**
 * Effective limits for an org: the tier ceiling, tightened by any admin override.
 * Overrides can only tighten (an override above the ceiling is clamped to it) and
 * never drop below the smallest preset, so a typo can't lock out every request.
 */
export function resolveLimits(tier: ThroughputTier, overrides: PayloadOverrides = {}): PayloadLimits {
  const ceiling = TIER_PAYLOAD_LIMITS[tier];
  const out: PayloadLimits = { ...ceiling };
  DIMENSIONS.forEach((d) => {
    const o = overrides[d.limitKey];
    if (typeof o === 'number' && Number.isFinite(o)) {
      out[d.limitKey] = Math.max(d.presets[0], Math.min(ceiling[d.limitKey], Math.round(o)));
    }
  });
  return out;
}

/**
 * Narrow an untrusted body into overrides. Only known limit keys with numeric,
 * finite values survive; values are clamped by `resolveLimits` later. `null`
 * explicitly clears an override. Drops, never throws.
 */
export function normalizeOverrides(input: unknown): { set: PayloadOverrides; clear: (keyof PayloadLimits)[] } {
  const set: PayloadOverrides = {};
  const clear: (keyof PayloadLimits)[] = [];
  if (!input || typeof input !== 'object') return { set, clear };
  const body = input as Record<string, unknown>;
  DIMENSIONS.forEach((d) => {
    const v = body[d.limitKey];
    if (v === null) clear.push(d.limitKey);
    else if (typeof v === 'number' && Number.isFinite(v) && v > 0) set[d.limitKey] = Math.round(v);
  });
  return { set, clear };
}

// ── Measurement (iterative, stack-safe) ──────────────────────────────────────

/** UTF-8 byte length without relying on TextEncoder/Buffer (works in every runtime). */
export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; } // surrogate pair → one 4-byte code point
    else bytes += 3;
  }
  return bytes;
}

interface Frame { value: unknown; depth: number }

/**
 * Walk a parsed JSON value iteratively (an explicit stack, so a hostile 100k-deep
 * nest can't overflow the call stack) and report its structural dimensions.
 * `stopAtDepth` lets the gateway bail early once a payload is already over.
 */
export function measureJson(root: unknown, stopAtDepth: number = Number.POSITIVE_INFINITY): Pick<PayloadMeasure, 'depth' | 'maxArrayLength' | 'keys' | 'maxStringLength'> {
  let depth = 0;
  let maxArrayLength = 0;
  let keys = 0;
  let maxStringLength = 0;
  const stack: Frame[] = [{ value: root, depth: 0 }];
  while (stack.length) {
    const { value, depth: d } = stack.pop()!;
    if (typeof value === 'string') { if (value.length > maxStringLength) maxStringLength = value.length; continue; }
    if (value === null || typeof value !== 'object') continue;
    const here = d + 1;
    if (here > depth) depth = here;
    if (here > stopAtDepth) break;
    if (Array.isArray(value)) {
      if (value.length > maxArrayLength) maxArrayLength = value.length;
      for (let i = 0; i < value.length; i++) stack.push({ value: value[i], depth: here });
    } else {
      const entries = Object.keys(value as Record<string, unknown>);
      keys += entries.length;
      for (let i = 0; i < entries.length; i++) stack.push({ value: (value as Record<string, unknown>)[entries[i]], depth: here });
    }
  }
  return { depth, maxArrayLength, keys, maxStringLength };
}

export interface MeasureOptions {
  /** Skip parsing entirely when the body is already over this many bytes (the edge's fast path). */
  skipParseAboveBytes?: number;
  /** Stop walking once nesting exceeds this depth (the edge's fast path). */
  stopAtDepth?: number;
}

/**
 * Measure a raw request: body text (+ optional URL). Invalid JSON → bytes only.
 * The console analyzer measures everything (it teaches); the gateway passes
 * `opts` so an oversized body is never fully parsed just to be refused.
 */
export function measurePayload(raw: string, url: string = '', opts: MeasureOptions = {}): PayloadMeasure {
  const bytes = utf8ByteLength(raw);
  const empty = raw.trim().length === 0;
  const skipParse = opts.skipParseAboveBytes !== undefined && bytes > opts.skipParseAboveBytes;
  let parsed: unknown;
  let validJson = false;
  if (!empty && !skipParse) {
    try { parsed = JSON.parse(raw); validJson = true; } catch { validJson = false; }
  }
  const structure = validJson ? measureJson(parsed, opts.stopAtDepth) : { depth: 0, maxArrayLength: 0, keys: 0, maxStringLength: 0 };
  return { bytes, ...structure, urlLength: url.length, validJson, empty };
}

// ── Verdict ──────────────────────────────────────────────────────────────────

export function formatBytes(n: number): string {
  if (n >= MB) return `${(n / MB).toFixed(n % MB === 0 ? 0 : 1)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(n % KB === 0 ? 0 : 1)} KB`;
  return `${n} B`;
}

export function formatMeasure(dimension: PayloadDimension, n: number): string {
  return dimension === 'bytes' ? formatBytes(n) : `${n.toLocaleString()} ${DIMENSION_BY_KEY[dimension].unit}`;
}

/** How to split an array of `length` so each chunk fits `limit`. */
export function chunkPlan(length: number, limit: number): { chunks: number; perChunk: number } | null {
  if (limit <= 0 || length <= limit) return null;
  const chunks = Math.ceil(length / limit);
  return { chunks, perChunk: Math.ceil(length / chunks) };
}

function fixFor(dimension: PayloadDimension, measured: number, limit: number, tier: ThroughputTier | undefined): string {
  const upgrade = tier ? tierThatFits(tier, dimension, measured) : null;
  const upgradeClause = upgrade ? ` The ${upgrade} plan raises this limit to ${formatMeasure(dimension, TIER_PAYLOAD_LIMITS[upgrade][DIMENSION_BY_KEY[dimension].limitKey])}.` : '';
  switch (dimension) {
    case 'bytes':
      return `Split the request into smaller batches, request only the fields you need (?fields=), or submit large inputs as an async job (POST /v1/jobs).${upgradeClause}`;
    case 'depth':
      return `Flatten the payload — enrichment inputs are flat records; move nested metadata into top-level keys or a single "metadata" object.${upgradeClause}`;
    case 'arrayLength': {
      const plan = chunkPlan(measured, limit);
      return `${plan ? `Send ${plan.chunks} requests of ≤${plan.perChunk.toLocaleString()} items each, ` : 'Send fewer items per request, '}or submit the whole set as one async job (POST /v1/jobs).${upgradeClause}`;
    }
    case 'keys':
      return `Trim unused attributes from each record before sending; the gateway only reads the documented parameters.${upgradeClause}`;
    case 'stringLength':
      return `Shorten the field or move free-text content out of the request — enrichment inputs are identifiers, not documents.${upgradeClause}`;
    case 'urlLength':
      return `Move parameters into a JSON body (POST) instead of the query string, or shorten the list of identifiers per request.`;
  }
}

/** Evaluate a measurement against limits — every violated dimension, most severe first. */
export function evaluatePayload(measure: PayloadMeasure, limits: PayloadLimits, tier?: ThroughputTier): PayloadVerdict {
  const violations: PayloadViolation[] = [];
  DIMENSIONS.forEach((d) => {
    const measured = measure[d.measureKey];
    const limit = limits[d.limitKey];
    if (measured > limit) {
      violations.push({
        dimension: d.key,
        measured,
        limit,
        code: d.code,
        status: d.status,
        message: `${d.label} is ${formatMeasure(d.key, measured)}; the limit${tier ? ` for your ${tier} plan` : ''} is ${formatMeasure(d.key, limit)}.`,
        fix: fixFor(d.key, measured, limit, tier),
      });
    }
  });
  // DIMENSIONS is already ordered by severity (bytes, depth, then structure, URL).
  return { ok: violations.length === 0, violations, primary: violations[0] ?? null };
}

/** Advertise the two headline limits on every response. */
export function payloadLimitHeaders(limits: PayloadLimits): Record<string, string> {
  return {
    'X-Payload-Limit-Bytes': String(limits.maxBodyBytes),
    'X-Payload-Limit-Depth': String(limits.maxDepth),
  };
}

/** Utilisation of a dimension, 0–1+ (>1 = over). */
export function utilisation(measure: PayloadMeasure, limits: PayloadLimits, dimension: PayloadDimension): number {
  const d = DIMENSION_BY_KEY[dimension];
  const limit = limits[d.limitKey];
  return limit > 0 ? measure[d.measureKey] / limit : 0;
}

// ── Deterministic sample payloads (analyzer presets; no Math.random) ─────────

export interface SamplePayload { id: string; label: string; description: string; build: () => string }

const DOMAINS = ['acme.io', 'northwind.com', 'globex.co', 'initech.dev', 'umbrella.org', 'hooli.xyz'];
const FIRST = ['Priya', 'Arjun', 'Meera', 'Rohan', 'Anika', 'Kabir', 'Zoë', 'José', 'Søren', 'Nadia'];

function email(i: number): string { return `${FIRST[i % FIRST.length].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${i}@${DOMAINS[i % DOMAINS.length]}`; }

export const SAMPLE_PAYLOADS: readonly SamplePayload[] = [
  {
    id: 'batch-200', label: 'Batch of 200 emails', description: 'A healthy /v1/batch/enrich body — fits every tier.',
    build: () => JSON.stringify({ inputs: Array.from({ length: 200 }, (_, i) => ({ email: email(i) })), fields: ['phone', 'company'] }, null, 0),
  },
  {
    id: 'batch-1200', label: 'Batch of 1,200 emails', description: 'Over the Starter array limit (500) — the fix names the chunking plan.',
    build: () => JSON.stringify({ inputs: Array.from({ length: 1200 }, (_, i) => ({ email: email(i) })) }, null, 0),
  },
  {
    id: 'deep-40', label: 'Nested 40 levels deep', description: 'A webhook echo wrapped 40 times — over every tier’s depth ceiling.',
    build: () => { let v: unknown = { email: email(1) }; for (let i = 0; i < 39; i++) v = { wrapper: v }; return JSON.stringify(v); },
  },
  {
    id: 'notes-300kb', label: 'Oversized notes field (~300 KB)', description: 'One 300 KB free-text string — over Starter’s body and string limits.',
    build: () => JSON.stringify({ email: email(2), notes: 'Discovery call summary. '.repeat(13_000) }),
  },
  {
    id: 'unicode', label: 'Unicode-heavy names', description: 'Shows why bytes ≠ characters: emoji and accented names weigh 2–4 bytes each.',
    build: () => JSON.stringify({ inputs: Array.from({ length: 50 }, (_, i) => ({ full_name: `${FIRST[i % FIRST.length]} 🚀 Ünïcödé ${i}`, company_domain: DOMAINS[i % DOMAINS.length] })) }),
  },
];

// ── Persisted org overrides (own key, not the tenant store) ──────────────────

/**
 * The gateway is the writer of record for overrides (`PATCH /v1/limits/payload` is a
 * first-class admin API, usable from the Explorer or CLI), so the console keeps a
 * per-org *cache*: `adopt` what GET returns on load, then mirror each console edit
 * with a PATCH. Keyed by org handle so switching tenants never leaks one org's
 * overrides onto another.
 */
export interface PayloadLimitsState {
  byOrg: Record<string, PayloadOverrides>;
  /** Replace the cached overrides for an org with what the gateway reports. */
  adopt: (orgId: string, overrides: PayloadOverrides) => void;
  /** Set (or clear with `null`) one limit override. Clamping happens in `resolveLimits`. */
  setLimit: (orgId: string, key: keyof PayloadLimits, value: number | null) => void;
  reset: (orgId: string) => void;
}

export const usePayloadLimits = create<PayloadLimitsState>()(
  persist(
    (set) => ({
      byOrg: {},
      adopt: (orgId, overrides) => set((s) => ({ byOrg: { ...s.byOrg, [orgId]: { ...overrides } } })),
      setLimit: (orgId, key, value) => set((s) => {
        const next = { ...(s.byOrg[orgId] ?? {}) };
        if (value === null) delete next[key]; else next[key] = Math.round(value);
        return { byOrg: { ...s.byOrg, [orgId]: next } };
      }),
      reset: (orgId) => set((s) => ({ byOrg: { ...s.byOrg, [orgId]: {} } })),
    }),
    { name: 'zinbit-payload-limits', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Read one org's cached overrides (empty when unknown). */
export function overridesForOrg(state: Pick<PayloadLimitsState, 'byOrg'>, orgId: string): PayloadOverrides {
  return state.byOrg[orgId] ?? {};
}
