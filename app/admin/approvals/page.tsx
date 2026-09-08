'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, RefreshCw, Plus, Check, X, ShieldQuestion, ArrowRight, Clock, Coins, Gauge, Trash2 } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, EmptyState, Skeleton, Select, Input, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { CHANGE_POLICY, CHANGE_KINDS, summarizeChange, type PendingChange, type ChangeKind, type ChangeStatus, type ApprovalStats } from '@/lib/admin/approvals';
import type { Customer, ManagedKey } from '@/lib/admin/types';

interface ApprovalsData { changes: PendingChange[]; stats: ApprovalStats }
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const STATUS_TONE: Record<ChangeStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'error', expired: 'neutral' };
const KIND_ICON: Record<ChangeKind, React.ReactNode> = { grant_credits: <Coins className="w-3.5 h-3.5" />, raise_limit: <Gauge className="w-3.5 h-3.5" />, delete_key: <Trash2 className="w-3.5 h-3.5" /> };

export default function ApprovalsPage() {
  const toast = useToast();
  const operator = useStore((s) => s.operator);
  const role = operator?.role;
  const { state, reload } = useLoad<ApprovalsData>('approvals');
  const { state: custState } = useLoad<Customer[]>('customers');
  const customers = custState.status === 'ok' ? custState.data : [];

  const [decide, setDecide] = useState<{ change: PendingChange; decision: 'approve' | 'reject' } | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Submit form
  const [kind, setKind] = useState<ChangeKind>('grant_credits');
  const [customerId, setCustomerId] = useState('');
  const [keyId, setKeyId] = useState('');
  const [amount, setAmount] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [keys, setKeys] = useState<ManagedKey[]>([]);
  const needsKey = CHANGE_POLICY[kind].needsKey;

  useEffect(() => {
    if (!needsKey || !customerId) { setKeys([]); return; }
    let cancelled = false;
    api.get<ManagedKey[]>(`keys?customer=${customerId}`).then((r) => { if (!cancelled && r.ok) setKeys(r.data.filter((k) => k.status !== 'revoked')); });
    return () => { cancelled = true; };
  }, [needsKey, customerId]);

  const d = state.status === 'ok' ? state.data : null;
  const pending = useMemo(() => (d ? d.changes.filter((c) => c.status === 'pending') : []), [d]);
  const history = useMemo(() => (d ? d.changes.filter((c) => c.status !== 'pending').slice(0, 12) : []), [d]);
  const canSubmit = role ? CHANGE_POLICY[kind].submitRoles.includes(role) : false;
  const submitRoleOk = role ? CHANGE_KINDS.some((k) => CHANGE_POLICY[k].submitRoles.includes(role)) : false;

  useMemo(() => { if (state.status === 'ok') track('approvals_viewed', { pending: state.data.stats.pending }); }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const formValid = Boolean(customerId) && canSubmit && (needsKey ? Boolean(keyId) : true) && (kind === 'grant_credits' ? Number(amount) > 0 : kind === 'raise_limit' ? Number(creditLimit) > 0 : true);

  const submit = async (reason: string) => {
    setBusy(true); setErr(null);
    const payload = kind === 'grant_credits' ? { amount: Number(amount) } : kind === 'raise_limit' ? { creditLimit: Number(creditLimit) } : {};
    const res = await api.post('approvals/submit', { kind, customerId, keyId: needsKey ? keyId : null, payload, reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('change_submitted', { kind });
    toast.success('Change requested', 'It needs a second, different operator to approve.');
    setSubmitOpen(false); setAmount(''); setCreditLimit(''); setKeyId(''); setCustomerId('');
    reload();
  };

  const runDecision = async (reason: string) => {
    if (!decide) return;
    setBusy(true); setErr(null);
    const res = await api.post(`approvals/${decide.change.id}/decision`, { decision: decide.decision, reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track(decide.decision === 'approve' ? 'change_approved' : 'change_rejected', { kind: decide.change.kind });
    toast.success(decide.decision === 'approve' ? 'Change approved & applied' : 'Change rejected', 'Written to the audit log.');
    setDecide(null);
    reload();
  };

  const canDecide = (c: PendingChange) => Boolean(role && CHANGE_POLICY[c.kind].approveRoles.includes(role));
  const isMaker = (c: PendingChange) => operator?.email === c.requestedBy;

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader icon={<CheckCheck />} title="Approvals" description="The highest-risk changes — granting credits, raising a limit, deleting a key — need a second, different operator to approve. A maker requests with a reason; a checker approves or rejects; only then does the change run. Four-eyes, always audited." actions={
        submitRoleOk ? <Button size="sm" onClick={() => { setErr(null); setSubmitOpen(true); }} icon={<Plus className="w-4 h-4" />}>Request a change</Button> : undefined
      } />

      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={!d} label="Pending" value={d ? d.stats.pending : ''} icon={<ShieldQuestion />} hint="awaiting a checker" />
            <KpiTile loading={!d} label="Approved" value={d ? d.stats.approved : ''} icon={<Check />} hint="applied" />
            <KpiTile loading={!d} label="Rejected" value={d ? d.stats.rejected : ''} icon={<X />} hint="declined" />
            <KpiTile loading={!d} label="Kinds governed" value={CHANGE_KINDS.length} icon={<CheckCheck />} hint="grant · limit · delete" />
          </motion.div>

          {/* Pending queue */}
          <motion.div {...SECTION} transition={{ delay: 0.05 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap"><ShieldQuestion className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Awaiting approval</h3>{d && <StatusBadge tone="neutral">{pending.length}</StatusBadge>}<span className="ml-auto"><Button variant="ghost" size="sm" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button></span></div>
              {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                : pending.length === 0 ? <EmptyState icon={<CheckCheck className="w-8 h-8" />} title="Nothing to approve" description="No high-risk change is waiting on a checker." />
                : (
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {pending.map((c) => {
                        const mine = isMaker(c);
                        const decidable = canDecide(c) && !mine;
                        return (
                          <motion.li key={c.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-surface p-3">
                            <div className="flex items-start gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-fg-muted">{KIND_ICON[c.kind]} {CHANGE_POLICY[c.kind].label}</span>
                                  <span className="text-[13px] font-bold text-fg">{summarizeChange(c)}</span>
                                  <CustomerLink id={c.customerId} name={c.customerName} />
                                </div>
                                <div className="text-[11px] text-fg-muted">“{c.reason}”</div>
                                <div className="text-[10px] text-fg-subtle mt-1">requested by {c.requestedBy} ({c.requestedByRole}) · {fmt.ago(c.requestedAt)} · expires {fmt.inDays(c.expiresAt)}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {mine ? <StatusBadge tone="neutral">you requested this</StatusBadge>
                                  : !canDecide(c) ? <StatusBadge tone="neutral">{CHANGE_POLICY[c.kind].approveRoles.join(' / ')} approves</StatusBadge>
                                  : (
                                    <>
                                      <Button size="sm" variant="secondary" disabled={!decidable} onClick={() => { setErr(null); setDecide({ change: c, decision: 'approve' }); }} icon={<Check className="w-3.5 h-3.5" />}>Approve</Button>
                                      <Button size="sm" variant="ghost" disabled={!decidable} onClick={() => { setErr(null); setDecide({ change: c, decision: 'reject' }); }} icon={<X className="w-3.5 h-3.5" />}>Reject</Button>
                                    </>
                                  )}
                              </div>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
            </GlassCard>
          </motion.div>

          {/* History */}
          {history.length > 0 && (
            <motion.div {...SECTION} transition={{ delay: 0.1 }}>
              <GlassCard className="p-5 mt-5">
                <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-fg-muted" /><h3 className="text-sm font-bold text-fg">Decided</h3></div>
                <ul className="space-y-1.5">{history.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-[12px] flex-wrap">
                    <StatusBadge tone={STATUS_TONE[c.status]}>{c.status}</StatusBadge>
                    <span className="text-fg">{summarizeChange(c)}</span>
                    <span className="text-fg-subtle text-[11px]">· {c.decidedBy ? `by ${c.decidedBy}` : ''} {c.decidedAt ? fmt.ago(c.decidedAt) : ''}{c.appliedResult ? ` — ${c.appliedResult}` : ''}</span>
                  </li>
                ))}</ul>
              </GlassCard>
            </motion.div>
          )}

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link href="/admin/wallets" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Wallets <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/tokens" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Tokens <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/audit" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Audit log <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </>
      )}

      {/* Submit a change */}
      <ReasonModal
        open={submitOpen} title="Request a high-risk change" description="Someone else will approve it before it runs."
        confirmLabel="Submit for approval" valid={formValid} busy={busy} error={err}
        onClose={() => { setSubmitOpen(false); setErr(null); }} onConfirm={submit}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Change</label>
            <Select aria-label="Change kind" value={kind} onChange={(e) => { setKind(e.target.value as ChangeKind); setKeyId(''); }} className="text-[12px]">{CHANGE_KINDS.map((k) => <option key={k} value={k} disabled={!(role && CHANGE_POLICY[k].submitRoles.includes(role))}>{CHANGE_POLICY[k].label}{role && !CHANGE_POLICY[k].submitRoles.includes(role) ? ' (not your role)' : ''}</option>)}</Select>
            <p className="text-[11px] text-fg-muted mt-1">{CHANGE_POLICY[kind].description} Approved by {CHANGE_POLICY[kind].approveRoles.join(' or ')}.</p>
          </div>
          <div className={needsKey ? '' : 'col-span-2'}>
            <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Customer</label>
            <Select aria-label="Customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setKeyId(''); }} className="text-[12px]"><option value="">Select…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </div>
          {needsKey && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Key</label>
              <Select aria-label="Key" value={keyId} onChange={(e) => setKeyId(e.target.value)} disabled={!customerId} className="text-[12px]"><option value="">{customerId ? 'Select a key…' : 'Pick a customer first'}</option>{keys.map((k) => <option key={k.id} value={k.id}>{k.name} · {k.prefix}••••{k.last4}</option>)}</Select>
            </div>
          )}
          {kind === 'grant_credits' && (
            <div className="col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Credits to grant</label><Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" mono className="text-[12px]" /></div>
          )}
          {kind === 'raise_limit' && (
            <div className="col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">New per-key credit limit</label><Input type="number" min={1} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="250000" mono className="text-[12px]" /></div>
          )}
        </div>
      </ReasonModal>

      {/* Decide */}
      <ReasonModal
        open={decide !== null}
        title={decide?.decision === 'approve' ? 'Approve & apply change' : 'Reject change'}
        description={decide ? summarizeChange(decide.change) : undefined}
        confirmLabel={decide?.decision === 'approve' ? 'Approve & apply' : 'Reject'} danger={decide?.decision === 'reject'}
        busy={busy} error={err} onClose={() => { setDecide(null); setErr(null); }} onConfirm={runDecision}
      >
        {decide?.decision === 'approve' && <p className="text-[12px] text-fg-muted">Approving runs the change immediately: {summarizeChange(decide.change).toLowerCase()}.</p>}
      </ReasonModal>
    </div>
  );
}
