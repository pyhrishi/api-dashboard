'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Zap, KeyRound, CreditCard, AlertTriangle, Gift, Info, Clock, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NudgeSpec } from '@/lib/nudges';

/** Icon per journey code, falling back to a priority default. */
function iconFor(spec: NudgeSpec) {
  const code = String(spec.code);
  if (code.startsWith('C2')) return <Gift className="w-4 h-4" />;
  if (code === 'C3-a') return <Zap className="w-4 h-4" />;
  if (code.startsWith('C3') || code === 'C4-a') return <CreditCard className="w-4 h-4" />;
  if (code.startsWith('key_')) return <KeyRound className="w-4 h-4" />;
  if (code.startsWith('C6') || code.startsWith('C7') || code.startsWith('wallet')) return <CreditCard className="w-4 h-4" />;
  if (code.startsWith('C5')) return <Sparkles className="w-4 h-4" />;
  if (code === 'inactivity_7') return <Clock className="w-4 h-4" />;
  return spec.priority === 'P0' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />;
}

const TONE: Record<NudgeSpec['priority'], string> = {
  P0: 'border-teal/30 bg-teal/5',
  P1: 'border-border bg-glass',
  P2: 'border-border bg-glass',
};

export function NudgeBanner({ spec, body, ctaLabel, onCta, onSnooze, onDismiss }: {
  spec: NudgeSpec;
  /** Data-driven copy overrides (Step 3 `resolveNudge`); fall back to the catalog. */
  body?: string;
  ctaLabel?: string;
  onCta: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -6 }}
      className={cn('rounded-2xl border p-4 flex items-start gap-3 flex-wrap', TONE[spec.priority])}
      data-nudge-id={spec.id}
    >
      <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', spec.priority === 'P0' ? 'bg-teal/15 text-teal' : 'bg-overlay text-fg-muted')}>
        {iconFor(spec)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-fg">{spec.title}</div>
        <p className="text-xs text-fg-muted mt-0.5">{body ?? spec.body}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {spec.cta && (
          <button
            type="button"
            onClick={onCta}
            className="inline-flex items-center gap-1 rounded-lg bg-teal text-ink text-xs font-bold px-3 py-1.5 hover:bg-teal-ice transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
          >
            {ctaLabel ?? spec.cta.label} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        <button type="button" onClick={onSnooze} aria-label="Remind me later" title="Remind me later" className="rounded-lg p-1.5 text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
          <Clock className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss" className="rounded-lg p-1.5 text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
