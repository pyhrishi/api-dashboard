'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Sparkles, Gift, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { Portal } from '@/components/Portal';
import type { NudgeSpec } from '@/lib/nudges';

/**
 * One nudge as a focused dialog. `celebrate` fires confetti on mount (C2-a granted,
 * C5-b/c upgrade). Focus moves into the dialog and is trapped there; Esc snoozes.
 * The parent (`NudgeOrchestrator`) owns `AnimatePresence`, so the exit variant plays.
 */
export function NudgeModal({ spec, body, ctaLabel, celebrate, onCta, onSnooze, onDismiss }: {
  spec: NudgeSpec;
  body?: string;
  ctaLabel?: string;
  celebrate: boolean;
  onCta: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const laterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    (ctaRef.current ?? laterRef.current)?.focus();
    if (celebrate && !reduce) {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.5 }, colors: ['#46BDC6', '#ffffff', '#7AE2E9'] });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onSnooze(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={`nudge-${spec.id}-title`} aria-describedby={`nudge-${spec.id}-body`}>
        <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onSnooze} />
        <motion.div
          ref={dialogRef}
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
          data-nudge-id={spec.id}
        >
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${celebrate ? 'bg-teal/15 text-teal' : spec.priority === 'P0' ? 'bg-semantic-warning/10 text-semantic-warning' : 'bg-overlay text-fg-muted'}`}>
                {celebrate ? <Gift className="w-5 h-5" /> : spec.priority === 'P0' ? <AlertTriangle className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
              </span>
              <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <h2 id={`nudge-${spec.id}-title`} className="text-lg font-bold text-fg mt-3">{spec.title}</h2>
            <p id={`nudge-${spec.id}-body`} className="text-sm text-fg-muted mt-1.5">{body ?? spec.body}</p>
          </div>
          <div className="px-6 py-4 border-t border-border bg-surface-2 flex items-center justify-end gap-2">
            <button ref={laterRef} type="button" onClick={onSnooze} className="px-4 py-2 rounded-xl text-sm font-bold text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
              Maybe later
            </button>
            {spec.cta && (
              <button ref={ctaRef} type="button" onClick={onCta} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold bg-teal text-ink hover:bg-teal-ice transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                {ctaLabel ?? spec.cta.label} <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
