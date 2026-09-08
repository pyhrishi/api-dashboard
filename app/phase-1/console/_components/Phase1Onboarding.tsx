'use client';

/**
 * Phase-1 First-Time-User onboarding (FTUE).
 *
 * The real OnboardingChecklist only renders on the /console index, which the Phase-1
 * surface never shows — so the FTUE flow was missing here. This is a Phase-1-native
 * variant: same derived-from-real-state completion, steps pointing at /phase-1/console/*,
 * and — the piece the store lacks entirely — a RESET so the flow can be replayed after
 * it's dismissed. Dismiss/reset state is Phase-1-scoped in localStorage (no shared store
 * change); step completion is read from the store read-only. Token-based colors so it
 * reads correctly in both light and dark.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Check, ChevronRight, Key, Webhook, Users, Play, X, User, RotateCcw, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/telemetry';

type StepId = 'account' | 'keys' | 'first_call' | 'webhooks' | 'team';

interface StepDef { id: StepId; title: string; description: string; icon: LucideIcon; href: string }

const STEP_DEFS: StepDef[] = [
  { id: 'account', title: 'Create an account', description: "You've successfully joined zinbit by Zintlr.", icon: User, href: '/phase-1/console/settings' },
  { id: 'keys', title: 'Generate an API Key', description: 'Create a key to authenticate your requests.', icon: Key, href: '/phase-1/console/keys' },
  { id: 'first_call', title: 'Make your first request', description: 'Test your integration in the Endpoint Explorer.', icon: Play, href: '/phase-1/console/explorer' },
  { id: 'webhooks', title: 'Set up a webhook', description: 'Receive real-time updates for data changes.', icon: Webhook, href: '/phase-1/console/webhooks' },
  { id: 'team', title: 'Invite team members', description: 'Collaborate with your team on zinbit.', icon: Users, href: '/phase-1/console/settings' },
];

const TOTAL_STEPS = STEP_DEFS.length;
const STORAGE_KEY = 'zinbit-p1-ftue-dismissed';

export function Phase1Onboarding() {
  const { activeKeys, webhooks, teamMembers, isFirstCallMade } = useStore();

  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Load Phase-1-scoped dismissal after mount (localStorage is client-only; guard it).
  useEffect(() => {
    setMounted(true);
    try { setDismissed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* storage blocked — show flow */ }
  }, []);

  const completion: Record<StepId, boolean> = {
    account: true,
    keys: activeKeys.length > 0,
    first_call: isFirstCallMade,
    webhooks: webhooks.length > 0,
    team: teamMembers.length > 3,
  };
  const steps = STEP_DEFS.map((def) => ({ ...def, isCompleted: completion[def.id] }));
  const completedIds = steps.filter((s) => s.isCompleted).map((s) => s.id);
  const completedCount = completedIds.length;
  const progressPercentage = (completedCount / TOTAL_STEPS) * 100;
  const allDone = completedCount === TOTAL_STEPS;
  const completedKey = completedIds.join(',');

  // Emit one telemetry event per step the moment it flips to done (mirrors the real checklist).
  const prevCompletedRef = useRef<string | null>(null);
  useEffect(() => {
    const now = completedKey ? completedKey.split(',') : [];
    const prev = prevCompletedRef.current;
    if (prev !== null) {
      const before = prev ? prev.split(',') : [];
      now.forEach((id) => {
        if (before.indexOf(id) === -1) {
          track('onboarding_step_completed', { step: id, completed: now.length, total: TOTAL_STEPS });
        }
      });
    }
    prevCompletedRef.current = completedKey;
  }, [completedKey]);

  const persist = (val: boolean) => { try { localStorage.setItem(STORAGE_KEY, val ? '1' : '0'); } catch { /* ignore */ } };

  const handleDismiss = () => {
    if (completedCount < TOTAL_STEPS) {
      track('feature_abandoned', { feature: 'onboarding_checklist', completed: completedCount, total: TOTAL_STEPS });
    }
    setDismissed(true);
    persist(true);
  };

  const handleReset = () => {
    track('feature_viewed', { feature: 'phase1_onboarding_replay' });
    setDismissed(false);
    setIsExpanded(true);
    persist(false);
  };

  if (!mounted) return null; // avoid hydration mismatch on the stored flag

  // Dismissed → keep RESET always reachable (the piece that was missing).
  if (dismissed) {
    return (
      <div className="mb-8 flex items-center justify-between gap-4 bg-surface-2 border border-border rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal/10 grid place-items-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-teal" />
          </div>
          <p className="text-sm text-fg-muted truncate">
            <span className="font-semibold text-fg">Getting-started guide hidden.</span>{' '}
            {allDone ? 'All steps complete — replay it any time.' : `You finished ${completedCount} of ${TOTAL_STEPS} steps.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-bold text-teal border border-teal/30 bg-teal/10 hover:bg-teal/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          <RotateCcw className="w-4 h-4" /> Replay onboarding
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 bg-surface-2 border border-border rounded-2xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-glass transition-colors" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg className="w-12 h-12 -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-border-strong" />
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={125.6} strokeDashoffset={125.6 - (125.6 * progressPercentage) / 100} className="text-teal transition-all duration-1000 ease-out" />
            </svg>
            <span className="absolute text-[10px] font-bold text-fg tabular-nums">{completedCount}/{TOTAL_STEPS}</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg">{allDone ? "You're all set with zinbit" : 'Getting Started with zinbit'}</h2>
            <p className="text-sm text-fg-muted">{allDone ? 'Every setup step is done — you can dismiss this.' : 'Complete these steps to set up your workspace.'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          className="p-2 text-fg-muted hover:text-fg hover:bg-glass-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          title="Dismiss checklist"
          aria-label="Dismiss onboarding checklist"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border-subtle">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-4 bg-glass">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <Link key={step.id} href={step.href} className={cn('flex items-start gap-4 p-4 rounded-xl transition-all duration-300 group hover:bg-glass-2', step.isCompleted ? 'opacity-60 hover:opacity-100' : '')}>
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border transition-colors duration-500', step.isCompleted ? 'bg-teal text-ink border-teal' : 'border-border-strong text-fg-muted group-hover:border-teal/50 group-hover:text-fg')}>
                      {step.isCompleted ? <Check className="w-3 h-3" strokeWidth={3} /> : <Icon className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className={cn('text-sm font-bold transition-colors', step.isCompleted ? 'text-fg-muted line-through' : 'text-fg')}>{step.title}</h3>
                        {!step.isCompleted && <ChevronRight className="w-4 h-4 text-fg-muted opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />}
                      </div>
                      <p className="text-xs text-fg-muted mt-1">{step.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
