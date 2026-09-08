/**
 * Activation & trial consumption — SSOT (Phase 3, M4).
 *
 * Two things this phase tracks:
 *   1. First API fire (C3-a, "Sales Qualified") — time from first key to first
 *      successful call, against a <10-minute activation target.
 *   2. Trial consumption milestones — 10 / 25 / 50 / 75 / 100 % of the free trial
 *      consumed, where 50% is the "Sales Ready" signal. Each milestone fires once
 *      and drives an intensifying in-product upgrade nudge.
 *
 * Pure helpers + a dedicated persisted store (`useActivation`) that remembers the
 * first-fire timestamp and which milestones have already fired (so events aren't
 * re-emitted). Deterministic; no Math.random.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** The activation target: a first successful call within 10 minutes of the key. */
export const ACTIVATION_TARGET_MS = 10 * 60 * 1000;

export const MILESTONES = [10, 25, 50, 75, 100] as const;
export type Milestone = typeof MILESTONES[number];

export interface MilestoneMeta {
  label: string;
  /** The lead signal this milestone raises, if any. */
  signal?: 'sql' | 'sales_ready';
  /** Intensifying in-product nudge copy. */
  nudge: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export const MILESTONE_META: Record<Milestone, MilestoneMeta> = {
  10: { label: 'First momentum', nudge: 'Nice — you’ve started using your trial. Explore more endpoints while credits are on us.', tone: 'info' },
  25: { label: 'Building a habit', nudge: 'A quarter of your trial in. See which endpoints fit your workflow best.', tone: 'info' },
  50: { label: 'Sales Ready', signal: 'sales_ready', nudge: 'Halfway through your trial — upgrade now to keep momentum without a gap.', tone: 'warning' },
  75: { label: 'Heavy usage', nudge: '75% used. Top up before you run out mid-build — auto-reload keeps you flowing.', tone: 'warning' },
  100: { label: 'Trial exhausted', nudge: 'Your free trial is fully consumed. Add a paid balance to continue calling live APIs.', tone: 'error' },
};

/** Every milestone at or below the used-percent. */
export function reachedMilestones(usedPct: number): Milestone[] {
  return MILESTONES.filter((m) => usedPct >= m);
}

/** Milestones newly crossed vs. the ones already fired. */
export function newMilestones(usedPct: number, alreadyFired: number[]): Milestone[] {
  return reachedMilestones(usedPct).filter((m) => !alreadyFired.includes(m));
}

/** The highest milestone reached (for the current nudge), or null. */
export function currentMilestone(usedPct: number): Milestone | null {
  const reached = reachedMilestones(usedPct);
  return reached.length ? reached[reached.length - 1] : null;
}

/** Time from first key to first fire, or null if not activated yet. */
export function timeToFirstCallMs(firstKeyAt: number | null, firstFireAt: number | null): number | null {
  if (!firstKeyAt || !firstFireAt) return null;
  return Math.max(0, firstFireAt - firstKeyAt);
}

/** Whether the account activated within the target window. */
export function isActivatedFast(ttfcMs: number | null): boolean {
  return ttfcMs !== null && ttfcMs <= ACTIVATION_TARGET_MS;
}

/** Format a duration compactly (e.g. "4m 12s"). */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export interface ActivationState {
  firstFireAt: number | null;
  milestonesFired: number[];
  recordFirstFire: (at?: number) => void;
  recordMilestones: (milestones: number[]) => void;
  reset: () => void;
}

export const useActivation = create<ActivationState>()(
  persist(
    (set, get) => ({
      firstFireAt: null,
      milestonesFired: [],
      recordFirstFire: (at) => { if (get().firstFireAt === null) set({ firstFireAt: at ?? Date.now() }); },
      recordMilestones: (milestones) => set((s) => ({ milestonesFired: Array.from(new Set([...s.milestonesFired, ...milestones])).sort((a, b) => a - b) })),
      reset: () => set({ firstFireAt: null, milestonesFired: [] }),
    }),
    { name: 'zinbit-activation', storage: createJSONStorage(() => localStorage) },
  ),
);
