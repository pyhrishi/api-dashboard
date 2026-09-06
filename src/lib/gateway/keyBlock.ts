/**
 * Compromised-key kill switch (F-119) — the gateway block registry, enforced everywhere.
 *
 * Revoking a key in the console used to be cosmetic — the gateway happily kept
 * serving it. This registry makes the kill switch real: a blocked key is rejected
 * with 401 KEY_REVOKED on every surface that shares it — the REST pipeline, the
 * GraphQL gateway, and the gRPC channel — so a leaked key is dead the instant it's
 * killed, everywhere at once. The console syncs a block on revoke / leak-simulation
 * (POST /v1/keys/revoke); restoring lifts it (for a false alarm).
 *
 * In-memory, per-isolate, seeded (the demo `sk_test_compromised` is blocked out of
 * the box). Deterministic — no Math.random.
 */

export type RevocationReason = 'compromised' | 'leaked' | 'rotated' | 'manual';

export const REVOCATION_REASONS: { id: RevocationReason; label: string; description: string }[] = [
  { id: 'compromised', label: 'Compromised', description: 'Key confirmed in the hands of an unauthorized party.' },
  { id: 'leaked', label: 'Leaked', description: 'Key found exposed (git, logs, client bundle, paste).' },
  { id: 'rotated', label: 'Rotated out', description: 'Superseded by a rolled key; retire the old one.' },
  { id: 'manual', label: 'Manual', description: 'Precautionary kill by an operator.' },
];

export interface BlockRecord {
  reason: RevocationReason;
  blockedAt: number;
  /** Who/what triggered the kill (for the audit view). */
  by: string;
  /** Blocked calls rejected for this key since it was killed. */
  blockedAttempts: number;
}

interface BlockEvent {
  key: string;
  reason: RevocationReason;
  by: string;
  at: number;
  action: 'killed' | 'restored';
}

const blocks = new Map<string, BlockRecord>();
const events: BlockEvent[] = [];
let totalBlockedAttempts = 0;
const EVENTS_CAP = 30;

function maskKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
}

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  // The demo compromised key is dead out of the box (matches the billing seed).
  blocks.set('sk_test_compromised', { reason: 'compromised', blockedAt: now - 26 * 3600_000, by: 'security@zintlr.com', blockedAttempts: 4 });
  totalBlockedAttempts += 4;
  events.push({ key: maskKey('sk_test_compromised'), reason: 'compromised', by: 'security@zintlr.com', at: now - 26 * 3600_000, action: 'killed' });
}

/** Block (kill) a key. Idempotent — re-killing refreshes the reason/timestamp. */
export function blockKey(key: string, reason: RevocationReason = 'manual', by = 'console'): void {
  ensureSeed();
  if (!key) return;
  blocks.set(key, { reason, blockedAt: Date.now(), by, blockedAttempts: blocks.get(key)?.blockedAttempts ?? 0 });
  events.unshift({ key: maskKey(key), reason, by, at: Date.now(), action: 'killed' });
  if (events.length > EVENTS_CAP) events.length = EVENTS_CAP;
}

/** Restore (un-kill) a key — a false alarm. */
export function unblockKey(key: string, by = 'console'): void {
  ensureSeed();
  const rec = blocks.get(key);
  if (!rec) return;
  blocks.delete(key);
  events.unshift({ key: maskKey(key), reason: rec.reason, by, at: Date.now(), action: 'restored' });
  if (events.length > EVENTS_CAP) events.length = EVENTS_CAP;
}

/** True when a key is killed. Records a blocked attempt (call it at enforcement points). */
export function isKeyBlocked(key: string): boolean {
  ensureSeed();
  const rec = blocks.get(key);
  if (!rec) return false;
  rec.blockedAttempts += 1;
  totalBlockedAttempts += 1;
  return true;
}

/** The block record for a key (no side effects), or null. */
export function getBlock(key: string): BlockRecord | null {
  ensureSeed();
  return blocks.get(key) ?? null;
}

export interface BlockedKeyView {
  key: string;
  reason: RevocationReason;
  blockedAt: number;
  by: string;
  blockedAttempts: number;
}
export interface KillSwitchSnapshot {
  blockedKeys: number;
  totalBlockedAttempts: number;
  keys: BlockedKeyView[];
  recentEvents: { key: string; reason: RevocationReason; by: string; at: number; action: 'killed' | 'restored' }[];
}

/** A snapshot for GET /v1/keys/revoke + the console. */
export function getKillSwitchSnapshot(): KillSwitchSnapshot {
  ensureSeed();
  const keys: BlockedKeyView[] = [];
  blocks.forEach((rec, key) => {
    keys.push({ key: maskKey(key), reason: rec.reason, blockedAt: rec.blockedAt, by: rec.by, blockedAttempts: rec.blockedAttempts });
  });
  keys.sort((a, b) => b.blockedAt - a.blockedAt);
  return {
    blockedKeys: keys.length,
    totalBlockedAttempts,
    keys,
    recentEvents: events.slice(0, EVENTS_CAP),
  };
}

/** Reset all state — test-only. */
export function __resetKeyBlock(): void {
  blocks.clear();
  events.length = 0;
  totalBlockedAttempts = 0;
  seeded = false;
}
