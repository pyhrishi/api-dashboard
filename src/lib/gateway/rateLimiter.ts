/**
 * Gateway Rate Limiter
 * Simple in-memory rate limiter for Edge environments.
 * 
 * Note: In production, this would use Redis (e.g., Upstash).
 * For this sandbox, we use a basic Map. In a true serverless edge environment,
 * this Map may reset per-isolate, but it's sufficient for sandbox testing.
 */

import { tierLimitForKey, type ThroughputTier } from '@/lib/throughput-tiers';
import { hashApiKey, type RegistryDescriptor } from '@/lib/key-hashing';

interface RateLimitData {
  tokens: number;
  lastRefillTime: number;
}

// Buckets are keyed by the SHA-256 digest of the key (F-321) — the Edge isolate
// never holds a plaintext key at rest. The SSOT digest is pure JS, so it runs here.
const store = new Map<string, RateLimitData>();

/** For the key-hashing audit: what this registry holds and how it is keyed. */
export function rateLimitStorageDescriptor(): RegistryDescriptor {
  return { id: 'rate-limiter', label: 'Rate-limit buckets', holds: 'token count + last refill per key', keyedBy: 'sha256', entries: store.size, runtime: 'edge' };
}

/** True when a bucket exists for this digest. */
export function hasRateBucketFor(hash: string): boolean {
  return store.has(hash);
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  /** The plan tier that sized this bucket (F-131). */
  tier: ThroughputTier;
}

export function checkRateLimit(apiKey: string): RateLimitResult {
  const now = Date.now();

  // Tier-based throughput (F-131): the key's plan tier sizes its bucket — burst
  // capacity + steady refill — so higher plans sustain more RPS. Starter reuses the
  // F-129 baseline. lib/throughput-tiers.ts is the shared SSOT (Edge-safe).
  const tierLimit = tierLimitForKey(apiKey);
  const tier = tierLimit.tier;
  const capacity = tierLimit.capacity; // Maximum burst capacity for this tier
  const refillRatePerMinute = tierLimit.refillPerMinute;
  const refillRatePerMs = refillRatePerMinute / 60000;

  const bucketId = hashApiKey(apiKey);
  let currentData = store.get(bucketId);

  if (!currentData) {
    // Initial request: bucket is full
    currentData = {
      tokens: capacity,
      lastRefillTime: now,
    };
  } else {
    // Refill bucket based on time passed
    const timePassed = now - currentData.lastRefillTime;
    const tokensToAdd = timePassed * refillRatePerMs;
    currentData.tokens = Math.min(capacity, currentData.tokens + tokensToAdd);
    currentData.lastRefillTime = now;
  }

  // Calculate time until next token (if bucket is empty) or time until full (if bucket not full)
  // Since we don't have a fixed window, we'll use the time until the bucket is completely full for 'reset'
  // to somewhat comply with standard rate limit headers, or time until 1 token is available.
  const msUntilFull = (capacity - currentData.tokens) / refillRatePerMs;
  const resetTimestamp = Math.floor((now + msUntilFull) / 1000);

  if (currentData.tokens >= 1) {
    // Consume a token
    currentData.tokens -= 1;
    store.set(bucketId, currentData);

    return {
      success: true,
      limit: capacity,
      remaining: Math.floor(currentData.tokens),
      reset: resetTimestamp,
      tier,
    };
  } else {
    // Rate limited
    store.set(bucketId, currentData); // Update lastRefillTime but don't consume

    // If rate limited, 'reset' is time until we get at least 1 token
    const msUntilNextToken = (1 - currentData.tokens) / refillRatePerMs;
    const nextTokenTimestamp = Math.floor((now + msUntilNextToken) / 1000);

    return {
      success: false,
      limit: capacity,
      remaining: 0,
      reset: nextTokenTimestamp,
      tier,
    };
  }
}
