/**
 * Maker-checker approvals (deep feature 4) — types, policy and pure helpers.
 *
 * Staff act on customers' production accounts here, so the highest-risk changes —
 * granting credits (money), raising a spend limit, deleting a key — require a second,
 * different operator to approve. A maker submits a change request with a reason; a
 * checker (never the same person) approves or rejects; only on approval does the
 * underlying action run. Every step is audit-logged.
 */

import type { AdminRole } from './types';

export type ChangeKind = 'grant_credits' | 'raise_limit' | 'delete_key';
export type ChangeStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ChangePayload {
  /** grant_credits: credits to add (positive). */
  amount?: number;
  /** raise_limit: the new per-key credit limit. */
  creditLimit?: number;
}

export interface PendingChange {
  id: string;
  kind: ChangeKind;
  status: ChangeStatus;
  customerId: string;
  customerName: string;
  keyId: string | null;
  keyLabel: string | null;
  payload: ChangePayload;
  requestedBy: string;
  requestedByRole: AdminRole;
  requestedAt: string;
  reason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  /** Human summary of what applying it did, once approved. */
  appliedResult: string | null;
  expiresAt: string;
}

export interface ChangePolicy {
  label: string;
  description: string;
  /** Roles allowed to submit (be the maker). */
  submitRoles: AdminRole[];
  /** Roles allowed to approve/reject (be the checker) — always four-eyes. */
  approveRoles: AdminRole[];
  /** True when the request targets a specific key. */
  needsKey: boolean;
}

export const CHANGE_POLICY: Record<ChangeKind, ChangePolicy> = {
  grant_credits: { label: 'Grant credits', description: 'Add credits to a customer’s wallet (a manual credit / goodwill top-up).', submitRoles: ['finance', 'ops', 'superadmin'], approveRoles: ['finance', 'superadmin'], needsKey: false },
  raise_limit: { label: 'Raise credit limit', description: 'Raise the per-key credit limit above its current ceiling.', submitRoles: ['ops', 'superadmin'], approveRoles: ['ops', 'superadmin'], needsKey: true },
  delete_key: { label: 'Delete key', description: 'Permanently remove a key from every registry.', submitRoles: ['ops', 'superadmin'], approveRoles: ['superadmin'], needsKey: true },
};

export const CHANGE_KINDS: ChangeKind[] = ['grant_credits', 'raise_limit', 'delete_key'];
export const APPROVAL_TTL_DAYS = 7;

export function validateChange(kind: ChangeKind, payload: ChangePayload, keyId: string | null): { ok: boolean; error?: string } {
  const policy = CHANGE_POLICY[kind];
  if (policy.needsKey && !keyId) return { ok: false, error: 'This change needs a target key.' };
  if (kind === 'grant_credits') {
    if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount) || payload.amount <= 0) return { ok: false, error: 'Enter a credit amount greater than 0.' };
    if (payload.amount > 5_000_000) return { ok: false, error: 'Grants above 5,000,000 credits need a contract change, not an approval.' };
  }
  if (kind === 'raise_limit') {
    if (typeof payload.creditLimit !== 'number' || !Number.isFinite(payload.creditLimit) || payload.creditLimit <= 0) return { ok: false, error: 'Enter a new limit greater than 0.' };
  }
  return { ok: true };
}

export function summarizeChange(c: Pick<PendingChange, 'kind' | 'payload' | 'customerName' | 'keyLabel'>): string {
  if (c.kind === 'grant_credits') return `Grant ${(c.payload.amount ?? 0).toLocaleString()} credits to ${c.customerName}`;
  if (c.kind === 'raise_limit') return `Raise ${c.keyLabel ?? 'key'} limit to ${(c.payload.creditLimit ?? 0).toLocaleString()} for ${c.customerName}`;
  return `Delete ${c.keyLabel ?? 'key'} for ${c.customerName}`;
}

export interface ApprovalStats { pending: number; approved: number; rejected: number; byKind: Partial<Record<ChangeKind, number>> }
export function approvalStats(changes: PendingChange[]): ApprovalStats {
  const pending = changes.filter((c) => c.status === 'pending');
  const byKind: Partial<Record<ChangeKind, number>> = {};
  pending.forEach((c) => { byKind[c.kind] = (byKind[c.kind] ?? 0) + 1; });
  return { pending: pending.length, approved: changes.filter((c) => c.status === 'approved').length, rejected: changes.filter((c) => c.status === 'rejected').length, byKind };
}
