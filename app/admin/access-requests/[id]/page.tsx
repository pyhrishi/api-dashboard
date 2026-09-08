'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Inbox, ArrowLeft, Check, Ban, MessageSquare, HelpCircle, ShieldAlert, Wallet, Activity, KeyRound } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore, CAN } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, GlassCard, Button, StatusBadge, Skeleton, Textarea } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, REQUEST_TONE, StageBadge, PLAN_TONE, TYPE_LABEL } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import type { AccessRequest, Customer, AuditEntry } from '@/lib/admin/types';

const ACTION_ICON: Record<AccessRequest['log'][number]['action'], React.ReactNode> = { created: <Inbox className="w-3.5 h-3.5" />, comment: <MessageSquare className="w-3.5 h-3.5" />, needs_info: <HelpCircle className="w-3.5 h-3.5" />, approved: <Check className="w-3.5 h-3.5" />, denied: <Ban className="w-3.5 h-3.5" />, reopened: <Inbox className="w-3.5 h-3.5" /> };

export default function AccessRequestPage() {
  const { id } = useParams<{ id: string }>();
  const role = useStore((s) => s.operator?.role ?? 'ops');
  const toast = useToast();
  const { state, reload } = useLoad<{ request: AccessRequest; customer: Customer | null; audit: AuditEntry[] }>(`access-requests/${id}`);
  const [decision, setDecision] = useState<'approved' | 'denied' | 'needs_info' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const decide = async (reason: string) => {
    if (!decision) return;
    setBusy(true); setErr(null);
    const res = await api.post<AccessRequest>(`access-requests/${id}/decision`, { action: decision, reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('access_request_decided', { action: decision, type: res.data.type });
    toast.success(decision === 'approved' ? 'Request approved' : decision === 'denied' ? 'Request denied' : 'Marked needs info', 'Recorded in the request log and the audit trail.');
    setDecision(null); reload();
  };
  const addComment = async () => {
    if (comment.trim().length < 4) return;
    setBusy(true);
    const res = await api.post<AccessRequest>(`access-requests/${id}/comments`, { note: comment });
    setBusy(false);
    if (!res.ok) { toast.error('Comment not added', res.error.message); return; }
    track('access_request_commented', {});
    setComment(''); reload();
  };

  if (state.status === 'loading') return <div className="max-w-[1000px] mx-auto" aria-busy="true"><Skeleton className="h-8 w-80 mt-2" /><Skeleton variant="block" className="h-[240px] mt-6" /><Skeleton variant="block" className="h-[300px] mt-4" /></div>;
  if (state.status === 'error') return <div className="max-w-[1000px] mx-auto mt-6"><ErrorCard message={state.message} onRetry={reload} /></div>;
  const { request: r, customer: c } = state.data;
  const open = r.status === 'open' || r.status === 'needs_info';

  return (
    <div className="max-w-[1000px] mx-auto pb-16">
      <Link href="/admin/access-requests" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft className="w-3 h-3" /> Access requests</Link>
      <PageHeader icon={<Inbox />} title={`${TYPE_LABEL[r.type]} · ${c?.name ?? r.customerId}`} description={<span className="inline-flex items-center gap-2 flex-wrap"><StatusBadge tone={REQUEST_TONE[r.status]}>{r.status.replace('_', ' ')}</StatusBadge><span className="text-fg-muted">requested by {r.requesterEmail} · {fmt.ago(r.createdAt)}</span></span>}
        actions={open && CAN.decideAccess(role) ? <div className="flex items-center gap-2"><Button size="sm" onClick={() => { setDecision('approved'); setErr(null); }} icon={<Check className="w-4 h-4" />}>Approve</Button><Button size="sm" variant="danger" onClick={() => { setDecision('denied'); setErr(null); }} icon={<Ban className="w-4 h-4" />}>Deny</Button>{r.status === 'open' && <Button size="sm" variant="ghost" onClick={() => { setDecision('needs_info'); setErr(null); }} icon={<HelpCircle className="w-4 h-4" />}>Needs info</Button>}</div> : undefined} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">What is requested</div>
          <dl className="grid grid-cols-2 gap-2 mb-4">{Object.entries(r.payload).map(([k, v]) => <div key={k} className="rounded-xl border border-border bg-surface px-3 py-2"><dt className="text-[10px] text-fg-muted">{k}</dt><dd className="text-[12px] font-bold text-fg font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Why (requester)</div>
          <p className="text-[13px] text-fg">{r.justification}</p>
          {r.decision && <div className={`mt-4 rounded-xl border p-3 ${r.decision.action === 'approved' ? 'border-semantic-success/30 bg-semantic-success/5' : 'border-semantic-error/30 bg-semantic-error/5'}`}><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Decision</div><div className="text-[12px] text-fg mt-0.5"><span className="font-bold">{r.decision.action}</span> by {r.decision.actor} · {fmt.dateTime(r.decision.at)}</div><div className="text-[12px] text-fg-muted mt-0.5">{r.decision.reason}</div></div>}
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Risk context at request time</div>
          {c && <div className="mb-3"><CustomerLink id={c.id} name={c.name} /><div className="flex items-center gap-1.5 mt-1 flex-wrap"><StatusBadge tone={PLAN_TONE[c.plan]}>{c.plan}</StatusBadge><StageBadge stage={c.stage} /><span className="text-[11px] text-fg-muted">{c.region} · owner {c.owner}</span></div></div>}
          <ul className="space-y-1.5 text-[12px]">
            <li className="flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5 text-fg-muted" /><span className="text-fg-muted">Trial-gate conditions:</span> {r.riskContext.tripped.length ? r.riskContext.tripped.map((t) => <span key={t} className="font-mono text-[10px] rounded border border-semantic-warning/30 text-semantic-warning px-1">{t}</span>) : <span className="text-fg">none tripped</span>}</li>
            <li className="flex items-center gap-2"><Wallet className="w-3.5 h-3.5 text-fg-muted" /><span className="text-fg-muted">Wallet:</span> <span className="text-fg font-mono">{fmt.n(r.riskContext.walletBalance)}</span></li>
            <li className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-fg-muted" /><span className="text-fg-muted">Calls (7d):</span> <span className="text-fg font-mono">{fmt.n(r.riskContext.calls7d)}</span></li>
            <li className="flex items-center gap-2"><KeyRound className="w-3.5 h-3.5 text-fg-muted" /><span className="text-fg-muted">Active keys:</span> <span className="text-fg font-mono">{r.riskContext.keysActive}</span></li>
          </ul>
        </GlassCard>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <GlassCard className="p-5 mt-4">
          <h3 className="text-sm font-bold text-fg mb-3">Log</h3>
          <ol className="relative border-l border-border ml-2 space-y-3">{r.log.map((l, i) => (
            <li key={i} className="ml-4 relative">
              <span className="absolute -left-[9px] mt-0.5 w-4 h-4 rounded-full bg-surface-2 border border-border text-fg-muted flex items-center justify-center">{ACTION_ICON[l.action]}</span>
              <div className="text-[11px] text-fg-muted">{fmt.dateTime(l.at)} · <span className="text-fg font-bold">{l.actor}</span> · {l.action.replace('_', ' ')}</div>
              <div className="text-[12px] text-fg mt-0.5">{l.note}</div>
            </li>
          ))}</ol>
          <div className="mt-4 flex items-start gap-2">
            <Textarea aria-label="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add a note to the log (visible to operators; the requester gets the decision reason)." className="text-[12px] flex-1" />
            <Button size="sm" variant="secondary" onClick={addComment} loading={busy && decision === null} disabled={comment.trim().length < 4} icon={<MessageSquare className="w-4 h-4" />}>Comment</Button>
          </div>
        </GlassCard>
      </motion.div>

      <ReasonModal open={decision !== null} title={decision === 'approved' ? 'Approve this request?' : decision === 'denied' ? 'Deny this request?' : 'Ask the requester for more information?'} description={decision === 'approved' ? 'The requested change is applied by the product team and the requester is notified with your reason.' : decision === 'denied' ? 'The requester sees your reason. They can open a new request.' : 'The request stays open; your note is sent to the requester.'} confirmLabel={decision === 'approved' ? 'Approve' : decision === 'denied' ? 'Deny' : 'Send'} danger={decision === 'denied'} busy={busy} error={err} onClose={() => setDecision(null)} onConfirm={decide} />
    </div>
  );
}
