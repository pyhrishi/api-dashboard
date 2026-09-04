'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  description?: string;
  variant: ToastVariant;
  duration?: number; // ms, default 4000
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toast: (opts: Omit<Toast, 'id'>) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
  error:   <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
  info:    <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />,
};

const STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/20 shadow-emerald-500/10',
  error:   'border-red-500/20 shadow-red-500/10',
  warning: 'border-amber-500/20 shadow-amber-500/10',
  info:    'border-blue-500/20 shadow-blue-500/10',
};

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.92, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'relative w-80 bg-surface-2 border rounded-xl shadow-2xl overflow-hidden',
        STYLES[toast.variant]
      )}
    >
      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1, originX: 0 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: duration / 1000, ease: 'linear' }}
        className={cn(
          'absolute bottom-0 left-0 h-[2px] w-full origin-left',
          toast.variant === 'success' ? 'bg-emerald-500' :
          toast.variant === 'error'   ? 'bg-red-500' :
          toast.variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
        )}
      />

      <div className="p-4 flex items-start gap-3">
        <div className="mt-0.5">{ICONS[toast.variant]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-fg leading-snug">{toast.message}</p>
          {toast.description && (
            <p className="text-xs text-fg-muted mt-0.5 leading-relaxed">{toast.description}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-bold text-teal hover:text-teal-ice transition-colors"
            >
              {toast.action.label} →
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-fg-subtle hover:text-fg transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Provider + Portal ────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { ...opts, id }]); // max 5 at once
  }, []);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (message, description) => addToast({ variant: 'success', message, description }),
    error:   (message, description) => addToast({ variant: 'error',   message, description }),
    warning: (message, description) => addToast({ variant: 'warning', message, description }),
    info:    (message, description) => addToast({ variant: 'info',    message, description }),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast Portal */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
