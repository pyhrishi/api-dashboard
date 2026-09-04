'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Percent change; positive renders green, negative red. */
  trend?: number;
  /** Set when a *lower* number is better (latency, errors) so colors invert. */
  lowerIsBetter?: boolean;
  hint?: string;
  loading?: boolean;
  className?: string;
}

/** A single KPI card: label, big value, optional trend + hint. */
export function KpiTile({ label, value, icon, trend, lowerIsBetter = false, hint, loading = false, className }: KpiTileProps) {
  const good = trend !== undefined && (lowerIsBetter ? trend < 0 : trend > 0);
  const bad = trend !== undefined && trend !== 0 && !good;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('bg-surface-2 border border-border rounded-2xl p-5', className)}
    >
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-fg-muted mb-3">
        {icon && <span className="text-teal [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="text-2xl font-extrabold text-fg tabular-nums">{value}</div>
          {trend !== undefined && (
            <div className={cn(
              'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border',
              good && 'text-semantic-success bg-semantic-success/10 border-semantic-success/20',
              bad && 'text-semantic-error bg-semantic-error/10 border-semantic-error/20',
              !good && !bad && 'text-fg-muted bg-glass border-border-subtle'
            )}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </div>
          )}
        </div>
      )}
      {hint && !loading && <p className="text-xs text-fg-subtle mt-2">{hint}</p>}
    </motion.div>
  );
}
