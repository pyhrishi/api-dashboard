'use client';

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error wrapper. Pair with <Input> / <Select>. */
export function Field({ label, hint, error, required, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-[10px] font-black uppercase tracking-widest text-fg-muted">
        {label}{required && <span className="text-teal ml-1">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-semantic-error flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL = 'w-full bg-glass border rounded-xl py-2.5 px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/30 transition-all disabled:opacity-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, mono, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid ? 'border-semantic-error/50' : 'border-border', mono && 'font-mono', className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'appearance-none cursor-pointer', invalid ? 'border-semantic-error/50' : 'border-border', className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, mono, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'resize-y min-h-[80px]', invalid ? 'border-semantic-error/50' : 'border-border', mono && 'font-mono', className)}
      {...rest}
    />
  );
});
