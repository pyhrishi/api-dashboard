'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, RefreshCw, Check, BellOff, CheckCheck, Clock, ArrowRight, KeyRound, Wallet, ScrollText, Building2, AlertTriangle,
  Radio, SlidersHorizontal, PhoneCall, MessageSquare, Mail,
} from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, EmptyState, Skeleton, Select, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import {
  TEAM_LABEL, CHANNEL_LABEL,
  type Alert, type AlertRule, type AlertStats, type AlertSeverity, type AlertTeam, type AlertChannel, type AlertActionRef,
} from '@/lib/admin/alerts';

interface AlertsData { alerts: Alert[]; rules: AlertRule[]; stats: AlertStats }
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const SEV_TONE: Record<AlertSeverity, BadgeTone> = { critical: 'error', warning: 'warning', info: 'info' };
const STATE_TONE: Record<Alert['state'], BadgeTone> = { firing: 'error', acked: 'warning', snoozed: 'neutral', resolved: 'success' };
const CHANNEL_ICON: Record<AlertChannel, React.ReactNode> = { pagerduty: <PhoneCall className="w-3 h-3" />, slack: <MessageSquare className="w-3 h-3" />, email: <Mail className="w-3 h-3" /> };
const ACTION_ICON: Record<AlertActionRef['id'], React.ReactNode> = { open_customer: <Building2 className="w-3.5 h-3.5" />, open_wallet: <Wallet className="w-3.5 h-3.5" />, open_ledger: <ScrollText className="w-3.5 h-3.5" />, extend_key: <KeyRound className="w-3.5 h-3.5" /> };

type Pending =
  | { kind: 'ack'; alert: Alert }
  | { kind: 'resolve'; alert: Alert }
  | { kind: 'snooze'; alert: Alert }
  | { kind: 'extend'; alert: Alert; keyId: string }
  | { kind: 'rule'; rule: AlertRule; patch: Partial<AlertRule> };

