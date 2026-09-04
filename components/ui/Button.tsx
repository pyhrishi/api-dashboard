'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-teal text-ink hover:bg-teal-ice shadow-[0_0_20px_-8px_rgba(70,189,198,0.6)]',
  secondary: 'bg-glass border border-border text-fg hover:bg-surface-2 hover:border-border-strong',
  ghost: 'text-fg-muted hover:text-fg hover:bg-glass',
  danger: 'bg-semantic-error/10 border border-semantic-error/30 text-semantic-error hover:bg-semantic-error/20',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5',
  md: 'text-sm px-4 py-2.5 rounded-xl gap-2 [&>svg]:w-4 [&>svg]:h-4',
  lg: 'text-sm px-5 py-3 rounded-xl gap-2 [&>svg]:w-4 [&>svg]:h-4',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button; keeps width stable. */
  loading?: boolean;
  icon?: ReactNode;
}

/** The one button. Variants + sizes + a loading state that never layout-shifts. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, ...rest }, ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
        VARIANT[variant], SIZE[size], className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
});
