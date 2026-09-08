'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { track } from '@/lib/telemetry';

export interface ConfirmActionProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  /** Runs on the second (confirming) click. */
  onConfirm: () => void | Promise<void>;
  /** Idle label. */
  children: ReactNode;
  /** Label shown while awaiting the confirming click. */
  confirmLabel?: ReactNode;
  /** Ms before the armed state resets. */
  timeoutMs?: number;
  /**
   * Stable id for the destructive-action telemetry (`destructive_action_confirmed`,
   * the numerator of the health KPI "destructive-action incident rate"). Defaults to
   * the idle label when it is plain text.
   */
  actionId?: string;
}

/**
 * Two-click confirmation for destructive/irreversible actions — no modal needed.
 * First click arms it (turns danger + swaps label); second click within the window confirms.
 * Every confirmed action is counted for the Growth health KPIs.
 */
export function ConfirmAction({ onConfirm, children, confirmLabel = 'Click again to confirm', timeoutMs = 3000, variant = 'secondary', actionId, ...rest }: ConfirmActionProps) {
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
    const ariaLabel = typeof rest['aria-label'] === 'string' ? rest['aria-label'] : undefined;
    const label = typeof children === 'string' ? children : ariaLabel;
    const action = actionId ?? (label ? label.trim().toLowerCase().replace(/\s+/g, '_') : 'unnamed');
    let ok = true;
    try { await onConfirm(); } catch (err) { ok = false; throw err; } finally {
      // Counted after the action ran, with whether it succeeded — a thrown action is not a confirmed one.
      track('destructive_action_confirmed', { action, ok });
      setBusy(false); setArmed(false);
    }
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
