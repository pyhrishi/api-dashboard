'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, RefreshCw, Ban, EyeOff, ScrollText, ArrowRight, Globe, Radio, Repeat, Search, ShieldCheck } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, EmptyState, Skeleton, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, KeyIdentity } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { ABUSE_LABEL, type AbuseSignal, type AbuseSignalType, type AbuseSeverity, type RiskScore, type AbuseStats } from '@/lib/admin/anomaly';

interface Dismissed extends AbuseSignal { dismissedBy: string | null; dismissedReason: string | null }
interface AbuseData { signals: AbuseSignal[]; dismissed: Dismissed[]; risk: RiskScore[]; stats: AbuseStats }
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const SEV_TONE: Record<AbuseSeverity, BadgeTone> = { critical: 'error', high: 'warning', medium: 'info' };
const RISK_TONE: Record<RiskScore['level'], BadgeTone> = { high: 'error', elevated: 'warning', low: 'neutral' };
const TYPE_ICON: Record<AbuseSignalType, React.ReactNode> = { credential_sharing: <Globe className="w-3.5 h-3.5" />, impossible_travel: <Repeat className="w-3.5 h-3.5" />, call_burst: <Radio className="w-3.5 h-3.5" />, enumeration: <Search className="w-3.5 h-3.5" /> };

type Pending = { kind: 'suspend' | 'dismiss'; signal: AbuseSignal };

