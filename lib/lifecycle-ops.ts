/**
 * CSM lifecycle operations (Phase 4–5, M5) — the operator actions taken on leads in
 * the cockpit: sending an upgrade prompt to a conversion-window account, and starting
 * a win-back on a dead lead. Persisted so the CSM's actions stick across a session.
 * Deterministic; per-browser.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LifecycleOpsState {
  /** Account ids an upgrade prompt has been sent to (conversion window). */
  promptSent: string[];
  /** Account ids a win-back sequence has been started for (dead leads). */
  winbackStarted: string[];
  sendPrompt: (id: string) => void;
  startWinback: (id: string) => void;
  reset: () => void;
}

export const useLifecycleOps = create<LifecycleOpsState>()(
  persist(
    (set) => ({
      promptSent: [],
      winbackStarted: [],
      sendPrompt: (id) => set((s) => (s.promptSent.includes(id) ? {} : { promptSent: [...s.promptSent, id] })),
      startWinback: (id) => set((s) => (s.winbackStarted.includes(id) ? {} : { winbackStarted: [...s.winbackStarted, id] })),
      reset: () => set({ promptSent: [], winbackStarted: [] }),
    }),
    { name: 'zinbit-lifecycle-ops', storage: createJSONStorage(() => localStorage) },
  ),
);
