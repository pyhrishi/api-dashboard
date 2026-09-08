'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { HeartPulse, RefreshCw, TrendingDown, TrendingUp, ArrowRight, ChevronDown, UserPlus, Building2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, EmptyState, Skeleton, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { BAND_LABEL, TAG_LABEL, type Health, type Portfolio, type HealthBand, type HealthTag } from '@/lib/admin/health';

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const BAND_TONE: Record<HealthBand, BadgeTone> = { healthy: 'success', watch: 'warning', at_risk: 'error' };
const TAG_TONE: Record<HealthTag, BadgeTone> = { churn_watch: 'error', expansion_ready: 'teal', dormant: 'neutral', new: 'info' };

function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-fg-subtle text-[11px]">no traffic</span>;
  const up = pct >= 0;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-semantic-success' : 'text-semantic-error'}`}>{up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{up ? '+' : ''}{pct}%</span>;
}

export default function HealthPage() {
  const toast = useToast();
  const operator = useStore((s) => s.operator);
  const canFlag = operator ? ['superadmin', 'sales', 'ops'].includes(operator.role) : false;
  const { state, reload } = useLoad<Portfolio>('health');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{ customer: Health; kind: 'churn' | 'expansion' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const d = state.status === 'ok' ? state.data : null;
  useMemo(() => { if (state.status === 'ok') track('health_viewed', { atRisk: state.data.distribution.at_risk, expansion: state.data.expansionReady.length }); }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const flag = async (note: string) => {
    if (!pending) return;
    setBusy(true); setErr(null);
    const res = await api.post('health/followup', { customerId: pending.customer.customerId, kind: pending.kind, note });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('health_followup_created', { kind: pending.kind });
    toast.success('Flagged for follow-up', `A ${pending.kind === 'churn' ? 'churn-risk' : 'expansion'} handoff was created for ${pending.customer.owner}.`);
    setPending(null);
    reload();
  };

  const bar = (h: Health) => (
    <div className="mt-1.5 h-1.5 rounded-full bg-glass overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${h.score}%` }} transition={{ duration: 0.5 }} className={`h-full rounded-full ${h.band === 'healthy' ? 'bg-semantic-success' : h.band === 'watch' ? 'bg-semantic-warning' : 'bg-semantic-error'}`} />
    </div>
  );

  const listCard = (title: string, icon: React.ReactNode, items: Health[], kind: 'churn' | 'expansion', empty: string) => (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">{icon}<h3 className="text-sm font-bold text-fg">{title}</h3><StatusBadge tone="neutral">{items.length}</StatusBadge></div>
      {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        : items.length === 0 ? <EmptyState icon={<HeartPulse className="w-8 h-8" />} title={empty} description="" />
        : (
          <ul className="space-y-2">{items.map((h) => (
            <li key={h.customerId} className="rounded-xl border border-border bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CustomerLink id={h.customerId} name={h.customerName} />
                <StatusBadge tone={kind === 'churn' ? 'error' : 'teal'}>{kind === 'churn' ? `churn ${h.churnRisk}` : `expand ${h.expansionScore}`}</StatusBadge>
              </div>
              {bar(h)}
              <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-fg-muted">{h.factors[0] ? h.factors[0].detail : '—'} · {h.plan}</span>
                {canFlag && <button type="button" onClick={() => { setErr(null); setPending({ customer: h, kind }); }} className="text-[11px] font-bold text-teal hover:underline inline-flex items-center gap-1"><UserPlus className="w-3 h-3" /> Flag for CSM</button>}
              </div>
            </li>
          ))}</ul>
        )}
    </GlassCard>
  );

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<HeartPulse />} title="Account health" description="One score per customer, blended from usage trend, wallet runway, error rate, dormancy and trial burn — split into who to call before they leave and who to call to grow. Flag any account for a CSM follow-up; the handoff lands with its owner." actions={
        <Button variant="secondary" size="sm" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
      } />

      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={!d} label="Median health" value={d ? d.medianScore ?? '—' : ''} icon={<HeartPulse />} hint={d ? `${d.distribution.healthy} healthy of ${d.all.length}` : ''} />
            <KpiTile loading={!d} label="At risk" value={d ? d.distribution.at_risk : ''} icon={<TrendingDown />} hint={d ? `${d.distribution.watch} on watch` : ''} lowerIsBetter />
            <KpiTile loading={!d} label="Churn watch" value={d ? d.churnWatch.length : ''} icon={<TrendingDown />} hint="call before they leave" lowerIsBetter />
            <KpiTile loading={!d} label="Expansion ready" value={d ? d.expansionReady.length : ''} icon={<TrendingUp />} hint="call to grow" />
          </motion.div>

          {d && (
            <motion.div {...SECTION} transition={{ delay: 0.03 }} className="mt-4">
              <div className="flex items-center gap-3 text-[11px] text-fg-muted flex-wrap">
                <span className="font-bold text-fg">Portfolio:</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-semantic-success" /> {d.distribution.healthy} healthy</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-semantic-warning" /> {d.distribution.watch} watch</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-semantic-error" /> {d.distribution.at_risk} at risk</span>
                <span>· avg churn risk {d.avgChurnRisk}</span>
              </div>
            </motion.div>
          )}

          <motion.div {...SECTION} transition={{ delay: 0.05 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            {listCard('Churn watch', <TrendingDown className="w-4 h-4 text-semantic-error" />, d?.churnWatch ?? [], 'churn', 'No account at churn risk')}
            {listCard('Expansion ready', <TrendingUp className="w-4 h-4 text-teal" />, d?.expansionReady ?? [], 'expansion', 'No expansion signal yet')}
          </motion.div>

          {/* Full table */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Every account, by risk</h3></div>
              {!d ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[720px]">
                    <thead><tr className="text-[10px] font-black uppercase tracking-widest text-fg-muted"><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Health</th><th className="py-2 pr-3">Churn</th><th className="py-2 pr-3">Expand</th><th className="py-2 pr-3">Usage 7d</th><th className="py-2 pr-3">Tags</th><th className="py-2"></th></tr></thead>
                    <tbody>
                      {d.all.map((h) => (
                        <Fragment key={h.customerId}>
                          <tr className="border-t border-border-subtle">
                            <td className="py-2.5 pr-3 min-w-[160px]"><CustomerLink id={h.customerId} name={h.customerName} /><div className="text-[10px] text-fg-muted">{h.plan} · {h.stage}</div></td>
                            <td className="py-2.5 pr-3 min-w-[120px]"><div className="flex items-center gap-2"><span className="text-[13px] font-bold text-fg tabular-nums">{h.score}</span><StatusBadge tone={BAND_TONE[h.band]}>{BAND_LABEL[h.band]}</StatusBadge></div>{bar(h)}</td>
                            <td className="py-2.5 pr-3 text-[12px] text-fg tabular-nums">{h.churnRisk}</td>
                            <td className="py-2.5 pr-3 text-[12px] text-fg tabular-nums">{h.expansionScore}</td>
                            <td className="py-2.5 pr-3"><Trend pct={h.usageTrendPct} /></td>
                            <td className="py-2.5 pr-3"><div className="flex flex-wrap gap-1">{h.tags.length ? h.tags.map((t) => <StatusBadge key={t} tone={TAG_TONE[t]}>{TAG_LABEL[t]}</StatusBadge>) : <span className="text-[11px] text-fg-subtle">—</span>}</div></td>
                            <td className="py-2.5 text-right"><button type="button" onClick={() => setExpanded(expanded === h.customerId ? null : h.customerId)} aria-expanded={expanded === h.customerId} className="text-fg-muted hover:text-fg p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><ChevronDown className={`w-4 h-4 transition-transform ${expanded === h.customerId ? 'rotate-180' : ''}`} /></button></td>
                          </tr>
                          <AnimatePresence>
                            {expanded === h.customerId && (
                              <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <td colSpan={7} className="pb-3">
                                  <div className="rounded-xl border border-border bg-surface p-3">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">What drives the score</div>
                                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                      {h.factors.map((f) => (
                                        <li key={f.key} className="flex items-center justify-between gap-2 text-[12px]">
                                          <span className="text-fg">{f.label} <span className="text-fg-muted">— {f.detail}</span></span>
                                          <span className="shrink-0 flex items-center gap-1">{f.churn > 0 && <StatusBadge tone="error">+{f.churn} churn</StatusBadge>}{f.expansion > 0 && <StatusBadge tone="teal">+{f.expansion} exp</StatusBadge>}{f.churn === 0 && f.expansion === 0 && <StatusBadge tone="neutral">neutral</StatusBadge>}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    {canFlag && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => { setErr(null); setPending({ customer: h, kind: h.churnRisk >= h.expansionScore ? 'churn' : 'expansion' }); }} icon={<UserPlus className="w-3.5 h-3.5" />}>Flag for CSM</Button>
                                        <Link href={`/admin/customers/${h.customerId}`} className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Open customer <ArrowRight className="w-3 h-3" /></Link>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </motion.div>

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link href="/admin/funnel" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Funnel & triggers <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/wallets" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Wallets <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </>
      )}

      <ReasonModal
        open={pending !== null}
        title={pending ? `Flag ${pending.customer.customerName} — ${pending.kind === 'churn' ? 'churn risk' : 'expansion'}` : 'Flag for CSM'}
        description={pending ? `Creates a handoff for ${pending.customer.owner}.` : undefined}
        confirmLabel="Create handoff" busy={busy} error={err}
        onClose={() => { setPending(null); setErr(null); }} onConfirm={flag}
      />
    </div>
  );
}
