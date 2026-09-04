import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  /** `line` (default) is a rounded bar; `circle` is round; `block` is a card-sized rectangle. */
  variant?: 'line' | 'circle' | 'block';
}

/** Loading placeholder. Size it with className (w-*, h-*) to match the final layout — no layout shift. */
export function Skeleton({ className, variant = 'line' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-glass border border-border-subtle',
        variant === 'circle' ? 'rounded-full' : variant === 'block' ? 'rounded-2xl' : 'rounded-md',
        className
      )}
    />
  );
}

/** A stack of skeleton lines, handy for text blocks. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