export default function AbusePage() {
  const toast = useToast();
  const operator = useStore((s) => s.operator);
  const canAct = operator ? ['superadmin', 'ops'].includes(operator.role) : false;
  const { state, reload } = useLoad<AbuseData>('abuse');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<AbuseSignalType | 'all'>('all');

  const d = state.status === 'ok' ? state.data : null;
  const signals = useMemo(() => (d ? d.signals.filter((s) => typeFilter === 'all' || s.type === typeFilter) : []), [d, typeFilter]);

  useMemo(() => { if (state.status === 'ok') track('abuse_viewed', { total: state.data.stats.total, critical: state.data.stats.critical }); }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (reason: string) => {
    if (!pending) return;
    setBusy(true); setErr(null);
    let res: { ok: true; data: unknown } | { ok: false; error: { message: string } };
    if (pending.kind === 'suspend') {
      res = await api.post(`keys/${pending.signal.keyId}/status`, { status: 'suspended', reason });
      if (res.ok) await api.post('abuse/dismiss', { signalId: pending.signal.id, reason: `Key suspended — ${reason}` });
    } else {
      res = await api.post('abuse/dismiss', { signalId: pending.signal.id, reason });
    }
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track(pending.kind === 'suspend' ? 'abuse_key_suspended' : 'abuse_signal_dismissed', { type: pending.signal.type });
    toast.success(pending.kind === 'suspend' ? 'Key suspended & signal cleared' : 'Signal dismissed', 'Written to the audit log.');
    setPending(null);
    reload();
  };

  const typesPresent = d ? (Object.keys(d.stats.byType) as AbuseSignalType[]) : [];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<ShieldAlert />} title="Abuse & anomaly detection" description="Behavioural abuse across every customer and key that a single threshold misses: one key used from many regions (shared credentials), the same key in two regions minutes apart (impossible travel), request bursts, and 404 enumeration. Signals roll up into a per-customer risk score; act with a suspend or dismiss, both audited." actions={
        <Button variant="secondary" size="sm" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Re-scan</Button>
      } />

      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={!d} label="Open signals" value={d ? d.stats.total : ''} icon={<ShieldAlert />} hint={d ? `${d.dismissed.length} dismissed` : ''} lowerIsBetter />
            <KpiTile loading={!d} label="Critical" value={d ? d.stats.critical : ''} icon={<Ban />} hint="shared credentials" lowerIsBetter />
            <KpiTile loading={!d} label="Customers at risk" value={d ? d.stats.customersAtRisk : ''} icon={<Globe />} hint="with ≥ 1 signal" lowerIsBetter />
            <KpiTile loading={!d} label="Highest risk score" value={d && d.risk.length ? d.risk[0].score : d ? 0 : ''} icon={<ShieldCheck />} hint={d && d.risk.length ? d.risk[0].customerName : 'of 100'} lowerIsBetter />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
            {/* Risk board */}
            <motion.div {...SECTION} transition={{ delay: 0.04 }} className="lg:col-span-1">
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Risk board</h3></div>
                {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
                  : d.risk.length === 0 ? <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No customer at risk" description="No behavioural abuse signal is open." />
                  : (
                    <ul className="space-y-2">{d.risk.map((r) => (
                      <li key={r.customerId} className="rounded-xl border border-border bg-surface px-3 py-2">
                        <div className="flex items-center justify-between gap-2"><CustomerLink id={r.customerId} name={r.customerName} /><StatusBadge tone={RISK_TONE[r.level]}>{r.level} · {r.score}</StatusBadge></div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-glass overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${r.score}%` }} transition={{ duration: 0.5 }} className={`h-full rounded-full ${r.level === 'high' ? 'bg-semantic-error' : r.level === 'elevated' ? 'bg-semantic-warning' : 'bg-teal'}`} /></div>
                        <div className="text-[10px] text-fg-muted mt-1">{r.signals} signal{r.signals === 1 ? '' : 's'} · {r.types.map((t) => ABUSE_LABEL[t]).join(', ')}</div>
                      </li>
                    ))}</ul>
                  )}
              </GlassCard>
            </motion.div>

            {/* Signals */}
            <motion.div {...SECTION} transition={{ delay: 0.06 }} className="lg:col-span-2">
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap"><ShieldAlert className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Signals</h3>
                  <div className="ml-auto flex items-center gap-1 flex-wrap">
                    <button type="button" onClick={() => setTypeFilter('all')} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${typeFilter === 'all' ? 'bg-teal/10 text-teal' : 'text-fg-muted hover:text-fg'}`}>All</button>
                    {typesPresent.map((t) => <button key={t} type="button" onClick={() => setTypeFilter(t)} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${typeFilter === t ? 'bg-teal/10 text-teal' : 'text-fg-muted hover:text-fg'}`}>{TYPE_ICON[t]} {ABUSE_LABEL[t]}</button>)}
                  </div>
                </div>
                {!d ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                  : signals.length === 0 ? <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title={d.stats.total === 0 ? 'No abuse detected' : 'None of this type'} description={d.stats.total === 0 ? 'No key is shared across regions, bursting, travelling impossibly, or enumerating records.' : 'Clear the filter to see the rest.'} />
                  : (
                    <ul className="space-y-2">
                      <AnimatePresence initial={false}>
                        {signals.map((sig) => (
                          <motion.li key={sig.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`rounded-xl border bg-surface p-3 ${sig.severity === 'critical' ? 'border-semantic-error/40' : 'border-border'}`}>
                            <div className="flex items-start gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <StatusBadge tone={SEV_TONE[sig.severity]}>{sig.severity}</StatusBadge>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-fg-muted">{TYPE_ICON[sig.type]} {ABUSE_LABEL[sig.type]}</span>
                                  <span className="text-[13px] font-bold text-fg">{sig.title}</span>
                                  <CustomerLink id={sig.customerId} name={sig.customerName} />
                                </div>
                                <div className="text-[11px] text-fg-muted">{sig.evidence}</div>
                                <div className="mt-1"><KeyIdentity prefix={sig.keyPrefix} last4={sig.keyLast4} fingerprint={sig.keyFingerprint} name={sig.keyName} /></div>
                                <div className="text-[10px] text-fg-subtle mt-0.5">detected {fmt.ago(sig.detectedAt)} · {sig.windowHours}h window</div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                <Link href={`/admin/ledger?customer=${sig.customerId}`} className="inline-flex items-center gap-1 rounded-lg border border-border bg-glass px-2 py-1 text-[11px] font-bold text-fg-muted hover:text-teal hover:border-teal/40 transition-colors"><ScrollText className="w-3.5 h-3.5" /> Ledger</Link>
                                {canAct && <Button size="sm" variant="danger" onClick={() => { setErr(null); setPending({ kind: 'suspend', signal: sig }); }} icon={<Ban className="w-3.5 h-3.5" />}>Suspend key</Button>}
                                {canAct && <Button size="sm" variant="ghost" onClick={() => { setErr(null); setPending({ kind: 'dismiss', signal: sig }); }} icon={<EyeOff className="w-3.5 h-3.5" />}>Dismiss</Button>}
                              </div>
                            </div>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                {!canAct && d && d.stats.total > 0 && <p className="text-[11px] text-fg-muted mt-3">Your role can review abuse signals and open the ledger. Suspending a key or dismissing a signal is for ops or a super admin.</p>}
              </GlassCard>
            </motion.div>
          </div>

          {/* Dismissed */}
          {d && d.dismissed.length > 0 && (
            <motion.div {...SECTION} transition={{ delay: 0.12 }}>
              <GlassCard className="p-5 mt-5">
                <div className="flex items-center gap-2 mb-3"><EyeOff className="w-4 h-4 text-fg-muted" /><h3 className="text-sm font-bold text-fg">Dismissed signals</h3></div>
                <ul className="space-y-1.5">{d.dismissed.map((sig) => (
                  <li key={sig.id} className="flex items-center gap-2 text-[12px] flex-wrap">
                    <StatusBadge tone="neutral">{ABUSE_LABEL[sig.type]}</StatusBadge>
                    <CustomerLink id={sig.customerId} name={sig.customerName} />
                    <span className="text-fg-subtle text-[11px]">· {sig.title} · dismissed by {sig.dismissedBy ?? '—'}{sig.dismissedReason ? ` — “${sig.dismissedReason}”` : ''}</span>
                  </li>
                ))}</ul>
              </GlassCard>
            </motion.div>
          )}

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link href="/admin/alerts" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Operational alerts <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/tokens" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Tokens <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/audit" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Audit log <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </>
      )}

      <ReasonModal
        open={pending !== null}
        title={pending?.kind === 'suspend' ? 'Suspend key & clear signal' : 'Dismiss signal'}
        description={pending ? `${pending.signal.title} · ${pending.signal.customerName} · ${pending.signal.keyName}` : undefined}
        confirmLabel={pending?.kind === 'suspend' ? 'Suspend key' : 'Dismiss'}
        danger={pending?.kind === 'suspend'}
        busy={busy} error={err} onClose={() => { setPending(null); setErr(null); }} onConfirm={run}
      >
        {pending?.kind === 'suspend'
          ? <p className="text-[12px] text-fg-muted">The key stops authenticating immediately and this signal is cleared. Reversible from Tokens.</p>
          : <p className="text-[12px] text-fg-muted">Dismissing keeps the record but removes the signal from the active list. Use it for a known, legitimate pattern.</p>}
      </ReasonModal>
    </div>
  );
}
