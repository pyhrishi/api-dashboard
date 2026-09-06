/**
 * Key labels & ownership (F-124) — key-governance metadata model (SSOT).
 *
 * Every API key gets an accountable owner (a team member) and free-form labels
 * (team, environment, purpose) so a security review can answer "whose key is
 * this and what is it for?" without guessing from a name. An unowned key is a
 * governance gap — this surfaces them. Pure derivation over the store's
 * `activeKeys` + `teamMembers`; deterministic, no Math.random.
 */

import type { MockKey, TeamMember } from '@/lib/store';

export interface KeyOwnership {
  key: MockKey;
  owner: TeamMember | null;
  labels: string[];
}

export interface OwnerBreakdown {
  owner: TeamMember;
  count: number;
}

export interface OwnershipSummary {
  total: number;
  owned: number;
  unowned: number;
  labelled: number;
  /** Keys per owner, most first. */
  byOwner: OwnerBreakdown[];
  /** Distinct labels in use. */
  labelCount: number;
}

/** Resolve a key's owner from the team roster, or null when unassigned/stale. */
export function resolveOwner(key: MockKey, members: TeamMember[]): TeamMember | null {
  if (!key.ownerId) return null;
  return members.find((m) => m.id === key.ownerId) ?? null;
}

/** Normalize a raw label into a stable tag: lowercased, hyphenated, capped. */
export function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

/** The distinct labels across a set of keys, sorted. */
export function allLabels(keys: MockKey[]): string[] {
  const set = new Set<string>();
  keys.forEach((k) => (k.labels ?? []).forEach((l) => set.add(l)));
  return Array.from(set).sort();
}

/** A display handle for a team member (no name field on the roster — use email). */
export const memberLabel = (m: TeamMember): string => m.email;

/** Keys with no owner assigned — the governance gap. */
export const unownedKeys = (keys: MockKey[]): MockKey[] => keys.filter((k) => !k.ownerId);

/** Build the ownership view (owner + labels resolved) for a set of keys. */
export function computeOwnership(keys: MockKey[], members: TeamMember[]): KeyOwnership[] {
  return keys.map((key) => ({ key, owner: resolveOwner(key, members), labels: key.labels ?? [] }));
}

/** Roll-up across keys. */
export function summarizeOwnership(keys: MockKey[], members: TeamMember[]): OwnershipSummary {
  const owned = keys.filter((k) => !!resolveOwner(k, members)).length;
  const labelled = keys.filter((k) => (k.labels?.length ?? 0) > 0).length;
  const counts = new Map<string, number>();
  keys.forEach((k) => {
    const owner = resolveOwner(k, members);
    if (owner) counts.set(owner.id, (counts.get(owner.id) ?? 0) + 1);
  });
  const byOwner: OwnerBreakdown[] = [];
  counts.forEach((count, id) => {
    const owner = members.find((m) => m.id === id);
    if (owner) byOwner.push({ owner, count });
  });
  byOwner.sort((a, b) => b.count - a.count);
  return { total: keys.length, owned, unowned: keys.length - owned, labelled, byOwner, labelCount: allLabels(keys).length };
}

export interface OwnershipFilter {
  ownerId?: string | null; // a member id, 'unowned', or undefined for any
  label?: string | null;
}

/** Filter keys by owner and/or label. */
export function filterKeys(keys: MockKey[], filter: OwnershipFilter): MockKey[] {
  return keys.filter((k) => {
    if (filter.ownerId === 'unowned' && k.ownerId) return false;
    if (filter.ownerId && filter.ownerId !== 'unowned' && k.ownerId !== filter.ownerId) return false;
    if (filter.label && !(k.labels ?? []).includes(filter.label)) return false;
    return true;
  });
}
