'use client';

import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Portal } from '@/components/Portal';
import { cn } from '@/lib/utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
}

/** Right-side slide-in panel. Esc and backdrop close it; body scroll is locked while open. */
export function Drawer({ open, onClose, title, description, children, footer, widthClass = 'max-w-lg' }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.aside
              role="dialog" aria-modal="true"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className={cn('relative h-full w-full bg-surface border-l border-border shadow-2xl flex flex-col', widthClass)}
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
              <div className="flex-1 overflow-y-auto p-6">{children}</div>
              {footer && <div className="p-6 border-t border-border bg-surface-2/50">{footer}</div>}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
