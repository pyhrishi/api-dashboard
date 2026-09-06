/**
 * Tier-based throughput (F-131) — higher sustained RPS on higher plans (SSOT).
 *
 * The token-bucket limiter (F-129) used one flat capacity for every key. This adds
 * a per-plan throughput ladder: a key's plan tier sets both its burst capacity and
 * its steady refill rate, so Growth and Enterprise keys sustain more requests/second
 * than Starter. The gateway limiter resolves a key's tier from here and sizes its
 * bucket accordingly; because F-130's RateLimit-Limit reports the bucket capacity,
 * the standard headers automatically advertise the tier's ceiling — no extra plumbing.
 *
 * Edge-safe (pure, deterministic — no Node deps, no Math.random), so the Edge limiter
 * and the console read the exact same numbers. The Starter tier reuses the F-129
 * RATE_LIMIT baseline, so the flat behaviour is preserved for Starter keys.
 */

import { RATE_LIMIT } from '@/lib/rate-limit';

export type ThroughputTier = 'Starter' | 'Growth' | 'Enterprise';

export interface TierLimit {
  tier: ThroughputTier;
  /** Burst capacity — tokens available instantly from a full bucket. */
  capacity: number;
  /** Steady-state refill (tokens per minute) = sustained throughput ceiling. */
  refillPerMinute: number;
  /** Sustained requests/second (refillPerMinute / 60). */
  sustainedRps: number;
  description: string;
}

export const TIER_ORDER: ThroughputTier[] = ['Starter', 'Growth', 'Enterprise'];

export const TIER_LIMITS: Record<ThroughputTier, TierLimit> = {
  // Starter reuses the F-129 baseline so existing flat behaviour is unchanged.
  Starter: { tier: 'Starter', capacity: RATE_LIMIT.capacity, refillPerMinute: RATE_LIMIT.refillPerMinute, sustainedRps: Math.round((RATE_LIMIT.refillPerMinute / 60) * 100) / 100, description: 'Entry plan — burst up to the base capacity, modest sustained rate.' },
  Growth: { tier: 'Growth', capacity: 300, refillPerMinute: 300, sustainedRps: 5, description: '3× the burst and sustained throughput of Starter, for scaling teams.' },
  Enterprise: { tier: 'Enterprise', capacity: 1200, refillPerMinute: 1200, sustainedRps: 20, description: '12× Starter — high sustained throughput for large-scale ingestion.' },
};

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Resolve a key's throughput tier — deterministic from the key (billing.ts isn't
 * Edge-safe, so the Edge limiter derives it here). Sandbox keys (`sk_test_`) are
 * always Starter (the dev baseline); live keys map by a stable hash across the
 * ladder, weighted toward Starter. Same key → same tier, in the limiter and the
 * console. (In production this would come from the authenticated plan; here it's a
 * deterministic, coherent stand-in.)
 */
export function tierForKey(apiKey: string): ThroughputTier {
  if (!apiKey || apiKey.startsWith('sk_test_')) return 'Starter';
  const bucket = fnv(apiKey) % 10;
  if (bucket < 6) return 'Starter';   // 0–5
  if (bucket < 9) return 'Growth';    // 6–8
  return 'Enterprise';                // 9
}

/** The bucket sizing for a key (capacity + refill), by its resolved tier. */
export function tierLimitForKey(apiKey: string): TierLimit {
  return TIER_LIMITS[tierForKey(apiKey)];
}

/** The next tier up (for an upgrade CTA), or null at the top. */
export function nextTier(tier: ThroughputTier): ThroughputTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}
