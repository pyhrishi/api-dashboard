/**
 * Cost-calculator scenario — a small dedicated persisted store for the Pricing &
 * Cost Calculator (`/console/pricing`). Kept out of the big Zustand store to avoid
 * the AppState/TenantState/partialize triple-sync; its own localStorage key.
 *
 * Holds only the *inputs* (the call-mix and options). All money/credit maths lives
 * in the pure pricing SSOT (`@/lib/pricing`).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TierId, BillingCycle, OverageMode, LineItem } from '@/lib/pricing';

export interface PricingCalcState {
  lineItems: LineItem[];
  tierId: TierId;
  cycle: BillingCycle;
  overageMode: OverageMode;
  /** Monthly volume growth used by the forecast (percent). */
  growthPct: number;
  /** True once the user has edited the mix, so we don't overwrite it with a prefill. */
  customized: boolean;

  addLineItem: (endpointId: string, callsPerMonth?: number) => void;
  removeLineItem: (endpointId: string) => void;
  setCalls: (endpointId: string, callsPerMonth: number) => void;
  replaceMix: (items: LineItem[], markCustomized?: boolean) => void;
  setTier: (tierId: TierId) => void;
  setCycle: (cycle: BillingCycle) => void;
  setOverageMode: (mode: OverageMode) => void;
  setGrowthPct: (pct: number) => void;
  reset: () => void;
}

const DEFAULT_CALLS = 10_000;

export const usePricingCalc = create<PricingCalcState>()(
  persist(
    (set) => ({
      lineItems: [],
      tierId: 'starter',
      cycle: 'monthly',
      overageMode: 'soft',
      growthPct: 10,
      customized: false,

      addLineItem: (endpointId, callsPerMonth = DEFAULT_CALLS) =>
        set((s) => {
          if (s.lineItems.some((l) => l.endpointId === endpointId)) return s;
          return { lineItems: [...s.lineItems, { endpointId, callsPerMonth: Math.max(0, Math.round(callsPerMonth)) }], customized: true };
        }),

      removeLineItem: (endpointId) =>
        set((s) => ({ lineItems: s.lineItems.filter((l) => l.endpointId !== endpointId), customized: true })),

      setCalls: (endpointId, callsPerMonth) =>
        set((s) => ({
          lineItems: s.lineItems.map((l) =>
            l.endpointId === endpointId ? { ...l, callsPerMonth: Math.max(0, Math.round(callsPerMonth)) } : l,
          ),
          customized: true,
        })),

      replaceMix: (items, markCustomized = true) =>
        set(() => ({
          lineItems: items.map((l) => ({ endpointId: l.endpointId, callsPerMonth: Math.max(0, Math.round(l.callsPerMonth)) })),
          customized: markCustomized,
        })),

      setTier: (tierId) => set({ tierId }),
      setCycle: (cycle) => set({ cycle }),
      setOverageMode: (overageMode) => set({ overageMode }),
      setGrowthPct: (pct) => set({ growthPct: Math.max(0, Math.min(100, Math.round(pct))) }),

      reset: () => set({ lineItems: [], tierId: 'starter', cycle: 'monthly', overageMode: 'soft', growthPct: 10, customized: false }),
    }),
    { name: 'zinbit-pricing-calc', storage: createJSONStorage(() => localStorage) },
  ),
);
