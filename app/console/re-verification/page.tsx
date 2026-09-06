'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { RefreshCw, CalendarClock, ShieldCheck, Mail, Phone, Briefcase, TrendingDown, ArrowUpRight, CircleCheck, Play, History, Info, ArrowRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import {
  generateReverifiableRecords, computeDueRecords, recordAgeDays, fieldLabel, CADENCE_BOUNDS,
  type ReverifyFieldType, type ReverifyOutcome, type ReverificationResult,
} from '@/lib/reverification';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, Button,
  type BadgeTone,
} from '@/components/ui';

const FIELD_ICON: Record<ReverifyFieldType, React.ElementType> = { email: Mail, phone: Phone, employment: Briefcase };
const OUTCOME_META: Record<ReverifyOutcome, { icon: React.ElementType; tone: BadgeTone; text: string; dot: string }> = {
  unchanged: { icon: CircleCheck, tone: 'success', text: 'text-semantic-success', dot: 'bg-semantic-success' },
  updated: { icon: ArrowUpRight, tone: 'teal', text: 'text-teal', dot: 'bg-teal' },
  decayed: { icon: TrendingDown, tone: 'error', text: 'text-semantic-error', dot: 'bg-semantic-error' },
};
const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function ReverificationInner() {
  const { reverificationCadence, reverificationRuns, runReVerification, setReverificationCadence, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [running, setRunning] = useState(false);
  const canMutate = user?.role !== 'billing';

  useEffect(() => {
    setPhase('loading');
    track('reverification_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  const records = useMemo(() => generateReverifiableRecords(), []);
  const due = useMemo(() => computeDueRecords(records, reverificationCadence), [records, reverificationCadence]);
  const lastRun = reverificationRuns[0];

  const onRun = () => {
    if (running) return;
    setRunning(true);
    try {
      const run = runReVerification();
      track('reverification_run', { checked: run.checked, updated: run.updated, decayed: run.decayed });
      toast.success('Re-verification complete', `${run.checked} fields checked · ${run.updated} updated · ${run.decayed} decayed.`);
    } catch (e) {
      toast.error('Could not run', e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setTimeout(() => setRunning(false), 500);
    }
  };

  const onCadence = (field: ReverifyFieldType, days: number) => {
    try {
      setReverificationCadence(field, days);
      track('reverification_cadence_changed', { field, days });
    } catch {
      /* billing role — silently ignored (control is disabled anyway) */
    }
  };

  if (phase === 'loading') return <ReverifySkeleton />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Automated Re-verification"
        description="Keep enriched data fresh. High-value fields are re-checked on a rolling schedule — the ones that decayed (bounced email, disconnected phone, a job change) surface here so your records self-heal."
        icon={<RefreshCw />}
        actions={canMutate ? (
          <Button variant="primary" onClick={onRun} disabled={running || due.length === 0}>
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run re-verification
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Records monitored" value={String(records.length)} icon={<ShieldCheck />} hint="High-value fields" />
        <KpiTile label="Due now" value={String(due.length)} icon={<CalendarClock />} hint="Past their cadence" />
        <KpiTile label="Last run · updated" value={lastRun ? String(lastRun.updated) : '—'} icon={<ArrowUpRight />} hint="Values that changed" />
        <KpiTile label="Last run · decayed" value={lastRun ? String(lastRun.decayed) : '—'} icon={<TrendingDown />} hint="Fields gone bad" lowerIsBetter />
      </div>

      {!canMutate && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted"><Info className="w-4 h-4 text-semantic-warning" /> Billing role is read-only — the schedule and run action are disabled.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 mt-6 items-start">
        {/* Schedule / cadence */}
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-4">Rolling schedule</div>
          <div className="space-y-5">
            {(['email', 'phone', 'employment'] as ReverifyFieldType[]).map((f) => {
              const Icon = FIELD_ICON[f];
              const dueForField = due.filter((r) => r.fieldType === f).length;
              return (
                <div key={f}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg"><Icon className="w-3.5 h-3.5 text-fg-subtle" />{fieldLabel(f)}</span>
                    <span className="text-xs font-mono tabular-nums text-fg-muted">every {reverificationCadence[f]}d</span>
                  </div>
                  <input
                    type="range" min={CADENCE_BOUNDS.min} max={CADENCE_BOUNDS.max} step={1}
                    value={reverificationCadence[f]}
                    disabled={!canMutate}
                    onChange={(e) => onCadence(f, Number(e.target.value))}
                    className="w-full accent-teal disabled:opacity-50"
                    aria-label={`${fieldLabel(f)} re-verification cadence in days`}
                  />
                  <div className="text-[11px] text-fg-subtle mt-1">{dueForField} due at this cadence</div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-border-subtle text-[12px] text-fg-muted leading-relaxed">
            A field is re-checked once it’s older than its cadence. Tightening a cadence re-checks more often (fresher data, more calls).
          </div>
        </GlassCard>

        {/* Due records + last run */}
        <div className="space-y-6">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Records due for re-verification</span>
              <span className="text-[11px] font-semibold text-fg-subtle">{due.length}</span>
            </div>
            {due.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-fg-muted"><CircleCheck className="w-4 h-4 text-semantic-success" /> Everything is within its cadence — nothing due.</div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {due.slice(0, 8).map((r) => {
                  const Icon = FIELD_ICON[r.fieldType];
                  const age = recordAgeDays(r);
                  return (
                    <li key={r.id} className="py-2.5 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 text-fg-subtle"><Icon className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-fg truncate">{r.entity} <span className="text-fg-subtle font-normal">· {r.company}</span></div>
                        <div className="text-[11px] font-mono text-fg-subtle truncate">{r.value}</div>
                      </div>
                      <span className="text-[11px] text-semantic-warning font-semibold shrink-0">{age}d old</span>
                    </li>
                  );
                })}
                {due.length > 8 && <li className="pt-2 text-[11px] text-fg-subtle">+{due.length - 8} more due</li>}
              </ul>
            )}
          </GlassCard>

          {lastRun && (
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Latest run · {timeAgo(lastRun.timestamp)}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge tone="success">{lastRun.unchanged} unchanged</StatusBadge>
                  <StatusBadge tone="teal">{lastRun.updated} updated</StatusBadge>
                  <StatusBadge tone="error">{lastRun.decayed} decayed</StatusBadge>
                </div>
              </div>
              {/* Lead with the actionable outcomes: decayed + updated first. */}
              <ul className="space-y-2">
                {[...lastRun.results]
                  .sort((a, b) => outcomeRank(b.outcome) - outcomeRank(a.outcome))
                  .slice(0, 10)
                  .map((res) => <RunResultRow key={res.recordId} res={res} />)}
              </ul>
            </GlassCard>
          )}

          {reverificationRuns.length > 0 && (
            <GlassCard className="p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Run history</div>
              <ul className="divide-y divide-border-subtle">
                {reverificationRuns.map((run) => (
                  <li key={run.id} className="py-2 flex items-center justify-between text-[12px]">
                    <span className="text-fg-muted">{timeAgo(run.timestamp)} · {run.checked} fields</span>
                    <span className="font-mono text-fg-subtle">{run.updated} updated · {run.decayed} decayed</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>

      {reverificationRuns.length === 0 && (
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<RefreshCw className="w-8 h-8" />}
            title="No re-verification runs yet"
            description="Run re-verification to re-check every field that's past its cadence — you'll see exactly which records updated or decayed."
            action={canMutate ? <Button variant="primary" onClick={onRun} disabled={due.length === 0}><Play className="w-4 h-4" /> Run now</Button> : <Link href="/console/logs"><Button variant="secondary">View logs <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      )}
    </div>
  );
}

const outcomeRank = (o: ReverifyOutcome) => (o === 'decayed' ? 2 : o === 'updated' ? 1 : 0);

function RunResultRow({ res }: { res: ReverificationResult }) {
  const meta = OUTCOME_META[res.outcome];
  const Icon = meta.icon;
  return (
    <motion.li initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2.5">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg">{res.entity}</span>
          <span className="text-[11px] text-fg-subtle">{fieldLabel(res.fieldType)}</span>
          <StatusBadge tone={meta.tone}>{res.outcome}</StatusBadge>
        </div>
        <p className="text-[12px] text-fg-muted leading-snug">{res.detail}{res.newValue ? <> → <span className="font-mono text-fg">{res.newValue}</span></> : null}</p>
      </div>
    </motion.li>
  );
}

function ReverifySkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 mt-6">
        <Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export default function ReverificationPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <ReverificationInner />
    </RoleGuard>
  );
}
