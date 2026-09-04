'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

export interface ConfirmActionProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  /** Runs on the second (confirming) click. */
  onConfirm: () => void | Promise<void>;
  /** Idle label. */
  children: ReactNode;
  /** Label shown while awaiting the confirming click. */
  confirmLabel?: ReactNode;
  /** Ms before the armed state resets. */
  timeoutMs?: number;
}

/**
 * Two-click confirmation for destructive/irreversible actions — no modal needed.
 * First click arms it (turns danger + swaps label); second click within the window confirms.
 */
export function ConfirmAction({ onConfirm, children, confirmLabel = 'Click again to confirm', timeoutMs = 3000, variant = 'secondary', ...rest }: ConfirmActionProps) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), timeoutMs);
    return () => clearTimeout(t);
  }, [armed, timeoutMs]);

  const handleClick = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };

  return (
    <Button
      {...rest}
      variant={armed ? 'danger' : variant}
      loading={busy}
      onClick={handleClick}
      aria-live="polite"
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
