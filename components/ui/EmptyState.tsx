import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** A lucide icon element; defaults to an inbox. */
  icon?: ReactNode;
  /** The next action — a Button or Link. */
  action?: ReactNode;
  /** `error` tone for failure states. */
  tone?: 'neutral' | 'error';
  className?: string;
}

/** Never leave a screen blank: icon + why it's empty + the next action. */
export function EmptyState({ title, description, icon, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center py-14 px-6 bg-surface-2 border rounded-2xl',
      tone === 'error' ? 'border-semantic-error/30' : 'border-border',
      className
    )}>
      <div className={cn('mb-3 [&>svg]:w-10 [&>svg]:h-10', tone === 'error' ? 'text-semantic-error' : 'text-fg-subtle')}>
        {icon ?? <Inbox />}
      </div>
      <p className="text-fg font-bold">{title}</p>
      {description && <p className="text-fg-muted text-sm mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
