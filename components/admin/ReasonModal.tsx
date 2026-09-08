'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button, Textarea } from '@/components/admin/ui';

export interface ReasonModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Label of the confirming button. */
  confirmLabel: string;
  danger?: boolean;
  /** Extra fields rendered above the reason box. */
  children?: ReactNode;
  /** Disable confirm until the caller's own fields are valid. */
  valid?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

/**
 * Every admin mutation is audit-logged with a reason. This modal captures it (4+ chars)
 * and disables confirm until it is present — the API enforces the same rule.
 */
export function ReasonModal({ open, title, description, confirmLabel, danger, children, valid = true, busy, error, onClose, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (!open) setReason(''); }, [open]);
  const ok = reason.trim().length >= 4 && valid;
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} footer={
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} size="sm" disabled={!ok} loading={busy} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </div>
    }>
      <div className="space-y-3">
        {children}
        <div>
          <label htmlFor="reason" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Reason (recorded in the audit log)</label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus={!children} placeholder="e.g. Customer request on ticket #4821 — verified with the account owner." className="text-[12px]" />
          {reason.length > 0 && reason.trim().length < 4 && <p className="text-[11px] text-semantic-warning mt-1">A few more words, please — this is what the audit reader will see.</p>}
        </div>
        {error && <p role="alert" className="text-[12px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
      </div>
    </Modal>
  );
}
