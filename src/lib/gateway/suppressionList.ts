/**
 * Suppression list honoring — never resolve a contact the customer suppressed.
 *
 * A customer's do-not-contact / suppression list is a compliance obligation:
 * unsubscribes, GDPR erasures, competitor blocks. This registry is what the
 * gateway consults so a lookup on a suppressed email — or any address on a
 * suppressed domain — returns a "suppressed, details withheld" result instead of
 * the contact, at zero credits.
 *
 * In-memory, per-process (like the other gateway registries). A small
 * deterministic seed makes enforcement demoable immediately. Suppressing a
 * domain suppresses every mailbox on it.
 */

import { normalizeDomain } from '@/lib/company-resolver';

export type SuppressionKind = 'email' | 'domain';
export type SuppressionReason = 'unsubscribed' | 'do_not_contact' | 'gdpr_erasure' | 'competitor' | 'complaint' | 'manual';

export interface SuppressionEntry {
  identifier: string;
  kind: SuppressionKind;
  reason: SuppressionReason;
  added_at: string;
  added_by: string;
}

const REASONS: SuppressionReason[] = ['unsubscribed', 'do_not_contact', 'gdpr_erasure', 'competitor', 'complaint', 'manual'];
const SEED_DATE = '2026-08-25';

const store = new Map<string, SuppressionEntry>();

/** Classify + normalize a raw identifier into a suppression key. */
export function classifyIdentifier(raw: string): { key: string; kind: SuppressionKind } {
  const v = String(raw || '').trim().toLowerCase();
  if (v.includes('@')) return { key: v, kind: 'email' };
  return { key: normalizeDomain(v), kind: 'domain' };
}

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const samples: { id: string; reason: SuppressionReason }[] = [
    { id: 'unsubscribed@acme.com', reason: 'unsubscribed' },
    { id: 'do-not-contact@bigco.com', reason: 'do_not_contact' },
    { id: 'competitor.com', reason: 'competitor' },
    { id: 'erased.person@example.org', reason: 'gdpr_erasure' },
  ];
  for (const s of samples) {
    const { key, kind } = classifyIdentifier(s.id);
    store.set(key, { identifier: key, kind, reason: s.reason, added_at: SEED_DATE, added_by: 'seed@zinbit' });
  }
}

/** Add an identifier (email or domain) to the suppression list. */
export function addSuppression(raw: string, reason: SuppressionReason = 'manual', addedBy = 'api'): SuppressionEntry {
  ensureSeed();
  const { key, kind } = classifyIdentifier(raw);
  const safeReason = REASONS.includes(reason) ? reason : 'manual';
  const existing = store.get(key);
  const entry: SuppressionEntry = existing
    ? { ...existing, reason: safeReason }
    : { identifier: key, kind, reason: safeReason, added_at: new Date().toISOString().slice(0, 10), added_by: addedBy };
  store.set(key, entry);
  return entry;
}

/** Remove an identifier from the suppression list. Returns whether it existed. */
export function removeSuppression(raw: string): boolean {
  ensureSeed();
  const { key } = classifyIdentifier(raw);
  return store.delete(key);
}

/**
 * Is this identifier suppressed? An email is suppressed if the exact address is
 * listed OR its domain is listed. Returns the matching entry (email match wins).
 */
export function checkSuppression(raw: string): SuppressionEntry | null {
  ensureSeed();
  const { key, kind } = classifyIdentifier(raw);
  const direct = store.get(key);
  if (direct) return direct;
  if (kind === 'email') {
    const domain = key.split('@')[1] ?? '';
    if (domain) {
      const byDomain = store.get(normalizeDomain(domain));
      if (byDomain) return byDomain;
    }
  }
  return null;
}

export interface SuppressionStats {
  total: number;
  by_kind: Record<SuppressionKind, number>;
  by_reason: Record<SuppressionReason, number>;
  recent: SuppressionEntry[];
}

/** A snapshot of the suppression list. */
export function getSuppressionStats(): SuppressionStats {
  ensureSeed();
  const by_kind: Record<SuppressionKind, number> = { email: 0, domain: 0 };
  const by_reason: Record<SuppressionReason, number> = { unsubscribed: 0, do_not_contact: 0, gdpr_erasure: 0, competitor: 0, complaint: 0, manual: 0 };
  const all: SuppressionEntry[] = [];
  store.forEach((e) => {
    by_kind[e.kind] += 1;
    by_reason[e.reason] += 1;
    all.push(e);
  });
  return { total: store.size, by_kind, by_reason, recent: all.slice(-20).reverse() };
}

/** Reset all state — test-only. */
export function __resetSuppression(): void {
  store.clear();
  seeded = false;
}
