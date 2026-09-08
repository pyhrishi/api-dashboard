'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { UserCircle2, ArrowRight } from 'lucide-react';
import { Portal } from '@/components/Portal';
import { track } from '@/lib/telemetry';
import { useNudgeState, type NudgeProfile } from '@/lib/nudges';
import { cn } from '@/lib/utils';

const ROLES: { value: NonNullable<NudgeProfile['role']>; label: string }[] = [
  { value: 'developer', label: 'Developer' },
  { value: 'founder', label: 'Founder' },
  { value: 'data', label: 'Data / analytics' },
  { value: 'other', label: 'Something else' },
];
const USE_CASES: { value: NonNullable<NudgeProfile['useCase']>; label: string }[] = [
  { value: 'crm', label: 'CRM enrichment' },
  { value: 'lead-enrichment', label: 'Lead enrichment' },
  { value: 'fraud', label: 'Fraud / risk' },
  { value: 'data-quality', label: 'Data quality' },
  { value: 'other', label: 'Other' },
];

/**
 * C1-b role + use-case capture. Segments the account (steers auto-key and catalogue
 * pre-filter later). Skippable with safe defaults — never blocks. Shown once.
 */
export function RoleCaptureModal({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const setProfile = useNudgeState((s) => s.setProfile);
  const [role, setRole] = useState<NudgeProfile['role']>(null);
  const [useCase, setUseCase] = useState<NudgeProfile['useCase']>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    setProfile({ role, useCase, captured: true });
    track('onboarding_step_completed', { step: 'profile', role: role ?? 'unset', useCase: useCase ?? 'unset' });
    onDone();
  };
  const skip = () => {
    setProfile({ skipped: true, captured: true });
    track('onboarding_step_completed', { step: 'profile', skipped: true });
    onDone();
  };

  const Pill = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn('rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
        selected ? 'border-teal bg-teal/10 text-teal' : 'border-border bg-glass text-fg-muted hover:text-fg hover:border-teal/40')}>
      {children}
    </button>
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="role-capture-title">
        <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={skip} />
        <motion.div initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
          <div className="p-6">
            <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center"><UserCircle2 className="w-5 h-5" /></span>
            <h2 id="role-capture-title" className="text-lg font-bold text-fg mt-3">Help us tailor your setup</h2>
            <p className="text-sm text-fg-muted mt-1.5">Two quick questions so we can pre-fill the right endpoints and defaults. Skip and we’ll use sensible ones.</p>
            <div className="mt-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Your role</div>
              <div className="flex flex-wrap gap-1.5">{ROLES.map((r) => <Pill key={r.value} selected={role === r.value} onClick={() => setRole(r.value)}>{r.label}</Pill>)}</div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">What are you building?</div>
              <div className="flex flex-wrap gap-1.5">{USE_CASES.map((u) => <Pill key={u.value} selected={useCase === u.value} onClick={() => setUseCase(u.value)}>{u.label}</Pill>)}</div>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border bg-surface-2 flex items-center justify-end gap-2">
            <button type="button" onClick={skip} className="px-4 py-2 rounded-xl text-sm font-bold text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">Skip</button>
            <button type="button" onClick={save} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold bg-teal text-ink hover:bg-teal-ice transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">Continue <ArrowRight className="w-4 h-4" /></button>
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
