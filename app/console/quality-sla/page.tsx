'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Gauge, Target, ShieldCheck, AlertTriangle, CheckCircle2, CircleAlert, Clock, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { getQualitySLAReport, type SLAMetric, type SLAStatus } from '@/lib/quality-sla';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Skeleton, StatusBadge, Sparkline,
  type BadgeTone,
} from '@/components/ui';

const STATUS_META: Record<SLAStatus, { label: string; tone: BadgeTone; text: string; dot: string; bar: string }> = {
  met: { label: 'Met', tone: 'success', text: 'text-semantic-success', dot: 'bg-semantic-success', bar: 'bg-semantic-success' },
  at_risk: { label: 'At risk', tone: 'warning', text: 'text-semantic-warning', dot: 'bg-semantic-warning', bar: 'bg-semantic-warning' },
  breached: { label: 'Breached', tone: 'error', text: 'text-semantic-error', dot: 'bg-semantic-error', bar: 'bg-semantic-error' },
};
const fmt = (m: SLAMetric) => (m.unit === 'ms' ? `${Math.round(m.current)}ms` : m.unit === 'days' ? `${Math.round(m.current)}d` : `${m.current}%`);
const fmtTarget = (m: SLAMetric) => (m.unit === 'ms' ? `${m.target}ms` : m.unit === 'days' ? `${m.target}d` : `${m.target}%`);

function QualitySLAInner() {
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const report = useMemo(() => getQualitySLAReport(), []);

  useEffect(() => {
    setPhase('loading');
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  if (phase === 'loading') return <SLASkeleton />;

  const met = report.metrics.filter((m) => m.status === 'met').length;
  const openBreaches = report.breaches.filter((b) => !b.resolved).length;
  const overall = STATUS_META[report.overallStatus];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Quality SLA"
        description="Data-quality metrics measured against the targets we commit to — match rate, accuracy, coverage, freshness, uptime, and latency — with a 30-day trend and a breach log."
        icon={<Gauge />}
        actions={<StatusBadge tone={overall.tone}>{report.period} · {overall.label}</StatusBadge>}
      />

      {/* Overall compliance banner */}
      <GlassCard className={`p-6 mt-6 flex flex-col md:flex-row items-center gap-6 ${report.overallStatus === 'met' ? 'border-semantic-success/25' : report.overallStatus === 'at_risk' ? 'border-semantic-warning/25' : 'border-semantic-error/30'}`}>
        <div className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 ${report.overallStatus === 'met' ? 'bg-semantic-success/10' : report.overallStatus === 'at_risk' ? 'bg-semantic-warning/10' : 'bg-semantic-error/10'}`}>
          <span className={`text-2xl font-black tabular-nums ${overall.text}`}>{report.compliancePct}%</span>
        </div>
        <div className="text-center md:text-left">
          <h2 className="text-xl font-black text-fg">{report.overallStatus === 'met' ? 'All SLAs met' : report.overallStatus === 'at_risk' ? 'Some SLAs at risk' : 'SLA breach in effect'}</h2>
          <p className="text-sm text-fg-muted mt-0.5">{met} of {report.metrics.length} committed targets currently met{openBreaches > 0 ? ` · ${openBreaches} open breach${openBreaches === 1 ? '' : 'es'}` : ''}.</p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="SLA compliance" value={`${report.compliancePct}%`} icon={<Target />} hint="Targets met" />
        <KpiTile label="Targets met" value={`${met}/${report.metrics.length}`} icon={<CheckCircle2 />} hint="Across all metrics" />
        <KpiTile label="Open breaches" value={String(openBreaches)} icon={<AlertTriangle />} hint="Below target now" lowerIsBetter />
        <KpiTile label="Period" value="30d" icon={<Clock />} hint={report.period} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {report.metrics.map((m, i) => {
          const meta = STATUS_META[m.status];
          const Dir = m.higherIsBetter ? ArrowUp : ArrowDown;
          return (
            <motion.div key={m.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <GlassCard className="p-5 h-full">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-fg">{m.label}</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className={`text-2xl font-black tabular-nums ${meta.text}`}>{fmt(m)}</span>
                      <span className="text-[11px] text-fg-subtle inline-flex items-center gap-0.5"><Dir className="w-3 h-3" />target {fmtTarget(m)}</span>
                    </div>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
                <div className="mt-3">
                  <Sparkline values={m.history} width={220} height={32} className={meta.text} />
                </div>
                <p className="text-[12px] text-fg-muted mt-2 leading-snug">{m.description}</p>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Breach log */}
      <GlassCard className="p-5 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">SLA breach log</div>
        <ul className="divide-y divide-border-subtle">
          {report.breaches.map((b, i) => (
            <li key={i} className="py-3 flex items-start gap-3">
              <span className={`w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 ${b.resolved ? 'text-fg-subtle' : b.severity === 'major' ? 'text-semantic-error' : 'text-semantic-warning'}`}>
                {b.resolved ? <CheckCircle2 className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-fg">{b.metric}</span>
                  <StatusBadge tone={b.resolved ? 'neutral' : b.severity === 'major' ? 'error' : 'warning'}>{b.resolved ? 'Resolved' : b.severity}</StatusBadge>
                  <span className="text-[11px] text-fg-subtle">{b.date}</span>
                </div>
                <p className="text-[12px] text-fg-muted leading-snug mt-0.5">{b.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-5 mt-6 border-teal/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><ShieldCheck className="w-4 h-4 text-teal" /></div>
          <div>
            <div className="text-sm font-bold text-fg">How these are measured</div>
            <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
              Match rate and coverage come from the regional coverage model, uptime from the platform health model, and each metric is scored against its committed target — met, at-risk (within a small margin), or breached. Figures are a stable snapshot; a metric that dips below target opens a breach in the log and closes when it recovers. See <Link href="/console/regions" className="text-teal font-semibold hover:text-fg transition-colors">Regional Coverage <ArrowRight className="w-3 h-3 inline" /></Link> and <Link href="/status" className="text-teal font-semibold hover:text-fg transition-colors">Status</Link> for the underlying signals.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function SLASkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <Skeleton className="h-24 rounded-2xl mt-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function QualitySLAPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <QualitySLAInner />
    </RoleGuard>
  );
}
