'use client';

import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Portal } from '@/components/Portal';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

/** Centered dialog. Esc and backdrop close it. */
export function Modal({ open, onClose, title, description, children, footer, widthClass = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              role="dialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={cn('relative w-full bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden', widthClass)}
            >
              <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-fg">{title}</h3>
                  {description && <p className="text-sm text-fg-muted mt-1">{description}</p>}
                </div>
                <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-glass transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">{children}</div>
              {footer && <div className="p-6 border-t border-border bg-surface-2/50 flex justify-end gap-3">{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
