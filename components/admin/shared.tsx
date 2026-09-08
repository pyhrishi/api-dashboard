'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, EmptyState, StatusBadge, type BadgeTone } from '@/components/admin/ui';
import type { FunnelStage, KeyStatus, Plan, WalletLabel, AccessRequestStatus, HandoffState, AccessRequestType } from '@/lib/admin/types';
import { STAGE_LABEL } from '@/lib/admin/types';

export const STAGE_TONE: Record<FunnelStage, BadgeTone> = { signed_up: 'neutral', activated: 'info', integrated: 'info', paying: 'success', expanding: 'teal', churned: 'error' };
export const PLAN_TONE: Record<Plan, BadgeTone> = { Trial: 'warning', Starter: 'neutral', Growth: 'info', Enterprise: 'teal' };
export const KEY_STATUS_TONE: Record<KeyStatus, BadgeTone> = { active: 'success', suspended: 'warning', revoked: 'error' };
export const WALLET_TONE: Record<WalletLabel, BadgeTone> = { early: 'warning', on_track: 'success', delayed: 'info', exhausted: 'error', idle: 'neutral' };
export const WALLET_LABEL: Record<WalletLabel, string> = { early: 'exhausts early', on_track: 'on track', delayed: 'delayed', exhausted: 'at zero', idle: 'idle' };
export const REQUEST_TONE: Record<AccessRequestStatus, BadgeTone> = { open: 'warning', needs_info: 'info', approved: 'success', denied: 'error' };
export const HANDOFF_TONE: Record<HandoffState, BadgeTone> = { new: 'teal', contacted: 'info', converted: 'success', closed: 'neutral' };
export const TYPE_LABEL: Record<AccessRequestType, string> = { live_key: 'Live key', limit_increase: 'Limit increase', region: 'Data region', enterprise_feature: 'Enterprise feature', trial_gate_override: 'Trial-gate override' };

export function StageBadge({ stage }: { stage: FunnelStage }) { return <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>; }

export function CustomerLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/admin/customers/${id}`} className="text-[12px] font-bold text-fg hover:text-teal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">{name}</Link>;
}

/** `sk_live_••••a4b1 · sha256:…` — the only way a key is ever shown. */
export function KeyIdentity({ prefix, last4, fingerprint, name }: { prefix: string; last4: string; fingerprint: string; name?: string }) {
  return (
    <div className="min-w-0">
      {name && <div className="text-[12px] font-bold text-fg truncate">{name}</div>}
      <div className="font-mono text-[11px] text-fg-muted truncate">{prefix}••••{last4} <span className="text-fg-subtle">· {fingerprint}</span></div>
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load from the admin API" description={message} action={<Button size="sm" variant="secondary" onClick={onRetry} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>} />;
}
