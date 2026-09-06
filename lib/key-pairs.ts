/**
 * Test & live key pairs (F-112) — the pairing model (SSOT).
 *
 * A key pair is one logical API credential with two secrets: a sandbox key
 * (sk_test_…) for building and a live key (sk_live_…) for production, sharing a
 * name, scopes, and a `pairId`. This mirrors the Stripe model — you build
 * against test, flip to live to ship — and gives the pair a linked lifecycle:
 * generate both at once, revoke both together. Unpaired keys (created on the
 * standalone Keys page) are untouched.
 *
 * Pure derivation over the store's `activeKeys`; the store owns generation +
 * mutation. Secret strings are random (a credential, not scrutinized logic).
 */

import type { MockKey } from '@/lib/store';

export type PairCompleteness = 'complete' | 'test_only' | 'live_only';

export interface KeyPair {
  pairId: string;
  name: string;
  scopes: string[];
  test: MockKey | null;
  live: MockKey | null;
  createdAt: string;
  completeness: PairCompleteness;
  /** True when either side is revoked/compromised/expired. */
  degraded: boolean;
}

const ACTIVE = new Set(['active', 'expiring_soon']);

/** Group the keys that belong to a pair (share a `pairId`) into KeyPairs, newest first. */
export function deriveKeyPairs(keys: MockKey[]): KeyPair[] {
  const byPair = new Map<string, MockKey[]>();
  for (const k of keys) {
    if (!k.pairId) continue;
    const arr = byPair.get(k.pairId) ?? [];
    arr.push(k);
    byPair.set(k.pairId, arr);
  }
  const pairs: KeyPair[] = [];
  byPair.forEach((members, pairId) => {
    const test = members.find((k) => k.environment === 'sandbox') ?? null;
    const live = members.find((k) => k.environment === 'live') ?? null;
    const anchor = test ?? live!;
    const completeness: PairCompleteness = test && live ? 'complete' : test ? 'test_only' : 'live_only';
    const degraded = members.some((k) => !ACTIVE.has(k.status));
    pairs.push({
      pairId,
      name: anchor.name,
      scopes: anchor.scopes,
      test,
      live,
      createdAt: anchor.createdAt,
      completeness,
      degraded,
    });
  });
  return pairs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Keys that are NOT part of a pair — the standalone keys the Keys page manages. */
export function unpairedKeys(keys: MockKey[]): MockKey[] {
  return keys.filter((k) => !k.pairId);
}

/** A fresh pair id. */
export function makePairId(): string {
  return `pair_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a secret for one side of a pair. */
export function generatePairSecret(environment: 'sandbox' | 'live'): string {
  const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
  return `${prefix}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Build the two MockKeys for a new pair (the store assigns them into activeKeys). */
export function buildKeyPair(name: string, scopes: string[]): { pairId: string; test: MockKey; live: MockKey } {
  const pairId = makePairId();
  const createdAt = new Date().toISOString();
  const side = (environment: 'sandbox' | 'live'): MockKey => {
    const secret = generatePairSecret(environment);
    return {
      id: `key_${Math.random().toString(36).slice(2, 9)}`,
      name,
      key: secret,
      rawToken: secret,
      scopes: [...scopes],
      createdAt,
      lastUsed: null,
      status: 'active',
      environment,
      pairId,
    };
  };
  return { pairId, test: side('sandbox'), live: side('live') };
}

export const completenessLabel = (c: PairCompleteness): string =>
  c === 'complete' ? 'Test + Live' : c === 'test_only' ? 'Test only' : 'Live only';
