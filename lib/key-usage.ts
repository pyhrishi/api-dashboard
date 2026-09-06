/**
 * Last-used & usage per key (F-118) — per-key usage + hygiene model (SSOT).
 *
 * Turns the raw per-key fields the console already tracks (`lastUsed`, `usage`)
 * into an operator view: a freshness status for each key, a usage timeline, and
 * security-hygiene insights (idle live keys to rotate, never-used keys to
 * revoke). Deterministic — the timeline is FNV-1a-seeded from the key id, so it
 * reproduces and never jitters on re-render; freshness is derived from
 * `lastUsed` against a caller-supplied `now`.
 *
 * Pure derivation over the store's `activeKeys`; no store slice, no API change.
 */

import type { MockKey } from '@/lib/store';

/** Freshness of a key, from how long ago it was last exercised. */
export type KeyFreshness = 'active' | 'idle' | 'dormant' | 'stale' | 'never';

export interface KeyUsage {
  key: MockKey;
  freshness: KeyFreshness;
  /** Days since last use; null when never used. */
  daysSinceUse: number | null;
  totalRequests: number;
  /** A 14-day usage sparkline (oldest → newest), deterministic. */
  timeline: number[];
}

export type InsightSeverity = 'high' | 'medium' | 'low';
export interface UsageInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  keyId: string;
  /** A suggested remediation verb. */
  action: 'rotate' | 'revoke' | 'review';
}

export interface KeyUsageSummary {
  totalRequests: number;
  activeKeys: number;
  idleOrDormant: number;
  neverUsed: number;
  /** The single busiest key by total requests, or null. */
  busiest: MockKey | null;
}

const DAY = 86_400_000;
const TIMELINE_DAYS = 14;

const ACTIVE = new Set(['active', 'expiring_soon']);

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Days since a key was last used (null when never used). */
export function daysSinceUse(key: MockKey, now: number = Date.now()): number | null {
  if (!key.lastUsed) return null;
  return Math.max(0, Math.floor((now - Date.parse(key.lastUsed)) / DAY));
}

/** Freshness bucket from last-used age. */
export function keyFreshness(key: MockKey, now: number = Date.now()): KeyFreshness {
  const d = daysSinceUse(key, now);
  if (d === null) return 'never';
  const hours = (now - Date.parse(key.lastUsed!)) / 3_600_000;
  if (hours < 24) return 'active';
  if (d < 7) return 'idle';
  if (d < 30) return 'dormant';
  return 'stale';
}

/**
 * A deterministic 14-day usage sparkline for a key. The total `usage` is spread
 * across the window with a per-day seeded weight and a recency ramp (busier
 * lately), so the shape is stable and believable. A never-used key is flat zero.
 */
export function usageTimeline(key: MockKey): number[] {
  const total = key.usage ?? 0;
  if (total <= 0 || !key.lastUsed) return new Array(TIMELINE_DAYS).fill(0);
  const weights: number[] = [];
  let sum = 0;
  for (let d = 0; d < TIMELINE_DAYS; d++) {
    const base = (hash(`${key.id}:${d}`) % 60) + 20; // 20..79
    const recency = 1 + (d / (TIMELINE_DAYS - 1)) * 1.2; // newer days weighted up to ~2.2x
    const w = base * recency;
    weights.push(w);
    sum += w;
  }
  return weights.map((w) => Math.round((w / sum) * total));
}

/** Build the per-key usage view for a set of keys, busiest first. */
export function computeKeyUsage(keys: MockKey[], now: number = Date.now()): KeyUsage[] {
  return keys
    .map((key) => ({
      key,
      freshness: keyFreshness(key, now),
      daysSinceUse: daysSinceUse(key, now),
      totalRequests: key.usage ?? 0,
      timeline: usageTimeline(key),
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests);
}

/** Roll-up across keys. */
export function summarizeKeyUsage(keys: MockKey[], now: number = Date.now()): KeyUsageSummary {
  const live = keys.filter((k) => ACTIVE.has(k.status));
  const totalRequests = keys.reduce((n, k) => n + (k.usage ?? 0), 0);
  const activeKeys = live.filter((k) => keyFreshness(k, now) === 'active').length;
  const idleOrDormant = live.filter((k) => ['idle', 'dormant'].includes(keyFreshness(k, now))).length;
  const neverUsed = live.filter((k) => keyFreshness(k, now) === 'never').length;
  const busiest = keys.reduce<MockKey | null>((best, k) => (!best || (k.usage ?? 0) > (best.usage ?? 0) ? k : best), null);
  return { totalRequests, activeKeys, idleOrDormant, neverUsed, busiest: busiest && (busiest.usage ?? 0) > 0 ? busiest : null };
}

/**
 * Security-hygiene insights: which keys deserve attention. A live key that has
 * been unused for a long time is a standing liability; a never-used live key is
 * likely a mistake. Ordered most-severe first.
 */
export function usageInsights(keys: MockKey[], now: number = Date.now()): UsageInsight[] {
  const out: UsageInsight[] = [];
  for (const k of keys) {
    if (!ACTIVE.has(k.status)) continue;
    const fresh = keyFreshness(k, now);
    const d = daysSinceUse(k, now);
    if (fresh === 'stale') {
      out.push({
        id: `stale:${k.id}`, severity: k.environment === 'live' ? 'high' : 'medium',
        title: `"${k.name}" is stale`,
        detail: `Last used ${d}d ago${k.environment === 'live' ? ' — a live key idle this long should be rotated or revoked.' : ' — consider revoking if no longer needed.'}`,
        keyId: k.id, action: k.environment === 'live' ? 'rotate' : 'revoke',
      });
    } else if (fresh === 'never') {
      out.push({
        id: `never:${k.id}`, severity: k.environment === 'live' ? 'high' : 'low',
        title: `"${k.name}" has never been used`,
        detail: k.environment === 'live' ? 'A live key that has never authenticated a call is likely a mistake — revoke it.' : 'This sandbox key has never been used.',
        keyId: k.id, action: 'revoke',
      });
    } else if (fresh === 'dormant' && k.environment === 'live') {
      out.push({
        id: `dormant:${k.id}`, severity: 'medium',
        title: `"${k.name}" is going dormant`,
        detail: `No calls in ${d}d. Review whether this live key is still needed.`,
        keyId: k.id, action: 'review',
      });
    }
  }
  const rank: Record<InsightSeverity, number> = { high: 2, medium: 1, low: 0 };
  return out.sort((a, b) => rank[b.severity] - rank[a.severity]);
}

const FRESH_LABEL: Record<KeyFreshness, string> = {
  active: 'Active', idle: 'Idle', dormant: 'Dormant', stale: 'Stale', never: 'Never used',
};
export const freshnessLabel = (f: KeyFreshness): string => FRESH_LABEL[f];

/** Human "time ago" for a key's last use. */
export function relativeLastUsed(key: MockKey, now: number = Date.now()): string {
  if (!key.lastUsed) return 'never';
  const s = Math.max(0, Math.floor((now - Date.parse(key.lastUsed)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
