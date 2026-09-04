'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type Padding = 'none' | 'sm' | 'md' | 'lg';
const PAD: Record<Padding, string> = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  padding?: Padding;
  /** Lift + glow on hover; use for clickable cards. */
  interactive?: boolean;
  /** Teal ring + glow to mark the selected/active card. */
  selected?: boolean;
  children?: React.ReactNode;
}

/** The base surface for the console: glass panel, rounded-2xl, token-themed. */
export function GlassCard({ padding = 'md', interactive = false, selected = false, className, children, ...rest }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={interactive ? { y: -2 } : undefined}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'bg-surface-2 border rounded-2xl',
        PAD[padding],
        selected
          ? 'border-teal/40 shadow-[0_0_30px_-10px_rgba(70,189,198,0.45)]'
          : 'border-border',
        interactive && 'cursor-pointer transition-colors hover:border-border-strong',
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
