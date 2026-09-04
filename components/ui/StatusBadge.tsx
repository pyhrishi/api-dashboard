import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'teal' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  success: 'bg-semantic-success/10 text-semantic-success border-semantic-success/20',
  warning: 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20',
  error: 'bg-semantic-error/10 text-semantic-error border-semantic-error/20',
  info: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  teal: 'bg-teal/15 text-teal border-teal/30',
  neutral: 'bg-glass text-fg-muted border-border',
};

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Show a small status dot before the label. */
  dot?: boolean;
  /** Pulse the dot — for "live" states. */
  pulse?: boolean;
  className?: string;
}

/** Small uppercase status pill. */
export function StatusBadge({ tone = 'neutral', children, dot = false, pulse = false, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border whitespace-nowrap',
      TONE[tone], className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />}
      {children}
    </span>
  );
}
