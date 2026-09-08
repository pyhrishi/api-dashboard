'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, Zap, Handshake, Play, Pencil, Info } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore, CAN } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Skeleton, StatusBadge, DataTable, Button, Select, SegmentedControl, EmptyState, Input, type Column } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, HANDOFF_TONE } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { STAGE_LABEL, type FunnelSummary, type SalesTrigger, type Handoff, type Customer, type HandoffState, type Plan, type Region, type ProductId } from '@/lib/admin/types';

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
type Since = 'all' | '30' | '90';

export default function FunnelPage() {
  const role = useStore((s) => s.operator?.role ?? 'ops');
  const toast = useToast();
  const [product, setProduct] = useState<ProductId | 'all'>('all');
  const [plan, setPlan] = useState<Plan | 'all'>('all');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [since, setSince] = useState<Since>('all');
  const qs = new URLSearchParams(); if (product !== 'all') qs.set('product', product); if (plan !== 'all') qs.set('plan', plan); if (region !== 'all') qs.set('region', region); if (since !== 'all') qs.set('sinceDays', since);
  const funnel = useLoad<FunnelSummary>(`funnel?${qs}`);
  const trig = useLoad<{ triggers: SalesTrigger[]; handoffs: Handoff[] }>('triggers');
  const customers = useLoad<Customer[]>('customers');
  const names = useMemo(() => new Map((customers.state.status === 'ok' ? customers.state.data : []).map((c) => [c.id, c.name])), [customers.state]);

  const [editing, setEditing] = useState<SalesTrigger | null>(null);
  const [value, setValue] = useState('');
  const [toggling, setToggling] = useState<SalesTrigger | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ h: Handoff; state: HandoffState } | null>(null);
  const [running, setRunning] = useState(false);

  const patchTrigger = async (t: SalesTrigger, patch: Record<string, unknown>, reason: string) => {
    setBusy(true); setErr(null);
    const res = await api.patch<SalesTrigger>(`triggers/${t.id}`, { ...patch, reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('trigger_updated', { trigger: t.id, field: Object.keys(patch)[0] });
    toast.success('Trigger updated', `${t.name} · ${Object.keys(patch)[0]}`);
    setEditing(null); setToggling(null); trig.reload();
  };
  const runNow = async () => {
    setRunning(true);
    const res = await api.post<Handoff[]>('triggers/run', {});
    setRunning(false);
    if (!res.ok) { toast.error('Could not evaluate triggers', res.error.message); return; }
    toast.success(res.data.length ? `${res.data.length} new handoff${res.data.length === 1 ? '' : 's'}` : 'No new handoffs', res.data.length ? 'Accounts crossed a rule outside its cooldown.' : 'Every firing rule is inside its cooldown for that account.');
    trig.reload();
  };
  const moveHandoff = async (note: string) => {
    if (!handoff) return;
    setBusy(true); setErr(null);
    const res = await api.post<Handoff>(`handoffs/${handoff.h.id}`, { state: handoff.state, note });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('handoff_updated', { state: handoff.state });
    setHandoff(null); trig.reload();
  };

  const triggerCols: Column<SalesTrigger>[] = [
    { key: 'name', header: 'Rule', render: (t) => <div><div className="text-[12px] font-bold text-fg">{t.name}</div><div className="text-[11px] text-fg-muted">{t.kind === 'stage' ? `stage reaches ${STAGE_LABEL[t.stage ?? 'activated']}` : `${t.metric} ${t.op} ${t.value}${t.metric?.endsWith('Pct') ? '%' : ''}`} · cooldown {t.cooldownDays}d</div></div> },
    { key: 'channel', header: 'Routes to', className: 'hidden md:table-cell', render: (t) => <span className="text-[11px] text-fg">{t.channel.toUpperCase()} · {t.owner}</span> },
    { key: 'enabled', header: 'State', align: 'right', render: (t) => <StatusBadge tone={t.enabled ? 'success' : 'neutral'}>{t.enabled ? 'enabled' : 'off'}</StatusBadge> },
    { key: 'actions', header: '', align: 'right', render: (t) => CAN.editTriggers(role) ? <div className="flex justify-end gap-1">{t.kind === 'metric' && <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setValue(String(t.value ?? '')); setErr(null); }} icon={<Pencil className="w-3.5 h-3.5" />}>Threshold</Button>}<Button size="sm" variant="ghost" onClick={() => { setToggling(t); setErr(null); }}>{t.enabled ? 'Disable' : 'Enable'}</Button></div> : <span className="text-[10px] text-fg-subtle">sales / super admin</span> },
  ];
  const handoffCols: Column<Handoff>[] = [
    { key: 'customer', header: 'Account', render: (h) => <div><CustomerLink id={h.customerId} name={names.get(h.customerId) ?? h.customerId} /><div className="text-[11px] text-fg-muted">{h.triggerName} · {fmt.ago(h.firedAt)}</div></div> },
    { key: 'evidence', header: 'Evidence', className: 'hidden md:table-cell', render: (h) => <span className="font-mono text-[11px] text-fg-muted">{h.evidence}</span> },
    { key: 'owner', header: 'Owner', className: 'hidden lg:table-cell', render: (h) => <span className="text-[11px] text-fg">{h.ownerId}</span> },
    { key: 'state', header: 'State', align: 'right', render: (h) => <StatusBadge tone={HANDOFF_TONE[h.state]}>{h.state}</StatusBadge> },
    { key: 'actions', header: '', align: 'right', render: (h) => CAN.updateHandoffs(role) && h.state !== 'closed' && h.state !== 'converted' ? <div className="flex justify-end gap-1">{h.state === 'new' && <Button size="sm" variant="ghost" onClick={() => setHandoff({ h, state: 'contacted' })}>Contacted</Button>}<Button size="sm" variant="ghost" onClick={() => setHandoff({ h, state: 'converted' })}>Converted</Button><Button size="sm" variant="ghost" onClick={() => setHandoff({ h, state: 'closed' })}>Close</Button></div> : null },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<Filter />} title="Funnel & sales triggers" description="The activation funnel across every customer — the same TOFU / MOFU / BOFU stages the Growth dashboard uses, filterable by product, plan and region — and the rules that hand a hot account to sales." />
      <motion.div {...SECTION} className="flex items-center gap-2 flex-wrap mt-6">
        <Select aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value as ProductId | 'all')} className="text-[12px] w-44"><option value="all">All products</option><option value="zinbit">Zinbit</option><option value="zintlr-intent">Zintlr Intent</option><option value="zintlr-context">Zintlr Context</option></Select>
        <Select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan | 'all')} className="text-[12px] w-36"><option value="all">All plans</option><option>Trial</option><option>Starter</option><option>Growth</option><option>Enterprise</option></Select>
        <Select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value as Region | 'all')} className="text-[12px] w-32"><option value="all">All regions</option><option>IN</option><option>US</option><option>EU</option></Select>
        <SegmentedControl layoutId="funnel-since" size="sm" value={since} onChange={setSince} options={[{ value: 'all', label: 'All time' }, { value: '90', label: '90d' }, { value: '30', label: '30d' }]} />
      </motion.div>

      {funnel.state.status === 'error' ? <div className="mt-5"><ErrorCard message={funnel.state.message} onRetry={funnel.reload} /></div> : (
        <motion.div {...SECTION} transition={{ delay: 0.04 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
          <GlassCard className="p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-fg mb-3">Stages &amp; drop-off {funnel.state.status === 'ok' && <span className="text-fg-muted font-normal">· {funnel.state.data.total} accounts · {funnel.state.data.churned} churned</span>}</h3>
            {funnel.state.status !== 'ok' ? <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div> : funnel.state.data.total === 0 ? <EmptyState icon={<Filter className="w-8 h-8" />} title="No accounts match" description="Widen the filters." /> : (
              <ul className="space-y-3">{funnel.state.data.stages.map((s) => (
                <li key={s.stage} className="grid grid-cols-[120px_1fr_120px] items-center gap-3">
                  <div><div className="text-[12px] font-bold text-fg">{STAGE_LABEL[s.stage]}</div><div className="text-[10px] text-fg-subtle">{s.band}</div></div>
                  <div className="h-6 rounded-lg bg-glass overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(s.count / (funnel.state.status === 'ok' ? funnel.state.data.total : 1)) * 100}%` }} transition={{ duration: 0.5 }} className="h-full rounded-lg bg-teal/70" /></div>
                  <div className="text-right"><span className="font-mono text-[12px] text-fg font-bold">{s.count}</span>{s.dropOffPct !== null && <span className={`text-[11px] ml-2 ${s.dropOffPct > 40 ? 'text-semantic-error' : 'text-fg-muted'}`}>−{s.dropOffPct}%</span>}</div>
                </li>
              ))}</ul>
            )}
          </GlassCard>
          <div className="space-y-3">
            <KpiTile loading={funnel.state.status !== 'ok'} label="Time to activate (median)" value={funnel.state.status === 'ok' ? `${funnel.state.data.timeToActivateMinutes.median ?? '—'} min` : ''} hint={funnel.state.status === 'ok' ? `p90 ${funnel.state.data.timeToActivateMinutes.p90 ?? '—'} min · ${fmt.pct(funnel.state.data.timeToActivateMinutes.underTenMinPct)} under 10 min · target < 10` : ''} />
            <KpiTile loading={funnel.state.status !== 'ok'} label="Time to first payment" value={funnel.state.status === 'ok' ? `${funnel.state.data.timeToPayDays.median ?? '—'} days` : ''} hint={funnel.state.status === 'ok' ? `n=${funnel.state.data.timeToPayDays.sample}` : ''} />
            {funnel.state.status === 'ok' && <GlassCard className="p-4 text-[11px] text-fg-muted space-y-1"><div className="text-[10px] font-black uppercase tracking-widest">Mix</div><div>Plans: {Object.entries(funnel.state.data.byPlan).map(([k, v]) => `${k} ${v}`).join(' · ')}</div><div>Regions: {Object.entries(funnel.state.data.byRegion).map(([k, v]) => `${k} ${v}`).join(' · ')}</div><div>Products: {Object.entries(funnel.state.data.byProduct).map(([k, v]) => `${k} ${v}`).join(' · ')}</div></GlassCard>}
          </div>
        </motion.div>
      )}

      <motion.div {...SECTION} transition={{ delay: 0.08 }}>
        <GlassCard className="p-5 mt-5">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Sales triggers</h3></div>
            <Button size="sm" variant="secondary" onClick={runNow} loading={running} icon={<Play className="w-4 h-4" />} title="Evaluate every enabled rule against every account now">Evaluate now</Button>
          </div>
          <p className="text-[12px] text-fg-muted mb-3 inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" /> A rule fires at most once per account per cooldown and creates a handoff with the evidence. Routing is a label in the prototype; production posts to Slack / the CRM.</p>
          {trig.state.status === 'loading' ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div> : trig.state.status === 'error' ? <ErrorCard message={trig.state.message} onRetry={trig.reload} /> : <DataTable columns={triggerCols} rows={trig.state.data.triggers} rowKey={(t) => t.id} />}
        </GlassCard>
      </motion.div>

      <motion.div {...SECTION} transition={{ delay: 0.12 }}>
        <GlassCard className="p-5 mt-5">
          <div className="flex items-center gap-2 mb-3"><Handshake className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Handoffs</h3>{trig.state.status === 'ok' && <StatusBadge tone="teal">{trig.state.data.handoffs.filter((h) => h.state === 'new').length} new</StatusBadge>}</div>
          {trig.state.status === 'loading' ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div> : trig.state.status === 'error' ? <ErrorCard message={trig.state.message} onRetry={trig.reload} /> : trig.state.data.handoffs.length === 0 ? <EmptyState icon={<Handshake className="w-8 h-8" />} title="No handoffs yet" description="When an account crosses a rule, it appears here with the evidence for sales." action={<Button size="sm" variant="secondary" onClick={runNow} loading={running}>Evaluate now</Button>} /> : <DataTable columns={handoffCols} rows={trig.state.data.handoffs} rowKey={(h) => h.id} pageSize={8} />}
        </GlassCard>
      </motion.div>

      <ReasonModal open={editing !== null} title={`Change threshold · ${editing?.name ?? ''}`} confirmLabel="Save threshold" busy={busy} error={err} valid={value.trim() !== '' && Number.isFinite(Number(value))} onClose={() => setEditing(null)} onConfirm={(reason) => { if (editing) return patchTrigger(editing, { value: Number(value) }, reason); }}>
        <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">{editing?.metric} {editing?.op}</span><Input type="number" autoFocus value={value} onChange={(e) => setValue(e.target.value)} mono className="text-[12px]" /></label>
      </ReasonModal>
      <ReasonModal open={toggling !== null} title={`${toggling?.enabled ? 'Disable' : 'Enable'} · ${toggling?.name ?? ''}`} description={toggling?.enabled ? 'Accounts crossing this rule will no longer create handoffs.' : 'The rule is evaluated on the next run.'} confirmLabel={toggling?.enabled ? 'Disable rule' : 'Enable rule'} danger={Boolean(toggling?.enabled)} busy={busy} error={err} onClose={() => setToggling(null)} onConfirm={(reason) => { if (toggling) return patchTrigger(toggling, { enabled: !toggling.enabled }, reason); }} />
      <ReasonModal open={handoff !== null} title={`Mark ${handoff?.state ?? ''} · ${handoff ? names.get(handoff.h.customerId) ?? handoff.h.customerId : ''}`} confirmLabel={`Mark ${handoff?.state ?? ''}`} busy={busy} error={err} onClose={() => setHandoff(null)} onConfirm={moveHandoff} />
    </div>
  );
}
