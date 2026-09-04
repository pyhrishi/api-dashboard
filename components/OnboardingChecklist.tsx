'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { Check, ChevronRight, Key, Webhook, Users, Play, X, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { track } from '@/lib/telemetry';

type StepId = 'account' | 'keys' | 'first_call' | 'webhooks' | 'team';

interface StepDef {
  id: StepId;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

/** Static step definitions — completion is derived from store state at render time. */
const STEP_DEFS: StepDef[] = [
  { id: 'account', title: 'Create an account', description: "You've successfully joined zinbit by Zintlr.", icon: User, href: '/console/settings/profile' },
  { id: 'keys', title: 'Generate an API Key', description: 'Create a key to authenticate your requests.', icon: Key, href: '/console/keys' },
  { id: 'first_call', title: 'Make your first request', description: 'Test your integration with the API explorer.', icon: Play, href: '/console/explorer' },
  { id: 'webhooks', title: 'Set up a webhook', description: 'Receive real-time updates for data changes.', icon: Webhook, href: '/console/webhooks' },
  { id: 'team', title: 'Invite team members', description: 'Collaborate with your team on zinbit.', icon: Users, href: '/console/settings/team' },
];

const TOTAL_STEPS = STEP_DEFS.length;

export function OnboardingChecklist() {
  const {
    activeKeys,
    webhooks,
    teamMembers,
    isFirstCallMade,
    isChecklistDismissed,
    dismissChecklist,
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(true);

  const completion: Record<StepId, boolean> = {
    account: true, // Always true for a logged-in user
    keys: activeKeys.length > 0,
    first_call: isFirstCallMade,
    webhooks: webhooks.length > 0,
    team: teamMembers.length > 3, // Seed data ships with 3 members
  };

  const steps = STEP_DEFS.map(def => ({ ...def, isCompleted: completion[def.id] }));
  const completedIds = steps.filter(s => s.isCompleted).map(s => s.id);
  const completedCount = completedIds.length;
  const progressPercentage = (completedCount / TOTAL_STEPS) * 100;
  // Stable string key so the effect below only runs when the completed set actually changes.
  const completedKey = completedIds.join(',');

  // Emit one `onboarding_step_completed` per step the moment it flips to done.
  const prevCompletedRef = useRef<string | null>(null);
  useEffect(() => {
    const now = completedKey ? completedKey.split(',') : [];
    const prev = prevCompletedRef.current;
    if (prev !== null) {
      const before = prev ? prev.split(',') : [];
      now.forEach(id => {
        if (before.indexOf(id) === -1) {
          track('onboarding_step_completed', { step: id, completed: now.length, total: TOTAL_STEPS });
        }
      });
    }
    prevCompletedRef.current = completedKey;
  }, [completedKey]);

  if (isChecklistDismissed) return null;

  const handleDismiss = () => {
    if (completedCount < TOTAL_STEPS) {
      track('feature_abandoned', { feature: 'onboarding_checklist', completed: completedCount, total: TOTAL_STEPS });
    }
    dismissChecklist();
  };

  return (
    <div className="mb-8 bg-surface-2 border border-border rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div
        className="p-5 flex items-center justify-between cursor-pointer hover:bg-glass transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          {/* Circular Progress */}
          <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
              <circle
                cx="24" cy="24" r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={125.6}
                strokeDashoffset={125.6 - (125.6 * progressPercentage) / 100}
                className="text-teal transition-all duration-1000 ease-out"
              />
            </svg>
            <span className="absolute text-[10px] font-bold text-fg">
              {completedCount}/{TOTAL_STEPS}
            </span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-fg">Getting Started with zinbit</h2>
            <p className="text-sm text-fg-muted">Complete these steps to set up your workspace.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-2 text-fg-muted hover:text-fg hover:bg-glass-2 rounded-lg transition-colors"
            title="Dismiss checklist"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border-subtle"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-4 bg-white/[0.02]">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <Link
                    key={step.id}
                    href={step.href}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-xl transition-all duration-300 group hover:bg-glass",
                      step.isCompleted ? "opacity-60 hover:opacity-100" : ""
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border transition-colors duration-500",
                      step.isCompleted
                        ? "bg-teal text-ink border-teal"
                        : "border-border-strong text-fg-muted group-hover:border-white/40 group-hover:text-fg"
                    )}>
                      {step.isCompleted ? <Check className="w-3 h-3" strokeWidth={3} /> : <Icon className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <h3 className={cn("text-sm font-bold transition-colors", step.isCompleted ? "text-fg-muted line-through" : "text-fg")}>
                          {step.title}
                        </h3>
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
