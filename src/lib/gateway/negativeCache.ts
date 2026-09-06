/**
 * Negative-match caching — remember misses so repeat unresolved lookups are free.
 *
 * The positive edge cache (`cache.ts`) speeds up repeat *hits*, but the metered
 * billing engine charges before it, so a repeated *miss* still costs credits.
 * This module records genuine coverage misses (an identifier that resolved to no
 * match) keyed by path+params; the gateway consults it BEFORE billing, so an
 * identical repeat is served from the negative cache at zero credits.
 *
 * In-memory, per-process (like `cache.ts`), with a short TTL — a miss can turn
 * into a hit as the dataset grows, so negatives must expire.
 */

export const NEGATIVE_TTL_SECONDS = 300; // 5 minutes — misses expire so new data can resolve

interface NegativeEntry {
  payload: unknown;
  status: number;
  expiresAt: number;
  hits: number;
  creditsSaved: number;
  firstSeen: number;
}

const store = new Map<string, NegativeEntry>();

const stats = {
  recorded: 0, // total misses recorded
  servedHits: 0, // total repeat lookups served from the negative cache
  creditsSaved: 0, // total credits not charged thanks to the cache
};

/** Drop expired entries (called on each access — cheap for a small map). */
function evictExpired(now: number): void {
  store.forEach((entry, key) => {
    if (entry.expiresAt <= now) store.delete(key);
  });
}

export interface NegativeLookup {
  hit: boolean;
  payload?: unknown;
  status?: number;
}

/** Is this exact lookup a known, unexpired miss? Pure read (no accounting). */
export function checkNegativeCache(key: string, now: number = Date.now()): NegativeLookup {
  const entry = store.get(key);
  if (!entry) return { hit: false };
  if (entry.expiresAt <= now) {
    store.delete(key);
    return { hit: false };
  }
  return { hit: true, payload: entry.payload, status: entry.status };
}

/** Record a coverage miss so the identical repeat lookup is free. */
export function recordNegativeMiss(
  key: string,
  payload: unknown,
  status: number,
  ttlSeconds: number = NEGATIVE_TTL_SECONDS,
  now: number = Date.now(),
): void {
  if (store.has(key)) return; // keep the original firstSeen/accounting
  store.set(key, { payload, status, expiresAt: now + ttlSeconds * 1000, hits: 0, creditsSaved: 0, firstSeen: now });
  stats.recorded += 1;
}

/** Account for a repeat lookup served from the negative cache (credits not charged). */
export function registerNegativeHit(key: string, creditsSaved: number): void {
  const entry = store.get(key);
  if (entry) {
    entry.hits += 1;
    entry.creditsSaved += creditsSaved;
  }
  stats.servedHits += 1;
  stats.creditsSaved += creditsSaved;
}

export interface NegativeCacheStats {
  active_entries: number;
  total_misses_recorded: number;
  cache_hits_served: number;
  credits_saved: number;
  hit_rate: number; // hits / (hits + recorded), 0..1
  ttl_seconds: number;
  top_entries: { key: string; hits: number; credits_saved: number; expires_in_seconds: number }[];
}

/** A snapshot of negative-cache effectiveness for the stats endpoint. */
export function getNegativeCacheStats(now: number = Date.now()): NegativeCacheStats {
  evictExpired(now);
  const denom = stats.servedHits + stats.recorded;
  const top = Array.from(store.entries())
    .map(([key, e]) => ({ key, hits: e.hits, credits_saved: e.creditsSaved, expires_in_seconds: Math.max(0, Math.round((e.expiresAt - now) / 1000)) }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10);
  return {
    active_entries: store.size,
    total_misses_recorded: stats.recorded,
    cache_hits_served: stats.servedHits,
    credits_saved: stats.creditsSaved,
    hit_rate: denom === 0 ? 0 : Math.round((stats.servedHits / denom) * 1000) / 1000,
    ttl_seconds: NEGATIVE_TTL_SECONDS,
    top_entries: top,
  };
}

/** Reset all state — test-only. */
export function __resetNegativeCache(): void {
  store.clear();
  stats.recorded = 0;
  stats.servedHits = 0;
  stats.creditsSaved = 0;
}
