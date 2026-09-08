'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Route, Gauge, Siren, Sparkles, Clock, RotateCcw, FastForward, ArrowRight, Send, Mail, Webhook, TrendingUp,
} from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import { track } from '@/lib/telemetry';
import { cn } from '@/lib/utils';
import {
  PageHeader, KpiTile, GlassCard, DataTable, EmptyState, StatusBadge, Button, Skeleton,
  type Column, type BadgeTone,
} from '@/components/ui';
import {
  primaryStage, leadScoreOf, accountFromDeveloper, STAGE_META, ALL_STAGES, phaseLabel,
  type LifecycleStage, type LifecyclePhase, type FunnelTag, type LeadClass,
} from '@/lib/lifecycle';
import { useNudgeState, nudgeById } from '@/lib/nudges';
import { nudgeDeliverySummary, type NudgeDelivery } from '@/lib/nudge-delivery';
import { useLifecycleAccount } from '@/components/nudges/useLifecycleAccount';
import { generateCohort } from '@/lib/growth-kpis';

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const DAY = 86_400_000;

const FUNNEL_TONE: Record<FunnelTag, BadgeTone> = { lead: 'teal', feature: 'info', both: 'warning' };
const LEAD_TONE: Record<LeadClass, BadgeTone> = {
  anonymous: 'neutral', cold: 'neutral', warm: 'info', sql: 'teal', sales_ready: 'warning', hot: 'error', customer: 'success', dead: 'neutral',
};
const LEAD_LABEL: Record<LeadClass, string> = {
  anonymous: 'Anonymous', cold: 'Cold', warm: 'Warm', sql: 'Sales-qualified', sales_ready: 'Sales-ready', hot: 'Hot', customer: 'Customer', dead: 'Dead',
};

