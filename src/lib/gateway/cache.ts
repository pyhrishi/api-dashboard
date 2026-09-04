/**
 * Gateway Edge Cache
 * Simulates a global edge cache (like Cloudflare or Vercel Edge Cache) for static payloads.
 */

interface CacheEntry {
  payload: unknown;
  expiresAt: number;
}

// In-memory cache store
const cacheStore = new Map<string, CacheEntry>();

export interface CacheResult {
  hit: boolean;
  payload?: unknown;
  isStale?: boolean;
}

/**
 * Generate a deterministic cache key from endpoint path and parameters.
 */
export function generateCacheKey(path: string, parameters: Record<string, unknown>): string {
  // Sort parameters to ensure {a: 1, b: 2} matches {b: 2, a: 1}
  const sortedParams = Object.keys(parameters)
    .sort()
    .reduce((acc, key) => {
      acc[key] = parameters[key];
      return acc;
    }, {} as Record<string, unknown>);

  return `${path}::${JSON.stringify(sortedParams)}`;
}

/**
 * Check if a response exists in the edge cache.
 * @param allowStale If true, will return expired cache entries to serve as fallbacks during outages.
 */
export function checkCache(cacheKey: string, allowStale: boolean = false): CacheResult {
  const entry = cacheStore.get(cacheKey);

  if (!entry) {
    return { hit: false };
  }

  const isExpired = Date.now() > entry.expiresAt;

  if (isExpired) {
    if (allowStale) {
      return { hit: true, payload: entry.payload, isStale: true };
    }
    // We don't delete immediately so it can be used for stale-on-error later
    return { hit: false };
  }

  return { hit: true, payload: entry.payload, isStale: false };
}

/**
 * Save a response payload to the edge cache.
 */
export function setCache(cacheKey: string, payload: unknown, ttlSeconds: number = 60): void {
  cacheStore.set(cacheKey, {
    payload,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

// Store for idempotency keys
const idempotencyStore = new Map<string, CacheEntry>();

/**
 * Check if an idempotency key has been used (within 24h).
 */
export function checkIdempotency(apiKey: string, idempotencyKey: string): CacheResult {
  const key = `${apiKey}::${idempotencyKey}`;
  const entry = idempotencyStore.get(key);

  if (!entry) {
    return { hit: false };
  }

  if (Date.now() > entry.expiresAt) {
    idempotencyStore.delete(key);
    return { hit: false };
  }

  return { hit: true, payload: entry.payload };
}

/**
 * Store the result against an idempotency key for 24h.
 */
export function setIdempotency(apiKey: string, idempotencyKey: string, payload: unknown): void {
  const key = `${apiKey}::${idempotencyKey}`;
  idempotencyStore.set(key, {
    payload,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
  });
}
