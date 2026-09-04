import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** A lucide icon element, rendered in teal next to the title. */
  icon?: ReactNode;
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode;
  className?: string;
}

/** Consistent console page header: icon + title + description, with an actions slot. */
export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6', className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
          {icon && <span className="text-teal [&>svg]:w-5 [&>svg]:h-5">{icon}</span>}
          {title}
        </h2>
        {description && <p className="text-fg-muted text-sm max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 self-start md:self-auto shrink-0">{actions}</div>}
    </div>
  );
}