function SectionTitle({ icon, title, note, right }: { icon: ReactNode; title: string; note: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted flex items-center gap-2"><span className="text-teal [&>svg]:w-4 [&>svg]:h-4">{icon}</span>{title}</h3>
        <p className="text-xs text-fg-muted mt-1">{note}</p>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function JourneyInner() {
  const nudge = useNudgeState();
  const [now, setNow] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setTimeout(() => setReady(true), 220);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearTimeout(t); clearInterval(tick); };
  }, []);
  const effNow = (now ?? Date.now()) + nudge.simulatedOffsetMs;
  const account = useLifecycleAccount(effNow);

  useEffect(() => {
    track('journey_viewed', { simulatedOffsetDays: Math.round(nudge.simulatedOffsetMs / DAY) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view event on mount
  }, []);

  const myStage = primaryStage(account, effNow);
  const lead = leadScoreOf(account, effNow);

  // Population distribution across stages (the seeded cohort + you).
  const distribution = useMemo(() => {
    if (now === null) return {} as Record<LifecycleStage, number>;
    const counts = {} as Record<LifecycleStage, number>;
    ALL_STAGES.forEach((s) => { counts[s] = 0; });
    generateCohort(effNow).forEach((dev) => { counts[primaryStage(accountFromDeveloper(dev, effNow), effNow)] += 1; });
    counts[myStage] += 1; // you
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effNow, now, myStage]);
  const distMax = Math.max(1, ...ALL_STAGES.map((s) => distribution[s] ?? 0));

  // Nudge activity + re-engagement ledger.
  const nudgeRows = useMemo(() => Object.keys(nudge.records).map((id) => ({ ...nudge.records[id], spec: nudgeById(id) })).sort((a, b) => b.lastSeenAt - a.lastSeenAt), [nudge.records]);
  const deliverySummary = nudgeDeliverySummary(nudge.deliveries);

  const advance = (ms: number, label: string) => { nudge.advanceSimulated(ms); track('journey_simulated_advanced', { by: label }); };
  const resetClock = () => { nudge.setSimulatedOffset(0); track('journey_simulated_advanced', { by: 'reset' }); };

  // ── stages grouped by phase for the board ──
  const phases: LifecyclePhase[] = [0, 1, 2, 3, 4, 5, 6, 7];

  const deliveryColumns: Column<NudgeDelivery>[] = [
    { key: 'nudge', header: 'Nudge', render: (d) => <span className="text-[12px] text-fg">{nudgeById(d.nudgeId)?.title ?? d.nudgeId}</span> },
    { key: 'channel', header: 'Channel', render: (d) => <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">{d.channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Webhook className="w-3.5 h-3.5" />}{d.channel}</span> },
    { key: 'touch', header: 'Touch', align: 'right', render: (d) => <span className="text-[12px] tabular-nums text-fg-muted">#{d.touch}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (d) => <StatusBadge tone={d.status === 'delivered' ? 'success' : d.status === 'failed' ? 'error' : 'neutral'}>{d.status}</StatusBadge> },
  ];

  return (
    <div className="max-w-[1180px] mx-auto pb-16 space-y-6">
      <PageHeader
        icon={<Route />}
        title="Customer Journey"
        description="Where this account sits on the C0 → C7 lifecycle, its lead score and sales signal, the nudges it has seen, and the re-engagement it has been sent. Advance the simulated clock to watch triggers and nudges fire."
        actions={<StatusBadge tone={LEAD_TONE[lead.class]} dot pulse={lead.salesRoutable}>{LEAD_LABEL[lead.class]} · {lead.score}</StatusBadge>}
      />

      {!ready || now === null ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{['Stage', 'Lead', 'Nudges shown', 'Re-engagement'].map((l) => <KpiTile key={l} label={l} value="" loading />)}</div>
          <Skeleton variant="block" className="h-[360px]" />
          <Skeleton variant="block" className="h-[260px]" />
        </div>
      ) : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile label="Your stage" value={myStage} icon={<Route />} hint={`${STAGE_META[myStage].label} · ${phaseLabel(STAGE_META[myStage].phase)}`} />
            <KpiTile label="Lead" value={`${LEAD_LABEL[lead.class]}`} icon={<TrendingUp />} hint={`score ${lead.score}${lead.salesRoutable ? ' · sales-routable' : ''}`} />
            <KpiTile label="Nudges shown" value={nudgeRows.filter((r) => r.seenCount > 0).length} icon={<Sparkles />} hint={`${nudgeRows.filter((r) => r.status === 'converted').length} converted · ${nudgeRows.filter((r) => r.status === 'dismissed').length} dismissed`} />
            <KpiTile label="Re-engagement" value={`${deliverySummary.delivered}/${deliverySummary.total}`} icon={<Send />} hint={`${deliverySummary.failed} failed · ${deliverySummary.skipped} skipped`} />
          </motion.div>

          {/* Journey board */}
          <motion.div {...SECTION} transition={{ delay: 0.05 }}>
            <GlassCard>
              <SectionTitle icon={<Route />} title="The journey" note="Every C-stage grouped by phase, tagged Lead / Feature / Both. Your position is highlighted; the bar is the sample cohort + you at each stage."
                right={<StatusBadge tone="info">sample cohort · {Object.keys(distribution).length ? Object.values(distribution).reduce((a, b) => a + b, 0) : 0} developers</StatusBadge>} />
              <div className="space-y-4">
                {phases.map((ph) => {
                  const stages = ALL_STAGES.filter((s) => STAGE_META[s].phase === ph);
                  return (
                    <div key={ph}>
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Phase {ph} · {phaseLabel(ph)}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {stages.map((s) => {
                          const meta = STAGE_META[s];
                          const count = distribution[s] ?? 0;
                          const isYou = s === myStage;
                          return (
                            <div key={s} className={cn('rounded-xl border px-3 py-2', isYou ? 'border-teal/50 bg-teal/10' : 'border-border bg-glass')}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-bold text-fg truncate">{s} · {meta.label}</span>
                                {isYou && <StatusBadge tone="teal">you</StatusBadge>}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <StatusBadge tone={FUNNEL_TONE[meta.funnel]}>{meta.funnel}</StatusBadge>
                                <span className="text-[10px] text-fg-muted">{meta.priority}</span>
                                <span className="ml-auto text-[11px] tabular-nums text-fg-muted">{count}</span>
                              </div>
                              <div className="mt-1.5 h-1 rounded-full bg-overlay overflow-hidden">
                                <div className="h-full rounded-full bg-teal" style={{ width: `${(count / distMax) * 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>

          {/* Lead & sales + simulated clock */}
          <motion.div {...SECTION} transition={{ delay: 0.1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard>
              <SectionTitle icon={<Gauge />} title="Lead & sales routing" note="Derived from the same lifecycle state — sales-routable classes page the sales owner." />
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge tone={LEAD_TONE[lead.class]} dot pulse={lead.salesRoutable}>{LEAD_LABEL[lead.class]}</StatusBadge>
                <span className="text-2xl font-black text-fg tabular-nums">{lead.score}<span className="text-sm text-fg-muted font-bold">/100</span></span>
                {lead.salesRoutable && <StatusBadge tone="warning"><Siren className="w-3 h-3" /> routes to Sales</StatusBadge>}
              </div>
              <div className="mt-3 h-2 rounded-full bg-overlay overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-teal to-teal-ice" style={{ width: `${lead.score}%` }} /></div>
              <p className="text-[12px] text-fg-muted mt-3">{lead.everActivated ? 'Activated — a real first call is on record.' : 'Not yet activated — no successful API call.'} {lead.class === 'dead' ? 'Trial lapsed without conversion; win-back before demotion.' : lead.class === 'customer' || lead.class === 'hot' ? 'Converted to paid.' : 'Still in the trial funnel.'}</p>
            </GlassCard>

            <GlassCard>
              <SectionTitle icon={<Clock />} title="Simulated clock" note="Advance time to age the trial and fire time-based triggers (inactivity, key expiry, re-engagement)." />
              <div className="text-sm text-fg mb-3">Offset: <span className="font-bold tabular-nums">{Math.round(nudge.simulatedOffsetMs / DAY)}d {Math.round((nudge.simulatedOffsetMs % DAY) / 3_600_000)}h</span></div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" icon={<FastForward className="w-4 h-4" />} onClick={() => advance(DAY, '+1d')}>+1 day</Button>
                <Button size="sm" variant="secondary" icon={<FastForward className="w-4 h-4" />} onClick={() => advance(7 * DAY, '+7d')}>+7 days</Button>
                <Button size="sm" variant="secondary" icon={<FastForward className="w-4 h-4" />} onClick={() => advance(30 * DAY, '+30d')}>+30 days</Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="w-4 h-4" />} onClick={resetClock} disabled={nudge.simulatedOffsetMs === 0}>Reset</Button>
              </div>
              <p className="text-[11px] text-fg-muted mt-3">The nudge watcher re-evaluates on each advance; watch banners, celebrations and re-engagement emails appear across the console.</p>
            </GlassCard>
          </motion.div>

          {/* Nudge activity */}
          <motion.div {...SECTION} transition={{ delay: 0.15 }}>
            <GlassCard>
              <SectionTitle icon={<Sparkles />} title="Nudge activity" note="Every nudge this account has seen, and how it responded." />
              {nudgeRows.filter((r) => r.seenCount > 0).length === 0 ? (
                <EmptyState icon={<Sparkles />} title="No nudges shown yet" description="Nudges appear as the account moves through the journey. Advance the clock or use the console to trigger them." />
              ) : (
                <ul className="space-y-2">
                  {nudgeRows.filter((r) => r.seenCount > 0).slice(0, 10).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-glass px-3 py-2">
                      <StatusBadge tone={r.status === 'converted' ? 'success' : r.status === 'dismissed' ? 'neutral' : r.status === 'snoozed' ? 'warning' : 'teal'}>{r.status}</StatusBadge>
                      <span className="text-[12px] font-bold text-fg min-w-0 truncate flex-1">{r.spec?.title ?? r.id}</span>
                      <span className="text-[11px] text-fg-muted whitespace-nowrap">seen {r.seenCount}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </motion.div>

          {/* Re-engagement ledger */}
          <motion.div {...SECTION} transition={{ delay: 0.2 }}>
            <GlassCard>
              <SectionTitle icon={<Send />} title="Re-engagement ledger" note="Email / webhook touches sent when a nudge stalled — capped and unsubscribe-honouring." />
              {nudge.deliveries.length === 0 ? (
                <EmptyState icon={<Mail />} title="No re-engagement sent" description="When a shown nudge isn't acted on within its window, the watcher sends a capped email/webhook sequence. Advance the clock to see it." />
              ) : (
                <DataTable columns={deliveryColumns} rows={nudge.deliveries.slice(0, 50)} rowKey={(d) => d.id} pageSize={8} />
              )}
            </GlassCard>
          </motion.div>

          <nav aria-label="Related pages" className="flex flex-wrap items-center gap-2 text-xs text-fg-muted pt-2">
            <span className="font-black uppercase tracking-widest text-[10px]">Go deeper</span>
            {[['/console/growth', 'Growth'], ['/console/alerts', 'Alert Center'], ['/console/lifecycle', 'CSM Cockpit'], ['/console/billing', 'Billing']].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full border border-border bg-glass px-3 py-1 font-bold hover:text-teal hover:border-teal/40 transition-colors inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">{label} <ArrowRight className="w-3 h-3" /></Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

export default function CustomerJourneyPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <JourneyInner />
    </RoleGuard>
  );
}