export default function AlertsPage() {
  const router = useRouter();
  const toast = useToast();
  const operator = useStore((s) => s.operator);
  const canAct = operator ? ['superadmin', 'ops', 'finance'].includes(operator.role) : false;
  const { state, reload } = useLoad<AlertsData>('alerts');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [snoozeHours, setSnoozeHours] = useState(24);
  const [evaluating, setEvaluating] = useState(false);

  const d = state.status === 'ok' ? state.data : null;
  const open = useMemo(() => (d ? d.alerts.filter((a) => a.state === 'firing' || a.state === 'acked' || (a.state === 'snoozed' && a.snoozedUntil && Date.parse(a.snoozedUntil) > Date.now())) : []), [d]);
  const resolved = useMemo(() => (d ? d.alerts.filter((a) => a.state === 'resolved').slice(0, 8) : []), [d]);

  const evaluate = async () => {
    setEvaluating(true);
    const res = await api.post<Alert[]>('alerts/evaluate', {});
    setEvaluating(false);
    if (!res.ok) { toast.error('Could not evaluate', res.error.message); return; }
    track('alerts_evaluated', { created: res.data.length });
    toast[res.data.length ? 'info' : 'success'](res.data.length ? `${res.data.length} new alert${res.data.length === 1 ? '' : 's'}` : 'No new alerts', res.data.length ? 'Routed to the owning teams.' : 'Everything already tracked.');
    reload();
  };

  const run = async (reason: string) => {
    if (!pending) return;
    setBusy(true); setErr(null);
    let res: { ok: true; data: unknown } | { ok: false; error: { message: string } };
    if (pending.kind === 'ack') res = await api.post(`alerts/${pending.alert.id}/ack`, { reason });
    else if (pending.kind === 'resolve') res = await api.post(`alerts/${pending.alert.id}/resolve`, { reason });
    else if (pending.kind === 'snooze') res = await api.post(`alerts/${pending.alert.id}/snooze`, { hours: snoozeHours, reason });
    else if (pending.kind === 'extend') {
      const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
      res = await api.patch(`keys/${pending.keyId}`, { patch: { expiresAt }, reason });
      if (res.ok) { await api.post(`alerts/${pending.alert.id}/resolve`, { reason: `Key extended 90 days — ${reason}` }); }
    } else {
      res = await api.patch(`alert-rules/${pending.rule.id}`, { patch: pending.patch, reason });
    }
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    if (pending.kind === 'ack') track('alert_acked', { kind: pending.alert.kind });
    else if (pending.kind === 'resolve') track('alert_resolved', { kind: pending.alert.kind });
    else if (pending.kind === 'snooze') track('alert_snoozed', { kind: pending.alert.kind, hours: snoozeHours });
    else if (pending.kind === 'extend') track('alert_action_taken', { action: 'extend_key' });
    else track('alert_rule_updated', { rule: pending.rule.kind });
    toast.success(
      pending.kind === 'rule' ? 'Rule updated' : pending.kind === 'extend' ? 'Key extended 90 days' : `Alert ${pending.kind === 'ack' ? 'acknowledged' : pending.kind === 'resolve' ? 'resolved' : 'snoozed'}`,
      'Written to the audit log.',
    );
    setPending(null);
    reload();
  };

  const act = (a: Alert, ref: AlertActionRef) => {
    if (ref.id === 'extend_key' && ref.keyId) { if (!canAct) { toast.error('Not allowed', 'Ops or finance can act on alerts.'); return; } setErr(null); setPending({ kind: 'extend', alert: a, keyId: ref.keyId }); return; }
    if (ref.href) { track('alert_action_taken', { action: ref.id }); router.push(ref.href); }
  };

  useMemo(() => { if (state.status === 'ok') track('alerts_viewed', { firing: state.data.stats.firing, critical: state.data.stats.critical }); }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<Siren />} title="Operational alerts" description="The signals this console already computes — wallets at zero, keys expiring on live traffic, error, latency and spend spikes — raised as routed, actionable alerts. Each one names the owning team and channel, carries its evidence, and can be acknowledged, snoozed or resolved with a reason." actions={
        <Button variant="secondary" size="sm" onClick={evaluate} loading={evaluating} icon={<RefreshCw className="w-4 h-4" />}>Evaluate now</Button>
      } />

      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={!d} label="Firing" value={d ? d.stats.firing : ''} icon={<Radio />} hint={d ? `${d.stats.acked} acknowledged` : ''} lowerIsBetter />
            <KpiTile loading={!d} label="Critical open" value={d ? d.stats.critical : ''} icon={<Siren />} hint="page-worthy" lowerIsBetter />
            <KpiTile loading={!d} label="Warnings open" value={d ? d.stats.warning : ''} icon={<AlertTriangle />} hint="watch list" lowerIsBetter />
            <KpiTile loading={!d} label="Resolved (24h)" value={d ? d.stats.resolved24h : ''} icon={<CheckCheck />} hint={d ? `${d.stats.snoozed} snoozed` : ''} />
          </motion.div>

          {d && (
            <motion.div {...SECTION} transition={{ delay: 0.03 }} className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
              <span className="font-bold text-fg">Routing right now:</span>
              {(['ops', 'finance', 'sales'] as AlertTeam[]).map((t) => <StatusBadge key={t} tone={d.stats.byTeam[t] ? 'warning' : 'neutral'}>{TEAM_LABEL[t]} · {d.stats.byTeam[t]}</StatusBadge>)}
            </motion.div>
          )}

          {/* Open alerts */}
          <motion.div {...SECTION} transition={{ delay: 0.06 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap"><Siren className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Open alerts</h3>{d && <StatusBadge tone="neutral">{open.length}</StatusBadge>}</div>
              {!d ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
                : open.length === 0 ? <EmptyState icon={<CheckCheck className="w-8 h-8" />} title="Nothing firing" description="No wallet, key, error, latency or spend condition is currently open across any customer." />
                : (
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {open.map((a) => {
                        const snoozed = a.state === 'snoozed';
                        return (
                          <motion.li key={a.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`rounded-xl border bg-surface p-3 ${a.severity === 'critical' && a.state === 'firing' ? 'border-semantic-error/40' : 'border-border'}`}>
                            <div className="flex items-start gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <StatusBadge tone={SEV_TONE[a.severity]}>{a.severity}</StatusBadge>
                                  {a.state !== 'firing' && <StatusBadge tone={STATE_TONE[a.state]}>{a.state}{snoozed && a.snoozedUntil ? ` · ${fmt.inDays(a.snoozedUntil)}` : ''}</StatusBadge>}
                                  <span className="text-[13px] font-bold text-fg">{a.title}</span>
                                  <CustomerLink id={a.customerId} name={a.customerName} />
                                </div>
                                <div className="text-[11px] text-fg-muted">{a.evidence}</div>
                                <div className="text-[10px] text-fg-subtle mt-1 inline-flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1">routes to <span className="font-bold text-fg-muted">{TEAM_LABEL[a.team]}</span> via {CHANNEL_ICON[a.channel]} {CHANNEL_LABEL[a.channel]}</span>
                                  <span>· fired {fmt.ago(a.firedAt)}</span>
                                  {a.ackedBy && <span>· ack {a.ackedBy}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                {a.actions.map((ref, i) => (
                                  <button key={i} type="button" onClick={() => act(a, ref)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-glass px-2 py-1 text-[11px] font-bold text-fg-muted hover:text-teal hover:border-teal/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">{ACTION_ICON[ref.id]} {ref.label}</button>
                                ))}
                                {canAct && a.state === 'firing' && <Button size="sm" variant="secondary" onClick={() => { setErr(null); setPending({ kind: 'ack', alert: a }); }} icon={<Check className="w-3.5 h-3.5" />}>Ack</Button>}
                                {canAct && a.state !== 'resolved' && <Button size="sm" variant="ghost" onClick={() => { setErr(null); setSnoozeHours(24); setPending({ kind: 'snooze', alert: a }); }} icon={<BellOff className="w-3.5 h-3.5" />}>Snooze</Button>}
                                {canAct && <Button size="sm" variant="ghost" onClick={() => { setErr(null); setPending({ kind: 'resolve', alert: a }); }} icon={<CheckCheck className="w-3.5 h-3.5" />}>Resolve</Button>}
                              </div>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              {!canAct && d && open.length > 0 && <p className="text-[11px] text-fg-muted mt-3 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Your role can view alerts and open the linked pages. Acknowledging, snoozing and resolving are for ops, finance or a super admin.</p>}
            </GlassCard>
          </motion.div>

          {/* Rules */}
          <motion.div {...SECTION} transition={{ delay: 0.1 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap"><SlidersHorizontal className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Alert rules &amp; routing</h3></div>
              <p className="text-[12px] text-fg-muted mb-4">Each rule owns a threshold, a severity, the team it pages and the channel. Changes are audit-logged and apply on the next evaluation.</p>
              {!d ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[720px]">
                    <thead><tr className="text-[10px] font-black uppercase tracking-widest text-fg-muted"><th className="py-2 pr-3">Condition</th><th className="py-2 pr-3">Threshold</th><th className="py-2 pr-3">Severity</th><th className="py-2 pr-3">Routes to</th><th className="py-2 pr-3">Cooldown</th><th className="py-2 text-right">State</th></tr></thead>
                    <tbody>
                      {d.rules.map((r) => (
                        <tr key={r.id} className="border-t border-border-subtle align-top">
                          <td className="py-2.5 pr-3 min-w-[220px]"><div className="text-[12px] font-bold text-fg">{r.label}</div><div className="text-[11px] text-fg-muted">{r.description}</div></td>
                          <td className="py-2.5 pr-3 text-[12px] text-fg whitespace-nowrap">{r.threshold !== null ? `${r.threshold}${r.unit ? ` ${r.unit}` : ''}` : '—'}</td>
                          <td className="py-2.5 pr-3"><StatusBadge tone={SEV_TONE[r.severity]}>{r.severity}</StatusBadge></td>
                          <td className="py-2.5 pr-3 text-[11px] text-fg-muted whitespace-nowrap inline-flex items-center gap-1">{TEAM_LABEL[r.team]} · {CHANNEL_ICON[r.channel]} {CHANNEL_LABEL[r.channel]}</td>
                          <td className="py-2.5 pr-3 text-[12px] text-fg-muted whitespace-nowrap">{r.cooldownHours}h</td>
                          <td className="py-2.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <StatusBadge tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'on' : 'off'}</StatusBadge>
                              {canAct && <Button size="sm" variant="ghost" onClick={() => { setErr(null); setPending({ kind: 'rule', rule: r, patch: {} }); }}>Edit</Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Recently resolved */}
          {resolved.length > 0 && (
            <motion.div {...SECTION} transition={{ delay: 0.14 }}>
              <GlassCard className="p-5 mt-5">
                <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-fg-muted" /><h3 className="text-sm font-bold text-fg">Recently resolved</h3></div>
                <ul className="space-y-1.5">{resolved.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-[12px] flex-wrap">
                    <StatusBadge tone="success"><CheckCheck className="w-3 h-3" /> resolved</StatusBadge>
                    <span className="text-fg">{a.title}</span><CustomerLink id={a.customerId} name={a.customerName} />
                    <span className="text-fg-subtle text-[11px]">· {a.resolvedAt ? fmt.ago(a.resolvedAt) : ''} · by {a.ackedBy ?? '—'}</span>
                  </li>
                ))}</ul>
              </GlassCard>
            </motion.div>
          )}

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link href="/admin/wallets" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Wallets <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/ledger" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">API ledger <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/audit" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Audit log <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </>
      )}

      {/* Reason-captured mutations */}
      <ReasonModal
        open={pending !== null && pending.kind !== 'rule'}
        title={pending?.kind === 'ack' ? 'Acknowledge alert' : pending?.kind === 'resolve' ? 'Resolve alert' : pending?.kind === 'snooze' ? 'Snooze alert' : 'Extend key 90 days'}
        description={pending && 'alert' in pending ? `${pending.alert.title} · ${pending.alert.customerName}` : undefined}
        confirmLabel={pending?.kind === 'ack' ? 'Acknowledge' : pending?.kind === 'resolve' ? 'Resolve' : pending?.kind === 'snooze' ? 'Snooze' : 'Extend & resolve'}
        busy={busy} error={err} onClose={() => { setPending(null); setErr(null); }} onConfirm={run}
      >
        {pending?.kind === 'snooze' && (
          <div>
            <label htmlFor="snooze-hours" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Snooze for</label>
            <Select id="snooze-hours" value={String(snoozeHours)} onChange={(e) => setSnoozeHours(Number(e.target.value))} className="text-[12px]">
              {[4, 12, 24, 72, 168].map((h) => <option key={h} value={h}>{h < 24 ? `${h} hours` : `${h / 24} day${h === 24 ? '' : 's'}`}</option>)}
            </Select>
          </div>
        )}
      </ReasonModal>

      {/* Rule editor */}
      <ReasonModal
        open={pending?.kind === 'rule'}
        title={pending?.kind === 'rule' ? `Edit rule · ${pending.rule.label}` : 'Edit rule'}
        confirmLabel="Save rule" valid={pending?.kind === 'rule' ? Object.keys(pending.patch).length > 0 : false}
        busy={busy} error={err} onClose={() => { setPending(null); setErr(null); }} onConfirm={run}
      >
        {pending?.kind === 'rule' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex items-center gap-2 text-[12px] text-fg">
              <input type="checkbox" checked={pending.patch.enabled ?? pending.rule.enabled} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, enabled: e.target.checked } })} className="accent-teal" /> Enabled
            </label>
            {pending.rule.threshold !== null && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Threshold{pending.rule.unit ? ` (${pending.rule.unit})` : ''}</label>
                <input type="number" min={0} defaultValue={pending.rule.threshold} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, threshold: Number(e.target.value) } })} className="w-full rounded-lg border border-border bg-surface font-mono text-[12px] text-fg px-2.5 py-1.5 focus:outline-none focus:border-teal" />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Cooldown (hours)</label>
              <input type="number" min={1} defaultValue={pending.rule.cooldownHours} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, cooldownHours: Number(e.target.value) } })} className="w-full rounded-lg border border-border bg-surface font-mono text-[12px] text-fg px-2.5 py-1.5 focus:outline-none focus:border-teal" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Severity</label>
              <Select value={(pending.patch.severity ?? pending.rule.severity)} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, severity: e.target.value as AlertSeverity } })} className="text-[12px]">{(['critical', 'warning', 'info'] as AlertSeverity[]).map((v) => <option key={v} value={v}>{v}</option>)}</Select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Team</label>
              <Select value={(pending.patch.team ?? pending.rule.team)} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, team: e.target.value as AlertTeam } })} className="text-[12px]">{(['ops', 'finance', 'sales'] as AlertTeam[]).map((v) => <option key={v} value={v}>{TEAM_LABEL[v]}</option>)}</Select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Channel</label>
              <Select value={(pending.patch.channel ?? pending.rule.channel)} onChange={(e) => setPending({ ...pending, patch: { ...pending.patch, channel: e.target.value as AlertChannel } })} className="text-[12px]">{(['pagerduty', 'slack', 'email'] as AlertChannel[]).map((v) => <option key={v} value={v}>{CHANNEL_LABEL[v]}</option>)}</Select>
            </div>
          </div>
        )}
      </ReasonModal>
    </div>
  );
}
