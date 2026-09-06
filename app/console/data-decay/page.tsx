'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlarmClock, ShieldAlert, TrendingDown, TrendingUp, Combine, Minus, Activity,
  Mail, Phone, Briefcase, Clock, CircleCheck, RotateCcw, RefreshCw, Info,
  ArrowRight, BellOff, Gauge,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  computeDecayAlerts, scoreAll, summarize, severityLabel, SEVERITY_ORDER, SNOOZE_OPTIONS,
  type DecayAlert, type DecaySeverity, type CompanyEvent, type ReverifyFieldType,
} from '@/lib/data-decay';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, Button, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';

const FIELD_ICON: Record<ReverifyFieldType, React.ElementType> = { email: Mail, phone: Phone, employment: Briefcase };
const FIELD_LABEL: Record<ReverifyFieldType, string> = { email: 'Email', phone: 'Direct phone', employment: 'Employment' };

const SEVERITY_META: Record<DecaySeverity, { tone: BadgeTone; text: string; bar: string; ring: string }> = {
  critical: { tone: 'error', text: 'text-semantic-error', bar: 'bg-semantic-error', ring: 'bg-semantic-error/10' },
  high: { tone: 'warning', text: 'text-semantic-warning', bar: 'bg-semantic-warning', ring: 'bg-semantic-warning/10' },
  medium: { tone: 'teal', text: 'text-teal', bar: 'bg-teal', ring: 'bg-teal/10' },
  low: { tone: 'neutral', text: 'text-fg-muted', bar: 'bg-fg-subtle', ring: 'bg-surface-2' },
};

const EVENT_META: Record<CompanyEvent, { icon: React.ElementType; label: string }> = {
  acquisition: { icon: Combine, label: 'M&A' },
  layoffs: { icon: TrendingDown, label: 'Layoffs' },
  rapid_growth: { icon: TrendingUp, label: 'Fast growth' },
  stable: { icon: Minus, label: 'Stable' },
};

type Tab = 'open' | 'snoozed' | 'resolved';

const horizonLabel = (days: number): string => {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days < 30) return `~${days}d`;
  const m = Math.round(days / 30);
  return `~${m}mo`;
};

