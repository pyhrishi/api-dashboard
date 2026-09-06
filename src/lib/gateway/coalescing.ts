/**
 * Request coalescing (F-068) — single-flight for identical concurrent lookups.
 *
 * When several identical GET requests are in flight at the same moment (a cache
 * stampede, a fan-out from many workers, a retry storm), only the FIRST needs to
 * do the real work. The rest "coalesce" onto that in-flight request and share its
 * single result — one upstream call, one unit of work, and the followers ride free
 * (not re-billed, not re-computed). It's the concurrency-time complement to the
 * edge cache (which dedupes *completed* work): coalescing dedupes work that is
 * still *happening*.
 *
 * This is a real single-flight implementation: `coalesceRequest` registers an
 * in-flight promise synchronously, so any identical request that arrives before it
 * settles attaches to the same promise. The `/v1/coalescing` drill fires N truly
 * concurrent calls to prove the wave collapses to one upstream call.
 *
 * In-memory, per-isolate, per-API-key — like the other gateway registries. Seeded
 * at import so the console reads as continuous. No `Math.random`.
 */

import { sha256Hex } from '@/lib/sha256';

export type CoalesceRole = 'leader' | 'follower';

export interface CoalesceResult<T> {
  result: T;
  /** 'leader' did the work; 'follower' shared the leader's in-flight result. */
  role: CoalesceRole;
  /** True for a follower that coalesced onto an in-flight request. */
  coalesced: boolean;
  /** Total requests that shared this wave (leader + followers). */
  waveSize: number;
}

export interface WaveRecord {
  path: string;
  /** leader + followers. */
  waveSize: number;
  /** Always 1 — the whole point. */
  upstreamCalls: number;
  /** waveSize − 1. */
  coalesced: number;
  creditsSaved: number;
  at: number;
}

export interface CoalescingStats {
  /** Requests that coalesced onto an in-flight leader (cumulative). */
  coalescedRequests: number;
  /** Upstream calls avoided (= coalescedRequests). */
  upstreamCallsSaved: number;
  creditsSaved: number;
  /** Distinct waves that had at least one follower. */
  wavesTotal: number;
  largestWave: number;
  /** Mean size of a coalesced wave. */
  avgWaveSize: number;
  /** In-flight waves right now. */
  inFlightNow: number;
  recent: WaveRecord[];
}

interface InFlight {
  promise: Promise<unknown>;
  waveSize: number;
  startedAt: number;
  path: string;
  creditCost: number;
}

const inFlight = new Map<string, InFlight>();
const recentWaves: WaveRecord[] = [];
let coalescedRequests = 0;
let upstreamCallsSaved = 0;
let creditsSaved = 0;
let wavesTotal = 0;
let largestWave = 0;

const RECENT_CAP = 20;
const composite = (apiKey: string, fingerprint: string) => `${apiKey}::${fingerprint}`;

