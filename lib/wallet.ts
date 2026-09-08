/**
 * Paid wallet health — SSOT (Phase 6, M6).
 *
 * Once an account is paying, we monitor how its balance burns against time:
 *   - balanced (≈1:1): healthy — just monitor.
 *   - slow (off-proportion, lots of runway): feature-discovery nudge (distinguish
 *     "low-volume but happy" from "stalling").
 *   - fast (burning down quickly): heavy user — low-balance alerts + an auto-reload
 *     offer so they don't deplete mid-production.
 *
 * The burn bucket itself is computed by `walletBurnBucket` in `lib/funnel`; this
 * module adds the account-level auto-reload config + the recommended action per
 * bucket. Pure helpers + a dedicated persisted store. No Math.random.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BurnBucket } from '@/lib/funnel';

export interface BucketAction {
  label: string;
  action: string;
  tone: 'success' | 'info' | 'warning';
}

export const BUCKET_ACTION: Record<BurnBucket, BucketAction> = {
  balanced: { label: 'Balanced burn', action: 'Healthy — just monitor.', tone: 'success' },
  slow: { label: 'Slow burn', action: 'Feature-discovery nudge — surface endpoints they haven’t tried (happy vs. stalling).', tone: 'info' },
  fast: { label: 'Fast burn', action: 'Heavy user — low-balance alert + auto-reload offer to avoid mid-production depletion.', tone: 'warning' },
};

/** Days of runway left at the current burn rate (null if not burning). */
export function runwayDays(balance: number, spendPerDay: number): number | null {
  if (spendPerDay <= 0) return null;
  return Math.round(balance / spendPerDay);
}

/** Whether the balance has fallen to/under the auto-reload threshold. */
export function isLowBalance(balance: number, threshold: number): boolean {
  return balance <= threshold;
}

export const RELOAD_AMOUNTS = [500, 1000, 2500, 5000] as const;

export interface WalletState {
  autoReloadEnabled: boolean;
  /** Trigger a reload when the balance falls to/under this. */
  threshold: number;
  /** How many credits to add on reload. */
  amount: number;
  setAutoReloadEnabled: (on: boolean) => void;
  setThreshold: (n: number) => void;
  setAmount: (n: number) => void;
}

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      autoReloadEnabled: false,
      threshold: 200,
      amount: 1000,
      setAutoReloadEnabled: (on) => set({ autoReloadEnabled: on }),
      setThreshold: (n) => set({ threshold: Math.max(0, Math.round(n)) }),
      setAmount: (n) => set({ amount: (RELOAD_AMOUNTS as readonly number[]).includes(n) ? n : 1000 }),
    }),
    { name: 'zinbit-wallet', storage: createJSONStorage(() => localStorage) },
  ),
);
