/**
 * Dunning & churn — SSOT (Phase 7, M7).
 *
 * When a paying account's balance hits zero and they haven't re-upped, a dunning
 * sequence runs against the days since depletion:
 *   - 0–48h: grace / payment retry (we retry the card).
 *   - 48h–4d: key-revocation warning (calls still work, but access is at risk).
 *   - ≥4d: access revoked / suspended.
 * If the account was previously high-value, revocation-stage accounts also get sales
 * outreach rather than a silent lapse. Re-upping (topping up again) is the healthy
 * retention/LTV signal.
 *
 * Pure stage machine + a persisted ops store for the CSM's actions. Deterministic.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const RETRY_WINDOW_DAYS = 2;   // 48h payment retry
export const REVOKE_WARNING_DAYS = 4; // then revoke

export type DunningStage = 'grace_retry' | 'revocation_warning' | 'revoked';

export interface DunningMeta {
  label: string;
  action: string;
  tone: 'warning' | 'error';
}

export const DUNNING_META: Record<DunningStage, DunningMeta> = {
  grace_retry: { label: '48h payment retry', action: 'Retrying the card; balance at zero.', tone: 'warning' },
  revocation_warning: { label: 'Revocation warning', action: 'Warn that access will be revoked; sales outreach for prior high-value.', tone: 'warning' },
  revoked: { label: 'Access revoked', action: 'Keys suspended — win-back or recover.', tone: 'error' },
};

/** The dunning stage from days since the balance hit zero. */
export function dunningStage(depletedDaysAgo: number): DunningStage {
  if (depletedDaysAgo < RETRY_WINDOW_DAYS) return 'grace_retry';
  if (depletedDaysAgo < REVOKE_WARNING_DAYS) return 'revocation_warning';
  return 'revoked';
}

/** High-value accounts at/after the warning stage get a human sales touch. */
export function needsSalesOutreach(stage: DunningStage, highValue: boolean): boolean {
  return highValue && (stage === 'revocation_warning' || stage === 'revoked');
}

export interface DunningOpsState {
  retried: string[];
  warned: string[];
  revoked: string[];
  salesFlagged: string[];
  retryPayment: (id: string) => void;
  sendWarning: (id: string) => void;
  revokeAccess: (id: string) => void;
  flagSales: (id: string) => void;
  reset: () => void;
}

const add = (arr: string[], id: string) => (arr.includes(id) ? arr : [...arr, id]);

export const useDunningOps = create<DunningOpsState>()(
  persist(
    (set) => ({
      retried: [],
      warned: [],
      revoked: [],
      salesFlagged: [],
      retryPayment: (id) => set((s) => ({ retried: add(s.retried, id) })),
      sendWarning: (id) => set((s) => ({ warned: add(s.warned, id) })),
      revokeAccess: (id) => set((s) => ({ revoked: add(s.revoked, id) })),
      flagSales: (id) => set((s) => ({ salesFlagged: add(s.salesFlagged, id) })),
      reset: () => set({ retried: [], warned: [], revoked: [], salesFlagged: [] }),
    }),
    { name: 'zinbit-dunning-ops', storage: createJSONStorage(() => localStorage) },
  ),
);