/** Stable fingerprint of a read request — same method + path + params ⇒ same hash. */
export function fingerprintRequest(method: string, path: string, params: Record<string, unknown> = {}): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`).join('&');
  return sha256Hex(`${method.toUpperCase()} ${path}?${sorted}`);
}

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  // Realistic completed waves so the console isn't empty on first load.
  const sample: Array<{ path: string; waveSize: number; creditCost: number; agoMs: number }> = [
    { path: '/v1/companies/enrich', waveSize: 14, creditCost: 1, agoMs: 45_000 },
    { path: '/v1/people/search', waveSize: 6, creditCost: 2, agoMs: 4 * 60_000 },
    { path: '/v1/companies/technographics', waveSize: 9, creditCost: 1, agoMs: 11 * 60_000 },
    { path: '/v1/ip/to-company', waveSize: 22, creditCost: 1, agoMs: 26 * 60_000 },
  ];
  sample.forEach((s) => {
    const coalesced = s.waveSize - 1;
    recordWave({ path: s.path, waveSize: s.waveSize, upstreamCalls: 1, coalesced, creditsSaved: coalesced * s.creditCost, at: now - s.agoMs });
    coalescedRequests += coalesced;
    upstreamCallsSaved += coalesced;
    creditsSaved += coalesced * s.creditCost;
  });
}

function recordWave(w: WaveRecord): void {
  if (w.waveSize < 2) return; // only waves that actually coalesced are interesting
  wavesTotal += 1;
  if (w.waveSize > largestWave) largestWave = w.waveSize;
  recentWaves.unshift(w);
  if (recentWaves.length > RECENT_CAP) recentWaves.length = RECENT_CAP;
}

function finalize(key: string, entry: InFlight): void {
  inFlight.delete(key);
  recordWave({
    path: entry.path,
    waveSize: entry.waveSize,
    upstreamCalls: 1,
    coalesced: entry.waveSize - 1,
    creditsSaved: (entry.waveSize - 1) * entry.creditCost,
    at: Date.now(),
  });
}

/**
 * Run `work` under single-flight. If an identical request (same apiKey +
 * fingerprint) is already in flight, share its result instead of running again.
 * The leader registers its in-flight promise synchronously, so concurrent callers
 * in the same tick coalesce onto it.
 */
export function coalesceRequest<T>(
  apiKey: string,
  path: string,
  fingerprint: string,
  creditCost: number,
  work: () => Promise<T>,
): Promise<CoalesceResult<T>> {
  ensureSeed();
  const key = composite(apiKey, fingerprint);
  const existing = inFlight.get(key);
  if (existing) {
    existing.waveSize += 1;
    coalescedRequests += 1;
    upstreamCallsSaved += 1;
    creditsSaved += creditCost;
    return existing.promise.then((result) => ({
      result: result as T,
      role: 'follower' as const,
      coalesced: true,
      waveSize: existing.waveSize,
    }));
  }

  const entry: InFlight = { promise: Promise.resolve(), waveSize: 1, startedAt: Date.now(), path, creditCost };
  const p = Promise.resolve().then(() => work());
  entry.promise = p;
  inFlight.set(key, entry); // synchronous ⇒ same-tick callers see it and coalesce
  return p.then(
    (result) => { finalize(key, entry); return { result, role: 'leader' as const, coalesced: false, waveSize: entry.waveSize }; },
    (err) => { finalize(key, entry); throw err; },
  );
}

export interface DrillResult {
  path: string;
  concurrency: number;
  waveSize: number;
  upstreamCalls: number;
  coalesced: number;
  creditsSaved: number;
  latencyMs: number;
}

/**
 * Fire `concurrency` truly-concurrent identical requests to demonstrate the wave
 * collapsing to a single upstream call. Deterministic outcome (1 upstream call,
 * concurrency−1 coalesced); the small latency guarantees the calls overlap.
 */
export async function runCoalescingDrill(
  apiKey: string,
  path: string,
  concurrency: number,
  creditCost: number,
  latencyMs = 45,
): Promise<DrillResult> {
  const n = Math.max(2, Math.min(64, Math.floor(concurrency) || 2));
  // A unique fingerprint per drill so it forms its own fresh wave.
  const fp = fingerprintRequest('GET', path, { drill: `${Date.now()}` });
  const work = () => new Promise<{ drilled: true; path: string }>((r) => setTimeout(() => r({ drilled: true, path }), latencyMs));
  const start = Date.now();
  const calls = Array.from({ length: n }, () => coalesceRequest(apiKey, path, fp, creditCost, work));
  const results = await Promise.all(calls);
  const upstreamCalls = results.filter((r) => r.role === 'leader').length;
  const coalesced = results.filter((r) => r.role === 'follower').length;
  return {
    path,
    concurrency: n,
    waveSize: n,
    upstreamCalls,
    coalesced,
    creditsSaved: coalesced * creditCost,
    latencyMs: Date.now() - start,
  };
}

/** A snapshot for the stats endpoint + console view. */
export function getCoalescingStats(): CoalescingStats {
  ensureSeed();
  const avgWaveSize = wavesTotal === 0 ? 0
    : Math.round((recentWaves.reduce((s, w) => s + w.waveSize, 0) / Math.min(wavesTotal, recentWaves.length)) * 10) / 10;
  return {
    coalescedRequests,
    upstreamCallsSaved,
    creditsSaved,
    wavesTotal,
    largestWave,
    avgWaveSize,
    inFlightNow: inFlight.size,
    recent: recentWaves.slice(0, RECENT_CAP),
  };
}

/** Reset all state — test-only. */
export function __resetCoalescing(): void {
  inFlight.clear();
  recentWaves.length = 0;
  coalescedRequests = 0;
  upstreamCallsSaved = 0;
  creditsSaved = 0;
  wavesTotal = 0;
  largestWave = 0;
  seeded = false;
}
