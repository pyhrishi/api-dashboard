/**
 * Bounce feedback loop — feed email bounces back to improve deliverability.
 *
 * When a customer's send hard-bounces, that's the strongest possible signal that
 * an address is dead. This module is the registry behind the loop: report a
 * bounce (`recordBounce`) and the address is suppressed, so a subsequent
 * deliverability check returns undeliverable with a "reported bounce" reason —
 * closing the loop between what the customer observes and what Zinbit returns.
 *
 * In-memory, per-process (like the other gateway caches). A small deterministic
 * seed makes the loop demoable immediately. Hard bounces and spam complaints
 * suppress; soft bounces suppress only after repeating.
 */

export type BounceType = 'hard' | 'soft' | 'complaint';

export interface BounceRecord {
  email: string;
  type: BounceType;
  reported_at: string;
  count: number;
}

const store = new Map<string, BounceRecord>();
let totalReports = 0;
const SEED_DATE = '2026-08-20';
const SOFT_SUPPRESS_AFTER = 3;

export function normalizeBounceEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const samples: { email: string; type: BounceType; count: number }[] = [
    { email: 'old.contact@acme.com', type: 'hard', count: 1 },
    { email: 'ceo@shutdownco.com', type: 'hard', count: 2 },
    { email: 'noreply@spamtrap.io', type: 'complaint', count: 1 },
    { email: 'temp@flakymail.com', type: 'soft', count: 2 },
  ];
  for (const s of samples) {
    store.set(normalizeBounceEmail(s.email), { email: normalizeBounceEmail(s.email), type: s.type, reported_at: SEED_DATE, count: s.count });
    totalReports += s.count;
  }
}

/** Record a bounce report for an address, incrementing its count. */
export function recordBounce(rawEmail: string, type: BounceType, reportedAt?: string): BounceRecord {
  ensureSeed();
  const email = normalizeBounceEmail(rawEmail);
  const existing = store.get(email);
  const record: BounceRecord = existing
    ? { ...existing, type, count: existing.count + 1, reported_at: reportedAt ?? existing.reported_at }
    : { email, type, reported_at: reportedAt ?? new Date().toISOString().slice(0, 10), count: 1 };
  store.set(email, record);
  totalReports += 1;
  return record;
}

/** The bounce record for an address, if any. */
export function getBounce(rawEmail: string): BounceRecord | null {
  ensureSeed();
  return store.get(normalizeBounceEmail(rawEmail)) ?? null;
}

/** Is this address suppressed by the bounce feedback loop? */
export function isSuppressed(rawEmail: string): boolean {
  const rec = getBounce(rawEmail);
  if (!rec) return false;
  if (rec.type === 'hard' || rec.type === 'complaint') return true;
  return rec.count >= SOFT_SUPPRESS_AFTER; // soft bounces suppress only when they repeat
}

export interface BounceStats {
  suppressed_addresses: number;
  total_reports: number;
  by_type: Record<BounceType, number>;
  recent: BounceRecord[];
}

/** A snapshot of the bounce feedback registry for the stats endpoint. */
export function getBounceStats(): BounceStats {
  ensureSeed();
  const by_type: Record<BounceType, number> = { hard: 0, soft: 0, complaint: 0 };
  let suppressed = 0;
  const all: BounceRecord[] = [];
  store.forEach((rec) => {
    by_type[rec.type] += 1;
    if (isSuppressed(rec.email)) suppressed += 1;
    all.push(rec);
  });
  return {
    suppressed_addresses: suppressed,
    total_reports: totalReports,
    by_type,
    recent: all.slice(-10).reverse(),
  };
}

/** Reset all state — test-only. */
export function __resetBounceFeedback(): void {
  store.clear();
  totalReports = 0;
  seeded = false;
}
