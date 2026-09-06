/**
 * Idempotency keys (F-061) — safe retries for writes.
 *
 * A client sends `Idempotency-Key: <uuid>` on a POST. The first time, the request
 * runs normally and its response is stored against `${apiKey}::${key}` for 24h.
 * Any retry with the same key replays that exact response — not re-processed, not
 * re-billed — so a dropped connection or a nervous retry can never double-charge
 * or duplicate a write. Reusing a key with a *different* request body is a client
 * bug, so it's rejected with a conflict rather than silently replaying stale data.
 *
 * This is the SSOT the gateway pipeline consults (it replaces the ad-hoc helpers
 * that lived in cache.ts). In-memory, per-process, per-API-key — like the other
 * gateway registries. Deterministic; no `Math.random`.
 */

import { sha256Hex } from '@/lib/sha256';

export interface IdempotencyRecord {
  /** The stored response payload replayed on a retry. */
  payload: unknown;
  /** HTTP status of the stored response. */
  status: number;
  /** Fingerprint of the original request (method + path + body) — guards against key reuse. */
  fingerprint: string;
  /** The endpoint path the key was used against (for the console view). */
  path: string;
  /** Credits the original request cost — each replay "saves" this much. */
  creditCost: number;
  storedAt: number;
  expiresAt: number;
  /** How many times this key has been replayed. */
  replayCount: number;
}

export type IdempotencyOutcome =
  | { status: 'miss' }
  | { status: 'replay'; payload: unknown; httpStatus: number; record: IdempotencyRecord }
  | { status: 'conflict'; record: IdempotencyRecord };

const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, IdempotencyRecord>();
let replaysServed = 0;
let creditsSaved = 0;

const composite = (apiKey: string, key: string) => `${apiKey}::${key}`;

/** Stable fingerprint of a request — same method + path + body → same hash. */
export function fingerprintRequest(method: string, path: string, body: unknown): string {
  let bodyStr = '';
  try {
    bodyStr = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  } catch {
    bodyStr = String(body);
  }
  return sha256Hex(`${method.toUpperCase()} ${path}\n${bodyStr}`);
}

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const sample: Array<{ key: string; path: string; creditCost: number; replayCount: number; agoMs: number }> = [
    { key: 'a1f3c8e2-7b44-4d19-9c2a-1e5f6a7b8c9d', path: '/v1/batch/companies/enrich', creditCost: 20, replayCount: 2, agoMs: 3 * 3600_000 },
    { key: 'b2e4d9f1-6a33-4c28-8d1b-2f6a7b8c9d0e', path: '/v1/batch/enrich', creditCost: 12, replayCount: 1, agoMs: 8 * 3600_000 },
    { key: 'c3f5e0a2-5b22-4b37-7e0c-3a7b8c9d0e1f', path: '/v1/people/search/ai', creditCost: 3, replayCount: 0, agoMs: 20 * 3600_000 },
  ];
  sample.forEach((s) => {
    const storedAt = now - s.agoMs;
    store.set(composite('seed', s.key), {
      payload: { seeded: true },
      status: 200,
      fingerprint: fingerprintRequest('POST', s.path, { seed: s.key }),
      path: s.path,
      creditCost: s.creditCost,
      storedAt,
      expiresAt: storedAt + TTL_MS,
      replayCount: s.replayCount,
    });
    replaysServed += s.replayCount;
    creditsSaved += s.replayCount * s.creditCost;
  });
}

/**
 * Look up an idempotency key. Returns `miss` (run it), `replay` (return the stored
 * response, no billing), or `conflict` (same key, different request — reject).
 * A replay increments the replay/credits-saved counters.
 */
export function checkIdempotency(apiKey: string, key: string, fingerprint: string): IdempotencyOutcome {
  ensureSeed();
  const id = composite(apiKey, key);
  const rec = store.get(id);
  if (!rec) return { status: 'miss' };
  if (Date.now() > rec.expiresAt) {
    store.delete(id);
    return { status: 'miss' };
  }
  if (rec.fingerprint !== fingerprint) return { status: 'conflict', record: rec };
  rec.replayCount += 1;
  replaysServed += 1;
  creditsSaved += rec.creditCost;
  return { status: 'replay', payload: rec.payload, httpStatus: rec.status, record: rec };
}

/** Store a fresh response against a key for 24h. */
export function storeIdempotency(
  apiKey: string,
  key: string,
  input: { payload: unknown; status: number; fingerprint: string; path: string; creditCost: number },
): IdempotencyRecord {
  ensureSeed();
  const now = Date.now();
  const rec: IdempotencyRecord = {
    payload: input.payload,
    status: input.status,
    fingerprint: input.fingerprint,
    path: input.path,
    creditCost: input.creditCost,
    storedAt: now,
    expiresAt: now + TTL_MS,
    replayCount: 0,
  };
  store.set(composite(apiKey, key), rec);
  return rec;
}

export interface IdempotencyKeyView {
  key: string;
  path: string;
  replayCount: number;
  creditCost: number;
  creditsSaved: number;
  storedAt: number;
  expiresAt: number;
  ttlRemainingMs: number;
}

export interface IdempotencyStats {
  activeKeys: number;
  replaysServed: number;
  creditsSaved: number;
  ttlHours: number;
  recent: IdempotencyKeyView[];
}

/** Mask a key for display: keep the first and last segment. */
function maskKey(compositeKey: string): string {
  const key = compositeKey.includes('::') ? compositeKey.slice(compositeKey.indexOf('::') + 2) : compositeKey;
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** A snapshot of the registry for the stats endpoint + console view. */
export function getIdempotencyStats(): IdempotencyStats {
  ensureSeed();
  const now = Date.now();
  const recent: IdempotencyKeyView[] = [];
  store.forEach((rec, id) => {
    if (now > rec.expiresAt) return;
    recent.push({
      key: maskKey(id),
      path: rec.path,
      replayCount: rec.replayCount,
      creditCost: rec.creditCost,
      creditsSaved: rec.replayCount * rec.creditCost,
      storedAt: rec.storedAt,
      expiresAt: rec.expiresAt,
      ttlRemainingMs: Math.max(0, rec.expiresAt - now),
    });
  });
  recent.sort((a, b) => b.storedAt - a.storedAt);
  return {
    activeKeys: recent.length,
    replaysServed,
    creditsSaved,
    ttlHours: 24,
    recent: recent.slice(0, 20),
  };
}

/** Reset all state — test-only. */
export function __resetIdempotency(): void {
  store.clear();
  replaysServed = 0;
  creditsSaved = 0;
  seeded = false;
}