function DataDecayInner() {
  const {
    decayAlertThreshold, decayAlertStates, reverificationCadence,
    snoozeDecayAlert, resolveDecayAlert, reopenDecayAlert, setDecayAlertThreshold, user,
  } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [tab, setTab] = useState<Tab>('open');
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const canMutate = user?.role !== 'billing';

  useEffect(() => {
    setPhase('loading');
    track('decay_alerts_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  const monitored = useMemo(() => scoreAll(reverificationCadence).length, [reverificationCadence]);
  const alerts = useMemo(
    () => computeDecayAlerts(reverificationCadence, decayAlertThreshold, decayAlertStates),
    [reverificationCadence, decayAlertThreshold, decayAlertStates],
  );
  const summary = useMemo(() => summarize(alerts, monitored), [alerts, monitored]);

  const byTab = useMemo(() => ({
    open: alerts.filter((a) => a.status === 'open'),
    snoozed: alerts.filter((a) => a.status === 'snoozed'),
    resolved: alerts.filter((a) => a.status === 'resolved'),
  }), [alerts]);
  const visible = byTab[tab];

  const act = (action: string, a: DecayAlert, fn: () => void, done: string) => {
    if (!canMutate) return;
    try {
      fn();
      track('decay_alert_actioned', { action, severity: a.severity });
      toast.success(done);
    } catch (e) {
      toast.error('Could not update alert', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const onSnooze = (a: DecayAlert, days: number) => {
    setSnoozeFor(null);
    act('snooze', a, () => snoozeDecayAlert(a.recordId, days), `Snoozed ${a.entity} for ${days}d`);
  };
  const onResolve = (a: DecayAlert) => act('resolve', a, () => resolveDecayAlert(a.recordId), `Resolved · ${a.entity}`);
  const onReopen = (a: DecayAlert) => act('reopen', a, () => reopenDecayAlert(a.recordId), `Reopened · ${a.entity}`);

  const onThreshold = (sev: DecaySeverity) => {
    if (!canMutate) return;
    try {
      setDecayAlertThreshold(sev);
      track('decay_threshold_changed', { severity: sev });
    } catch { /* billing — control is disabled anyway */ }
  };

  if (phase === 'loading') return <DecaySkeleton />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Data Decay Alerts"
        description="See which enriched records are about to go stale — before they do. Every record is scored for decay risk from its age, field volatility, role mobility, and company events, so you can re-verify the riskiest first."
        icon={<AlarmClock />}
        actions={
          <Link href="/console/re-verification">
            <Button variant="secondary"><RefreshCw className="w-4 h-4" /> Re-verification</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Records monitored" value={String(summary.monitored)} icon={<Gauge />} hint="High-value fields" />
        <KpiTile label="At risk" value={String(summary.atRisk)} icon={<ShieldAlert />} hint={`≥ ${severityLabel(decayAlertThreshold)}`} lowerIsBetter />
        <KpiTile label="Critical" value={String(summary.critical)} icon={<TrendingDown />} hint="Likely already stale" lowerIsBetter />
        <KpiTile label="Median horizon" value={summary.medianHorizon === null ? '—' : `${summary.medianHorizon}d`} icon={<Clock />} hint="Until projected decay" />
      </div>

      {!canMutate && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted"><Info className="w-4 h-4 text-semantic-warning" /> Billing role is read-only — triage actions and the threshold are disabled.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-6 items-start">
        {/* Threshold + explainer */}
        <div className="space-y-6">
          <GlassCard className="p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Alert threshold</div>
            <p className="text-[12px] text-fg-muted leading-relaxed mb-3">Raise an alert when a record&apos;s decay risk reaches at least this severity.</p>
            <SegmentedControl<DecaySeverity>
              options={SEVERITY_ORDER.map((s) => ({ value: s, label: severityLabel(s) }))}
              value={decayAlertThreshold}
              onChange={onThreshold}
              size="sm"
              layoutId="decay-threshold"
            />
            <div className="mt-4 pt-4 border-t border-border-subtle space-y-2.5">
              {SEVERITY_ORDER.map((s) => {
                const meta = SEVERITY_META[s];
                const count = scoreAll(reverificationCadence).filter((a) => a.severity === s).length;
                return (
                  <div key={s} className="flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${meta.bar}`} /><span className={meta.text}>{severityLabel(s)}</span></span>
                    <span className="font-mono tabular-nums text-fg-subtle">{count}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">How decay is scored</div>
            <ul className="space-y-2.5 text-[12px] text-fg-muted leading-snug">
              <li className="flex gap-2"><Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" /> Age vs. its re-check window — the dominant driver.</li>
              <li className="flex gap-2"><Activity className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" /> Field volatility — employment &gt; email &gt; phone.</li>
              <li className="flex gap-2"><Briefcase className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" /> Role mobility — senior titles change jobs more.</li>
              <li className="flex gap-2"><Combine className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" /> Company events — M&amp;A and layoffs spike churn.</li>
            </ul>
            <Link href="/console/re-verification" className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal hover:underline">
              Re-verify due records <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </GlassCard>
        </div>

        {/* Alert inbox */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <SegmentedControl<Tab>
              options={[
                { value: 'open', label: <span className="inline-flex items-center gap-1.5">Open <TabCount n={byTab.open.length} /></span> },
                { value: 'snoozed', label: <span className="inline-flex items-center gap-1.5">Snoozed <TabCount n={byTab.snoozed.length} /></span> },
                { value: 'resolved', label: <span className="inline-flex items-center gap-1.5">Resolved <TabCount n={byTab.resolved.length} /></span> },
              ]}
              value={tab}
              onChange={setTab}
              layoutId="decay-tab"
            />
          </div>

          {visible.length === 0 ? (
            <GlassCard className="p-0">
              <EmptyState
                icon={tab === 'open' ? <CircleCheck className="w-8 h-8" /> : <BellOff className="w-8 h-8" />}
                title={
                  tab === 'open' ? 'No records at risk' :
                  tab === 'snoozed' ? 'Nothing snoozed' : 'Nothing resolved yet'
                }
                description={
                  tab === 'open'
                    ? `No monitored records reach the ${severityLabel(decayAlertThreshold)} threshold. Lower the threshold to widen the net, or re-verify due records to keep it that way.`
                    : tab === 'snoozed'
                      ? 'Snoozed alerts stay hidden until their snooze expires, then quietly reappear here as open.'
                      : 'Resolved alerts land here — reopen one if it needs another look.'
                }
                action={tab === 'open' ? (
                  <Link href="/console/re-verification"><Button variant="secondary">Re-verify records <ArrowRight className="w-4 h-4" /></Button></Link>
                ) : undefined}
              />
            </GlassCard>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((a) => (
                  <AlertRow
                    key={a.recordId}
                    alert={a}
                    canMutate={canMutate}
                    snoozeOpen={snoozeFor === a.recordId}
                    onToggleSnooze={() => setSnoozeFor(snoozeFor === a.recordId ? null : a.recordId)}
                    onSnooze={(d) => onSnooze(a, d)}
                    onResolve={() => onResolve(a)}
                    onReopen={() => onReopen(a)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabCount({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-subtle">{n}</span>;
}

function AlertRow({
  alert, canMutate, snoozeOpen, onToggleSnooze, onSnooze, onResolve, onReopen,
}: {
  alert: DecayAlert;
  canMutate: boolean;
  snoozeOpen: boolean;
  onToggleSnooze: () => void;
  onSnooze: (days: number) => void;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const sev = SEVERITY_META[alert.severity];
  const FieldIcon = FIELD_ICON[alert.fieldType];
  const Event = EVENT_META[alert.companyEvent];
  const pct = Math.round(alert.probability * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <GlassCard className="p-0 overflow-hidden">
        <div className="flex">
          {/* Severity stripe */}
          <div className={`w-1 shrink-0 ${sev.bar}`} aria-hidden />
          <div className="flex-1 p-4">
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-lg ${sev.ring} border border-border flex items-center justify-center shrink-0 ${sev.text}`}>
                <FieldIcon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-fg truncate">{alert.entity}</span>
                  <span className="text-[12px] text-fg-subtle">· {alert.company}</span>
                  <StatusBadge tone={sev.tone}>{severityLabel(alert.severity)}</StatusBadge>
                  {alert.companyEvent !== 'stable' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted px-1.5 py-0.5 rounded-full bg-surface-2 border border-border-subtle">
                      <Event.icon className="w-3 h-3" /> {Event.label}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-fg-subtle truncate mt-0.5">{FIELD_LABEL[alert.fieldType]} · {alert.value}</div>
              </div>
              {/* Probability + horizon */}
              <div className="text-right shrink-0">
                <div className={`text-lg font-bold tabular-nums leading-none ${sev.text}`}>{pct}%</div>
                <div className="text-[10px] text-fg-subtle mt-1">decays {horizonLabel(alert.daysToDecay)}</div>
              </div>
            </div>

            {/* Probability bar */}
            <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${sev.bar}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            {/* Factor chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {alert.factors.slice(0, 3).map((f) => (
                <span key={f.label} title={f.detail} className="text-[10.5px] text-fg-muted px-2 py-0.5 rounded-md bg-surface-2 border border-border-subtle">
                  {f.label}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Link href={`/console/re-verification`}>
                <Button variant="primary" size="sm"><RefreshCw className="w-3.5 h-3.5" /> Re-verify</Button>
              </Link>
              {alert.status === 'open' && canMutate && (
                <div className="relative">
                  <Button variant="ghost" size="sm" onClick={onToggleSnooze} aria-haspopup="menu" aria-expanded={snoozeOpen}><AlarmClock className="w-3.5 h-3.5" /> Snooze</Button>
                  <AnimatePresence>
                    {snoozeOpen && (
                      <>
                        {/* Click-away backdrop so the menu dismisses on an outside click. */}
                        <button type="button" aria-label="Close snooze menu" className="fixed inset-0 z-[9] cursor-default" onClick={onToggleSnooze} />
                        <motion.div
                          role="menu"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          onKeyDown={(e) => { if (e.key === 'Escape') onToggleSnooze(); }}
                          className="absolute z-10 mt-1 left-0 bg-glass backdrop-blur-xl border border-border rounded-xl p-1 shadow-lg"
                        >
                          {SNOOZE_OPTIONS.map((d) => (
                            <button
                              key={d}
                              role="menuitem"
                              onClick={() => onSnooze(d)}
                              className="block w-full text-left text-[12px] px-3 py-1.5 rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
                            >
                              {d} days
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {alert.status === 'open' && canMutate && (
                <Button variant="ghost" size="sm" onClick={onResolve}><CircleCheck className="w-3.5 h-3.5" /> Resolve</Button>
              )}
              {alert.status !== 'open' && canMutate && (
                <Button variant="ghost" size="sm" onClick={onReopen}><RotateCcw className="w-3.5 h-3.5" /> Reopen</Button>
              )}
              {alert.status === 'snoozed' && alert.snoozedUntil && (
                <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1"><Clock className="w-3 h-3" /> until {new Date(alert.snoozedUntil).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function DecaySkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-6">
        <Skeleton className="h-64 rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}

export default function DataDecayPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <DataDecayInner />
    </RoleGuard>
  );
}
