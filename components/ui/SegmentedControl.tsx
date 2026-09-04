'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Unique per instance so the sliding pill animates correctly. */
  layoutId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Tabs / toggles with a sliding active pill. */
export function SegmentedControl<V extends string>({ options, value, onChange, layoutId = 'segmented-pill', size = 'md', className }: SegmentedControlProps<V>) {
  return (
    <div role="tablist" className={cn('inline-flex bg-surface p-1 rounded-xl border border-border', className)}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative font-bold rounded-lg transition-colors disabled:opacity-40',
              size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-glass border border-border-strong"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
