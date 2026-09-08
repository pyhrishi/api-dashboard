'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  TrendingUp, Zap, Key, Play, Users, CreditCard, Sparkles, Radio, Copy, Check, ChevronDown,
  Activity, Flame, Gauge, AlertTriangle, ShieldCheck, Clock, BarChart3, LifeBuoy, ArrowRight,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useNudgeState, nudgeStats, nudgeById } from '@/lib/nudges';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { track, isPostHogEnabled, type TelemetryEventRecord, type TelemetryEventName } from '@/lib/telemetry';
import {
  buildSnapshot, pmReportMarkdown, formatDuration, SCENARIOS, DURATION_BUCKETS, ACTIVATION_TARGET_MS, COHORT_SIZE,
  type KpiScope, type KpiScenario, type KpiSnapshot, type LiveWorkspaceInput, type LiveAlertInputs,
  type FunnelStage, type UsageBand, type RevenueCohort, type AlertEvaluation, type DurationStats,
} from '@/lib/growth-kpis';
import { cn } from '@/lib/utils';
import { useAlertCenter, effectiveRules, openIncidents } from '@/lib/growth-alerts';
import {
  PageHeader, KpiTile, GlassCard, DataTable, EmptyState, StatusBadge, ConfirmAction, Sparkline, SegmentedControl, Button, Skeleton,
  type Column, type BadgeTone,
} from '@/components/ui';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const LOADING_MS = 240;
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd = (n: number) => usdFmt.format(n);
const count = (events: TelemetryEventRecord[], name: TelemetryEventName) => events.reduce((n, e) => n + (e.name === name ? 1 : 0), 0);

const relTime = (iso: string, now: number) => {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};

const CATEGORY: Record<string, BadgeTone> = {
  signup_completed: 'teal', onboarding_step_completed: 'teal', api_key_created: 'teal', first_call_made: 'teal', explorer_run: 'teal', feature_viewed: 'neutral',
  quota_threshold_reached: 'warning', upgrade_prompt_shown: 'warning', upgrade_prompt_clicked: 'success', upgrade_prompt_dismissed: 'neutral', plan_upgraded: 'success', credits_recharged: 'success',
  invite_sent: 'info', invite_accepted: 'info', referral_code_applied: 'info', org_created: 'info',
  webhook_created: 'neutral', export_downloaded: 'neutral', alert_rule_created: 'neutral', feature_abandoned: 'error',
  destructive_action_confirmed: 'warning', credits_recharge_failed: 'error', docs_search_performed: 'neutral',
  growth_kpis_viewed: 'neutral', growth_kpi_scope_changed: 'neutral', growth_scenario_changed: 'neutral', growth_alert_inspected: 'neutral', growth_pm_report_copied: 'neutral',
};

const BAND_TONE: Record<FunnelStage['band'], BadgeTone> = { TOFU: 'neutral', MOFU: 'teal', BOFU: 'success' };
const dropTone = (pct: number): BadgeTone => (pct >= 40 ? 'error' : pct >= 20 ? 'warning' : 'neutral');
const alertTone = (status: AlertEvaluation['status']): BadgeTone => (status === 'firing' ? 'error' : status === 'ok' ? 'success' : 'neutral');
const OWNER_TONE: Record<AlertEvaluation['owner'], BadgeTone> = { Product: 'teal', Eng: 'warning', 'Docs owner': 'info' };

const fmtAlertValue = (a: AlertEvaluation) => {
  if (a.value === null) return '—';
  if (a.unit === 'pp') return `${a.value > 0 ? '+' : a.value < 0 ? '−' : ''}${Math.abs(a.value)} pp`;
  return `${a.value}%`;
};
const fmtThreshold = (a: AlertEvaluation) => `${a.comparator === 'lt' ? '<' : '>'} ${a.threshold < 0 ? `−${Math.abs(a.threshold)}` : a.threshold}${a.unit === 'pp' ? ' pp' : '%'}`;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// ─── small building blocks ────────────────────────────────────────────────────

function SectionTitle({ icon, title, note, badge }: { icon?: ReactNode; title: string; note: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted flex items-center gap-2">
          {icon && <span className="text-teal [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
          {title}
        </h3>
        <p className="text-xs text-fg-muted mt-1">{note}</p>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}

function StatGrid({ stats, size = 'md' }: { stats: DurationStats; size?: 'md' | 'sm' }) {
  const cells: [string, number][] = [['Min', stats.min], ['Median', stats.median], ['Avg', stats.avg], ['p90', stats.p90], ['Max', stats.max]];
  return (
    <div className="grid grid-cols-5 gap-2">
      {cells.map(([label, v]) => (
        <div key={label} className="rounded-xl border border-border-subtle bg-glass px-2 py-2 text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{label}</div>
          <div className={cn('font-extrabold text-fg tabular-nums mt-0.5', size === 'md' ? 'text-base' : 'text-sm')}>{formatDuration(v)}</div>
        </div>
      ))}
    </div>
  );
}

function BarColumns({ values, labels, ariaLabel }: { values: number[]; labels: readonly string[]; ariaLabel: string }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={ariaLabel} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map((v, i) => (
        <div key={labels[i]} className="flex flex-col items-center gap-1" title={`${labels[i]}: ${v}`}>
          <span className="text-[10px] tabular-nums text-fg-muted">{v}</span>
          <div className="w-full h-16 rounded-md bg-overlay overflow-hidden flex items-end">
            <motion.div initial={{ height: 0 }} animate={{ height: `${(v / max) * 100}%` }} transition={{ duration: 0.4 }} className={cn('w-full rounded-md', v > 0 ? 'bg-teal' : 'bg-transparent')} />
          </div>
          <span className="text-[10px] text-fg-muted whitespace-nowrap">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressLine({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-overlay overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.45 }} className="h-full rounded-full bg-teal" />
    </div>
  );
}

function LoadingLayout() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading growth KPIs">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {['Activation rate', 'Median time-to-activate', 'Free → paid', 'Stickiness DAU/WAU'].map(l => <KpiTile key={l} label={l} value="" loading />)}
      </div>
      <Skeleton variant="block" className="h-[360px] w-full" />
      <div className="grid lg:grid-cols-2 gap-6"><Skeleton variant="block" className="h-[300px]" /><Skeleton variant="block" className="h-[300px]" /></div>
      <Skeleton variant="block" className="h-[420px] w-full" />
      <div className="grid lg:grid-cols-2 gap-6"><Skeleton variant="block" className="h-[260px]" /><Skeleton variant="block" className="h-[260px]" /></div>
      <Skeleton variant="block" className="h-[520px] w-full" />
      <Skeleton variant="block" className="h-[280px] w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[0, 1, 2].map(i => <KpiTile key={i} label=" " value="" loading />)}</div>
      <Skeleton variant="block" className="h-[320px] w-full" />
      <Skeleton variant="block" className="h-[160px] w-full" />
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function GrowthPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    telemetryEvents, apiLogs, user, organizations, activeOrganizationId, isFirstCallMade, firstCallTimestamp,
    activeKeys, creditBalance, billingDetails, teamMembers, supportTickets, clearTelemetryEvents,
  } = useStore();
  const nudgeRecords = useNudgeState((s) => s.records);
  const nudgeStatsData = useMemo(() => nudgeStats({ records: nudgeRecords } as Parameters<typeof nudgeStats>[0]), [nudgeRecords]);
  const topNudges = useMemo(() => Object.keys(nudgeRecords).map((id) => nudgeRecords[id]).filter((r) => r.seenCount > 0).sort((a, b) => b.seenCount - a.seenCount).slice(0, 6), [nudgeRecords]);

  const [scope, setScope] = useState<KpiScope>('population');
  const [scenario, setScenario] = useState<KpiScenario>('current');
  const [now, setNow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const viewedRef = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const t = window.setTimeout(() => setLoading(false), LOADING_MS);
    return () => window.clearTimeout(t);
  }, []);

  const live = useMemo<LiveWorkspaceInput>(() => ({
    events: telemetryEvents,
    requestLog: apiLogs.map(l => ({ timestamp: l.timestamp, path: l.path })),
    email: user?.email ?? null,
    company: user?.company ?? null,
    orgCreatedAt: organizations.find(o => o.id === activeOrganizationId)?.createdAt ?? null,
    isFirstCallMade,
    firstCallTimestamp: firstCallTimestamp ?? null,
    activeKeyCount: activeKeys.length,
    creditBalance,
    plan: billingDetails.plan,
    teamSize: teamMembers.length,
    supportTickets: supportTickets.length,
  }), [telemetryEvents, apiLogs, user, organizations, activeOrganizationId, isFirstCallMade, firstCallTimestamp, activeKeys.length, creditBalance, billingDetails.plan, teamMembers.length, supportTickets.length]);

  // Org threshold overrides (Alert Center) shape the rules this page evaluates; scenario
  // rehearsals open tagged incidents so the delivery path can be walked end to end.
  const thresholds = useAlertCenter((s) => s.thresholds);
  const openAlertTotal = useAlertCenter((s) => openIncidents(s.incidents).length);

  const liveAlerts = useMemo<LiveAlertInputs>(() => ({
    topupAttempts: count(telemetryEvents, 'credits_recharged') + count(telemetryEvents, 'credits_recharge_failed'),
    topupFailures: count(telemetryEvents, 'credits_recharge_failed'),
    docsSearches: count(telemetryEvents, 'docs_search_performed'),
    docsNoResults: telemetryEvents.reduce((n, e) => n + (e.name === 'docs_search_performed' && e.props.noResults === true ? 1 : 0), 0),
    // Trial-gate OTP (shared auth service) — its console events land in the same log.
    otpChallenges: count(telemetryEvents, 'otp_challenge_shown'),
    otpVerified: count(telemetryEvents, 'otp_verified'),
  }), [telemetryEvents]);

  const snapshot = useMemo<KpiSnapshot | null>(
    () => (now === null ? null : buildSnapshot({ scope, scenario, now, live, liveAlerts, rules: effectiveRules(thresholds) })),
    [scope, scenario, now, live, liveAlerts, thresholds],
  );

  // Scenario rehearsals walk the real delivery path: firing rules open incidents tagged
  // "rehearsal" (routed like live ones); returning to the current week resolves them.
  useEffect(() => {
    if (!snapshot || now === null) return;
    const center = useAlertCenter.getState();
    if (scenario === 'current') { center.resolveRehearsals(Date.now()); return; }
    const { fired } = center.recordEvaluation(snapshot.alerts, { now: Date.now(), orgId: activeOrganizationId ?? null, source: 'rehearsal', scenario });
    fired.forEach((inc) => track('growth_alert_fired', { rule: inc.ruleId, owner: inc.owner, value: inc.value, source: 'rehearsal', scenario }));
  }, [snapshot, scenario, now, activeOrganizationId]);

  useEffect(() => {
    if (!snapshot || viewedRef.current) return;
    viewedRef.current = true;
    track('growth_kpis_viewed', { scope: snapshot.scope, scenario: snapshot.scenario, developers: snapshot.developers.length });
  }, [snapshot]);

  const changeScope = (s: KpiScope) => { setScope(s); track('growth_kpi_scope_changed', { scope: s }); };
  const changeScenario = (s: KpiScenario) => { setScenario(s); track('growth_scenario_changed', { scenario: s }); };

  const firing = snapshot ? snapshot.alerts.filter(a => a.status === 'firing').length : 0;

  const copyReport = async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(pmReportMarkdown(snapshot));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      track('growth_pm_report_copied', { scope, scenario, firing });
      toast.success('PM report copied', 'Markdown — paste it into your weekly doc.');
    } catch {
      toast.error('Could not copy the report', 'Clipboard access was blocked by the browser.');
    }
  };

  const toggleAlert = (a: AlertEvaluation) => {
    const next = !expanded[a.id];
    setExpanded(prev => ({ ...prev, [a.id]: next }));
    if (next) track('growth_alert_inspected', { rule: a.id, status: a.status });
  };

  // ── derived view helpers (presentation only — all numbers are from the SSOT) ──
  const biggestLeakKey = useMemo(() => {
    if (!snapshot) return null;
    const worst = snapshot.funnel.slice(1).reduce<FunnelStage | null>((w, st) => (st.dropOffPct > 0 && (!w || st.dropOffPct > w.dropOffPct) ? st : w), null);
    return worst?.key ?? null;
  }, [snapshot]);

  const scenarioMeta = SCENARIOS.find(s => s.id === scenario) ?? SCENARIOS[0];
  const recent = useMemo(() => [...telemetryEvents].reverse(), [telemetryEvents]);
  const hasEvents = telemetryEvents.length > 0;
  const nowMs = now ?? 0;

  const eventColumns: Column<TelemetryEventRecord>[] = [
    { key: 'name', header: 'Event', render: e => <StatusBadge tone={CATEGORY[e.name] ?? 'neutral'}>{e.name.replace(/_/g, ' ')}</StatusBadge>, sortValue: e => e.name },
    { key: 'props', header: 'Properties', render: e => <span className="font-mono text-xs text-fg-muted truncate block max-w-[22rem]">{Object.keys(e.props).length ? JSON.stringify(e.props) : '—'}</span> },
    { key: 'environment', header: 'Env', render: e => <span className="text-xs uppercase text-fg-muted">{e.environment}</span>, sortValue: e => e.environment },
    { key: 'timestamp', header: 'When', align: 'right', render: e => <span className="text-xs text-fg-muted whitespace-nowrap">{relTime(e.timestamp, nowMs)}</span>, sortValue: e => e.timestamp },
  ];

  const bandColumns: Column<UsageBand>[] = [
    { key: 'label', header: 'Band', render: b => <span className="inline-flex items-center gap-2 font-semibold text-fg">{b.label}{b.power && <StatusBadge tone="teal">power</StatusBadge>}</span> },
    { key: 'developers', header: 'Developers', align: 'right', render: b => <span className="tabular-nums">{b.developers}</span>, sortValue: b => b.developers },
    { key: 'calls7d', header: 'Calls (7d)', align: 'right', render: b => <span className="tabular-nums">{b.calls7d.toLocaleString('en-US')}</span>, sortValue: b => b.calls7d },
    { key: 'callShare', header: 'Share of calls', render: b => (
      <div className="flex items-center gap-3 min-w-[10rem]">
        <div className="flex-1 h-1.5 rounded-full bg-overlay overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${b.callShare}%` }} transition={{ duration: 0.45 }} className="h-full rounded-full bg-teal" /></div>
        <span className="text-xs tabular-nums text-fg-muted w-12 text-right">{b.callShare}%</span>
      </div>
    ), sortValue: b => b.callShare },
    { key: 'minCalls', header: 'Min calls to qualify', align: 'right', render: b => <span className="tabular-nums text-fg-muted">{b.minCalls.toLocaleString('en-US')}</span>, sortValue: b => b.minCalls },
  ];

  const cohortColumns: Column<RevenueCohort>[] = [
    { key: 'signupMonth', header: 'Signup month', render: c => <span className="font-semibold text-fg">{monthLabel(c.signupMonth)}</span>, sortValue: c => c.signupMonth },
    { key: 'developers', header: 'Developers', align: 'right', render: c => <span className="tabular-nums">{c.developers}</span>, sortValue: c => c.developers },
    { key: 'activated', header: 'Activated', align: 'right', render: c => <span className="tabular-nums">{c.activated}</span>, sortValue: c => c.activated },
    { key: 'paid', header: 'Paid', align: 'right', render: c => <span className="tabular-nums">{c.paid}</span>, sortValue: c => c.paid },
    { key: 'paidConversionPct', header: 'Paid %', align: 'right', render: c => <span className="tabular-nums">{c.paidConversionPct}%</span>, sortValue: c => c.paidConversionPct },
    { key: 'revenueUsd', header: 'Revenue', align: 'right', render: c => <span className="tabular-nums font-semibold text-fg">{usd(c.revenueUsd)}</span>, sortValue: c => c.revenueUsd },
    { key: 'revenuePerDeveloper', header: 'Revenue / dev', align: 'right', render: c => <span className="tabular-nums text-fg-muted">{usd(c.revenuePerDeveloper)}</span>, sortValue: c => c.revenuePerDeveloper },
  ];

  const goExplorer = () => router.push('/console/explorer');
  const ready = !loading && snapshot !== null;
  const s = snapshot;

  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <div className="space-y-6 animate-fade-in pb-12">
        <PageHeader
          icon={<TrendingUp />}
          title="Growth"
          description="The PLG scorecard — TOFU → MOFU → BOFU activation funnel with drop-off, time-to-activate against the 10-minute target, power users, trial → paid, engagement, revenue cohorts, health and alerting. Derived live from this workspace's product data."
          actions={
            <>
              <StatusBadge tone={isPostHogEnabled ? 'success' : 'neutral'} dot pulse={isPostHogEnabled}>
                <Radio className="w-3 h-3" /> {isPostHogEnabled ? 'Forwarding to PostHog' : 'In-product only'}
              </StatusBadge>
              <Button size="sm" variant="secondary" onClick={copyReport} disabled={!ready} icon={copied ? <Check /> : <Copy />} aria-label="Copy the PM report as Markdown">
                {copied ? 'Copied' : 'Copy PM report'}
              </Button>
              {hasEvents && (
                <ConfirmAction size="sm" variant="ghost" onConfirm={clearTelemetryEvents} confirmLabel="Confirm clear">
                  Clear events
                </ConfirmAction>
              )}
            </>
          }
        />

        {/* Controls */}
        <GlassCard padding="sm" className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Scope</div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl<KpiScope>
                layoutId="growth-scope"
                size="sm"
                value={scope}
                onChange={changeScope}
                options={[{ value: 'workspace', label: 'Your workspace' }, { value: 'population', label: 'Sample cohort + you' }]}
              />
              {scope === 'population' && <StatusBadge tone="info" dot>sample cohort · {COHORT_SIZE} seeded developers + you</StatusBadge>}
            </div>
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Scenario</div>
            <SegmentedControl<KpiScenario>
              layoutId="growth-scenario"
              size="sm"
              value={scenario}
              onChange={changeScenario}
              options={SCENARIOS.map(sc => ({ value: sc.id, label: sc.label }))}
            />
            <p className="text-xs text-fg-muted max-w-xl">{scenarioMeta.description}</p>
          </div>
        </GlassCard>

        {!ready || !s ? <LoadingLayout /> : (
          <>
            {/* 1 · KPI row */}
            <motion.div {...SECTION} transition={{ delay: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiTile label="Activation rate" value={`${s.activationRatePct}%`} icon={<Zap />} trend={s.activationRateWoW.deltaPp ?? undefined} trendUnit=" pp" hint={s.activationRateWoW.deltaPp === null ? 'signup → first call · needs two weeks of signups for WoW' : 'vs last week (pp) · signup → first call'} />
              <KpiTile label="Median time-to-activate" value={s.timeToActivate ? formatDuration(s.timeToActivate.median) : '—'} icon={<Clock />} lowerIsBetter hint={s.timeToActivate ? `${s.timeToActivate.withinTargetPct}% within the 10-min target` : 'no activations yet'} />
              <KpiTile label="Free → paid" value={`${s.conversion.freeToPaidPct}%`} icon={<CreditCard />} hint={`${s.conversion.paid} paid · ${s.conversion.withWallet} with wallet balance`} />
              <KpiTile label="Stickiness DAU/WAU" value={`${s.engagement.stickiness}%`} icon={<Activity />} hint={`DAU ${s.engagement.dauToday} · WAU ${s.engagement.wauToday}`} />
            </motion.div>

            {/* 2 · Funnel */}
            <motion.div {...SECTION} transition={{ delay: 0.05 }}>
              <GlassCard>
                <SectionTitle icon={<Zap />} title="Activation funnel" note="Every developer in scope, from account creation to money in the wallet. Drop-off is measured against the previous stage." />
                <ol className="space-y-2">
                  {s.funnel.map((st, i) => {
                    const newBand = i === 0 || s.funnel[i - 1].band !== st.band;
                    const leak = st.key === biggestLeakKey;
                    return (
                      <li key={st.key} className="space-y-2">
                        {newBand && <div className="flex items-center gap-2 pt-2 first:pt-0"><StatusBadge tone={BAND_TONE[st.band]}>{st.band}</StatusBadge><span className="h-px flex-1 bg-border-subtle" /></div>}
                        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className={cn('grid grid-cols-[minmax(0,14rem)_1fr_auto_auto] items-center gap-4 rounded-xl border px-4 py-3', leak ? 'border-semantic-warning/40 bg-semantic-warning/5' : 'border-border bg-glass')}>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-fg flex items-center gap-2 flex-wrap">{st.label}{leak && <StatusBadge tone="warning">biggest leak</StatusBadge>}</div>
                            <div className="text-xs text-fg-muted truncate">{st.description}</div>
                          </div>
                          <div className="h-2.5 rounded-full bg-overlay overflow-hidden" title={`${st.pctOfTop}% of signups`}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${st.pctOfTop}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} className="h-full rounded-full bg-teal" />
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-extrabold text-fg tabular-nums">{st.count.toLocaleString('en-US')}</div>
                            <div className="text-[10px] text-fg-muted tabular-nums">{st.pctOfTop}% of top</div>
                          </div>
                          <div className="w-28 flex justify-end">
                            {i === 0 ? <StatusBadge tone="neutral">top of funnel</StatusBadge> : <StatusBadge tone={dropTone(st.dropOffPct)}>−{st.dropOffPct}%</StatusBadge>}
                          </div>
                        </motion.div>
                      </li>
                    );
                  })}
                </ol>
              </GlassCard>
            </motion.div>

            {/* 3 · Time to activate / first key */}
            <motion.div {...SECTION} transition={{ delay: 0.1 }} className="grid lg:grid-cols-[3fr_2fr] gap-6 items-start">
              <GlassCard>
                <SectionTitle icon={<Clock />} title="Time to activate" note="Signup → first successful API call, across every activated developer in scope." />
                {s.timeToActivate ? (
                  <div className="space-y-5">
                    <StatGrid stats={s.timeToActivate} />
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-fg-muted">Target &lt;{formatDuration(ACTIVATION_TARGET_MS)} · <span className="text-fg font-semibold">{s.timeToActivate.withinTargetPct}%</span> make it</span>
                        <span className="text-fg-muted tabular-nums">n = {s.timeToActivate.n}</span>
                      </div>
                      <ProgressLine pct={s.timeToActivate.withinTargetPct} />
                    </div>
                    <BarColumns values={s.timeToActivate.histogram} labels={DURATION_BUCKETS} ariaLabel={`Time-to-activate histogram: ${DURATION_BUCKETS.map((b, i) => `${b} ${s.timeToActivate?.histogram[i] ?? 0}`).join(', ')}`} />
                  </div>
                ) : (
                  <EmptyState icon={<Play />} title="No activations yet" description="Time-to-activate appears once a developer in this scope makes a first successful call." action={<Button size="sm" onClick={goExplorer} icon={<Play />}>Run your first call</Button>} />
                )}
              </GlassCard>
              <GlassCard>
                <SectionTitle icon={<Key />} title="Time to first key" note="Signup → first API key created. The shortest path in the product." />
                {s.timeToFirstKey ? (
                  <div className="space-y-4">
                    <StatGrid stats={s.timeToFirstKey} size="sm" />
                    <BarColumns values={s.timeToFirstKey.histogram} labels={DURATION_BUCKETS} ariaLabel={`Time-to-first-key histogram: ${DURATION_BUCKETS.map((b, i) => `${b} ${s.timeToFirstKey?.histogram[i] ?? 0}`).join(', ')}`} />
                  </div>
                ) : (
                  <EmptyState icon={<Key />} title="No keys created yet" description="Create an API key to start the clock." action={<Button size="sm" variant="secondary" onClick={() => router.push('/console/keys')} icon={<Key />}>Create a key</Button>} />
                )}
              </GlassCard>
            </motion.div>

            {/* 4 · Power users */}
            <motion.div {...SECTION} transition={{ delay: 0.15 }}>
              <GlassCard>
                <SectionTitle icon={<Flame />} title="Power users by usage band" note="Activated developers ranked by 7-day calls, cut into 10% bands. The top two bands are your power users." />
                {s.bands.every(b => b.developers === 0) ? (
                  <EmptyState icon={<Flame />} title="No calls in the last 7 days" description="Bands populate as developers in this scope make calls." action={<Button size="sm" onClick={goExplorer} icon={<Play />}>Run a call</Button>} />
                ) : (
                  <DataTable columns={bandColumns} rows={s.bands} rowKey={b => b.label} />
                )}
              </GlassCard>
            </motion.div>

            {/* 5 · BOFU */}
            <motion.div {...SECTION} transition={{ delay: 0.2 }} className="grid lg:grid-cols-2 gap-6 items-start">
              <GlassCard>
                <SectionTitle icon={<Gauge />} title="Trial usage" note="How much of the trial allotment activated developers consume — the upgrade prompt belongs at 100%." />
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-4xl font-extrabold text-fg tabular-nums">{s.trial.fullyUsedPct}%</span>
                  <span className="text-sm text-fg-muted pb-1">of activated developers used 100% of trial credits</span>
                </div>
                <p className="text-xs text-fg-muted mb-5">{s.trial.fullyUsed} of {s.trial.developers} activated · average {s.trial.avgUsedPct}% consumed</p>
                {s.trial.developers === 0 ? (
                  <p className="text-sm text-fg-muted rounded-xl border border-dashed border-border px-4 py-6 text-center">No activated developers in this scope yet — the distribution fills in after the first call.</p>
                ) : (
                  <BarColumns values={s.trial.distribution} labels={['0–24%', '25–49%', '50–74%', '75–99%', '100%']} ariaLabel={`Trial credits used: ${s.trial.distribution.join(', ')} developers across 0–24, 25–49, 50–74, 75–99 and 100 percent`} />
                )}
              </GlassCard>
              <GlassCard>
                <SectionTitle icon={<CreditCard />} title="Free → paid" note="Customers who recharged or upgraded, and the revenue they brought." />
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="rounded-xl border border-border-subtle bg-glass p-3"><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Paid / signups</div><div className="text-lg font-extrabold text-fg tabular-nums mt-0.5">{s.conversion.paid} <span className="text-fg-muted font-medium">/ {s.conversion.signups}</span></div></div>
                  <div className="rounded-xl border border-border-subtle bg-glass p-3"><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">With wallet</div><div className="text-lg font-extrabold text-fg tabular-nums mt-0.5">{s.conversion.withWallet}</div></div>
                  <div className="rounded-xl border border-border-subtle bg-glass p-3"><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Revenue</div><div className="text-lg font-extrabold text-fg tabular-nums mt-0.5">{usd(s.conversion.revenueUsd)}</div></div>
                </div>
                <div className="space-y-2">
                  {[s.funnel[0], s.funnel[3], s.funnel[4]].map(st => (
                    <div key={st.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="text-fg-muted truncate">{st.label}</span>
                      <div className="h-2 rounded-full bg-overlay overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${st.pctOfTop}%` }} transition={{ duration: 0.5 }} className="h-full rounded-full bg-teal" /></div>
                      <span className="tabular-nums font-semibold text-fg w-14 text-right">{st.count.toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>

            {/* 6 · Engagement + heatmap */}
            <motion.div {...SECTION} transition={{ delay: 0.25 }}>
              <GlassCard className="space-y-6">
                <div>
                  <SectionTitle icon={<Activity />} title="Engagement" note="Developers making at least one call — daily and trailing-7-day, over the last 28 days." />
                  <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-center">
                    <div className="relative h-20" role="img" aria-label={`DAU today ${s.engagement.dauToday}, WAU today ${s.engagement.wauToday}, 28-day series`}>
                      <div className="absolute inset-0 text-teal"><Sparkline values={s.engagement.wau} width={560} height={80} className="w-full h-20" /></div>
                      <div className="absolute inset-0 text-fg-muted"><Sparkline values={s.engagement.dau} width={560} height={80} filled={false} className="w-full h-20" /></div>
                    </div>
                    <div className="flex lg:flex-col gap-4 lg:gap-2 text-sm">
                      <div className="flex items-center gap-2"><span className="w-2.5 h-0.5 rounded bg-teal" /><span className="text-fg-muted">WAU</span><span className="font-extrabold text-fg tabular-nums">{s.engagement.wauToday}</span></div>
                      <div className="flex items-center gap-2"><span className="w-2.5 h-0.5 rounded bg-fg-muted" /><span className="text-fg-muted">DAU</span><span className="font-extrabold text-fg tabular-nums">{s.engagement.dauToday}</span></div>
                      <div className="flex items-center gap-2"><span className="w-2.5 h-0.5 rounded bg-transparent" /><span className="text-fg-muted">Stickiness</span><span className="font-extrabold text-fg tabular-nums">{s.engagement.stickiness}%</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <SectionTitle icon={<BarChart3 />} title="Endpoint utilization heatmap" note="Calls per endpoint by UTC hour. Your request log is counted exactly; the cohort's mix follows regional business hours."
                    badge={s.heatmap.peakHour !== null ? <StatusBadge tone="teal" dot>peak {String(s.heatmap.peakHour).padStart(2, '0')}:00 UTC</StatusBadge> : undefined} />
                  {s.heatmap.total === 0 ? (
                    <EmptyState icon={<BarChart3 />} title="No calls logged yet" description="The heatmap lights up as requests hit the gateway from this scope." action={<Button size="sm" onClick={goExplorer} icon={<Play />}>Run a call</Button>} />
                  ) : (
                    <div className="overflow-x-auto">
                      <div role="img" aria-label={`Endpoint utilization heatmap: ${s.heatmap.rows.length} endpoints × 24 UTC hours, ${s.heatmap.total.toLocaleString('en-US')} calls, busiest endpoint ${s.heatmap.rows[0]?.name ?? '—'}, peak hour ${s.heatmap.peakHour ?? '—'}:00 UTC`}
                        className="grid gap-y-1 gap-x-0.5 min-w-[40rem]" style={{ gridTemplateColumns: 'minmax(0, 13rem) repeat(24, minmax(0, 1fr))' }}>
                        <div />
                        {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-[9px] text-fg-muted tabular-nums text-center">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>)}
                        {s.heatmap.rows.map(row => (
                          <div key={row.endpointId} className="contents">
                            <div className="pr-3 min-w-0 flex flex-col justify-center">
                              <div className="text-xs font-semibold text-fg truncate">{row.name}</div>
                              <div className="text-[10px] font-mono text-fg-muted truncate">{row.path}</div>
                            </div>
                            {row.hours.map((v, h) => (
                              <div key={h} className="h-7 flex items-center">
                                <div className={cn('w-full h-6 rounded-sm', v > 0 ? 'bg-teal' : 'bg-transparent')}
                                  style={{ opacity: v > 0 ? Math.max(0.06, v / Math.max(1, s.heatmap.max)) : 0 }}
                                  title={`${row.name} · ${String(h).padStart(2, '0')}:00 UTC · ${v.toLocaleString('en-US')} calls`} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            </motion.div>

            {/* 7 · Revenue cohorts */}
            <motion.div {...SECTION} transition={{ delay: 0.3 }}>
              <GlassCard>
                <SectionTitle icon={<BarChart3 />} title="Revenue by signup cohort" note="Developers grouped by the month they signed up — who activates, who pays, and what each cohort is worth." badge={scope === 'population' ? <StatusBadge tone="info">sample cohort</StatusBadge> : undefined} />
                <DataTable columns={cohortColumns} rows={s.revenueCohorts} rowKey={c => c.signupMonth} initialSort={{ key: 'signupMonth', dir: 'desc' }}
                  emptyTitle="No cohorts yet" emptyDescription="Cohorts form from the first signup in scope." />
              </GlassCard>
            </motion.div>

            {/* 8 · Health */}
            <motion.div {...SECTION} transition={{ delay: 0.35 }} className="space-y-3">
              <SectionTitle icon={<ShieldCheck />} title="Health" note="Support load, destructive-action safety and the team-invite loop across activated developers." badge={scope === 'population' ? <StatusBadge tone="info">sample cohort</StatusBadge> : undefined} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiTile label="Tickets per active dev" value={s.health.ticketsPerActiveDev} icon={<LifeBuoy />} lowerIsBetter hint={`${s.health.supportTickets} tickets · ${s.health.activeDevelopers} active developers`} />
                <KpiTile label="Destructive-action incident rate" value={`${s.health.incidentRatePct}%`} icon={<ShieldCheck />} lowerIsBetter hint={`${s.health.destructiveReverts} of ${s.health.destructiveActions} reverted`} />
                <KpiTile label="Team invites" value={s.health.invitesSent} icon={<Users />} hint={`${s.health.invitesAccepted} accepted · ${s.health.invitesPerActivatedDev} per activated dev`} />
              </div>
            </motion.div>

            {/* 9 · Alerts */}
            <motion.div {...SECTION} transition={{ delay: 0.4 }}>
              <GlassCard>
                <SectionTitle icon={<AlertTriangle />} title="Alerting thresholds" note="Each rule routes to an owner. Switch the scenario above to rehearse: firing rules open tagged incidents and deliveries in the Alert Center."
                  badge={
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={firing > 0 ? 'error' : 'success'} dot pulse={firing > 0}>{firing > 0 ? `${firing} firing` : 'all clear'}</StatusBadge>
                      <Link href="/console/alerts" className="text-[12px] font-bold text-teal hover:underline inline-flex items-center gap-1 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">
                        Alert Center{openAlertTotal > 0 ? ` · ${openAlertTotal} open` : ''}
                      </Link>
                    </div>
                  } />
                <ul className="space-y-2">
                  {s.alerts.map(a => {
                    const open = !!expanded[a.id];
                    return (
                      <li key={a.id} className={cn('rounded-xl border', a.status === 'firing' ? 'border-semantic-error/30 bg-semantic-error/5' : 'border-border bg-glass')}>
                        <button type="button" onClick={() => toggleAlert(a)} aria-expanded={open} aria-controls={open ? `alert-${a.id}` : undefined}
                          className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3 text-left hover:bg-glass rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                          <StatusBadge tone={alertTone(a.status)} dot pulse={a.status === 'firing'}>{a.status === 'insufficient-data' ? 'no data' : a.status}</StatusBadge>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-fg truncate">{a.label}</div>
                            <div className="text-xs text-fg-muted truncate">{a.metricLabel} · <span className={cn('font-semibold tabular-nums', a.status === 'firing' ? 'text-semantic-error' : 'text-fg-muted')}>{fmtAlertValue(a)}</span> · threshold {fmtThreshold(a)}</div>
                          </div>
                          <div className="hidden md:flex items-center gap-1.5">
                            <StatusBadge tone={OWNER_TONE[a.owner]}>→ {a.owner}</StatusBadge>
                            <StatusBadge tone={a.source === 'auth service' ? 'info' : 'neutral'}>{a.source}</StatusBadge>
                          </div>
                          <div className={cn('hidden sm:block', a.status === 'firing' ? 'text-semantic-error' : 'text-teal')}><Sparkline values={a.series} width={96} height={24} filled={false} /></div>
                          <ChevronDown className={cn('w-4 h-4 text-fg-muted transition-transform', open && 'rotate-180')} />
                        </button>
                        {open && (
                          <motion.div id={`alert-${a.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-4 pb-4 pt-1 space-y-2 text-sm overflow-hidden">
                            <p className="text-fg">{a.summary}</p>
                            <p className="text-fg-muted"><span className="font-semibold text-fg-muted">Hypothesis · </span>{a.hypothesis}</p>
                            {a.source === 'auth service' && <p className="text-xs text-fg-muted">External feed from the shared auth service, where the trial-activation gate runs — modelled here until the service reports live.</p>}
                            <div className="flex md:hidden items-center gap-1.5 pt-1">
                              <StatusBadge tone={OWNER_TONE[a.owner]}>→ {a.owner}</StatusBadge>
                              <StatusBadge tone={a.source === 'auth service' ? 'info' : 'neutral'}>{a.source}</StatusBadge>
                            </div>
                          </motion.div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </GlassCard>
            </motion.div>

            {/* 10 · Insights */}
            <motion.div {...SECTION} transition={{ delay: 0.45 }}>
              <GlassCard className="border-teal/20 bg-teal/5">
                <SectionTitle icon={<Sparkles />} title="Growth insights" note="What the numbers above say, and what to do about them — recomputed on every change." />
                <ul className="space-y-3">
                  {s.insights.map((line, i) => (
                    <li key={i} className="text-sm text-fg leading-relaxed flex gap-2"><Sparkles className="w-4 h-4 text-teal shrink-0 mt-0.5" />{line}</li>
                  ))}
                </ul>
              </GlassCard>
            </motion.div>
          </>
        )}

        {/* 10.5 · Nudge engagement (Section F lifecycle nudges) */}
        <motion.div {...SECTION} transition={{ delay: 0.48 }}>
          <GlassCard>
            <SectionTitle icon={<Sparkles />} title="Nudge engagement" note="How the lifecycle nudges land — shown, acted on, dismissed. Full journey view on the Customer Journey cockpit."
              badge={<Link href="/console/journey" className="text-[12px] font-bold text-teal hover:underline inline-flex items-center gap-1 whitespace-nowrap">Customer Journey <ArrowRight className="w-3.5 h-3.5" /></Link>} />
            {nudgeStatsData.shown === 0 ? (
              <p className="text-sm text-fg-muted">No nudges shown yet — they surface as the account moves through the C0 → C7 journey.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Shown', value: nudgeStatsData.shown },
                    { label: 'Converted', value: nudgeStatsData.converted },
                    { label: 'Dismissed', value: nudgeStatsData.dismissed },
                    { label: 'Conversion', value: `${nudgeStatsData.conversionPct}%` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-glass px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{s.label}</div>
                      <div className="text-xl font-black text-fg tabular-nums mt-0.5">{s.value}</div>
                    </div>
                  ))}
                </div>
                <ul className="space-y-1.5">
                  {topNudges.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 text-[12px]">
                      <StatusBadge tone={r.status === 'converted' ? 'success' : r.status === 'dismissed' ? 'neutral' : r.status === 'snoozed' ? 'warning' : 'teal'}>{r.status}</StatusBadge>
                      <span className="text-fg min-w-0 truncate flex-1">{nudgeById(r.id)?.title ?? r.id}</span>
                      <span className="text-fg-muted whitespace-nowrap tabular-nums">seen {r.seenCount}×</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GlassCard>
        </motion.div>

        {/* 11 · Event stream */}
        <motion.div {...SECTION} transition={{ delay: 0.5 }} className="space-y-3">
          <SectionTitle icon={<Radio />} title="Event stream" note="The raw in-product telemetry every KPI above is reconstructed from." badge={hasEvents ? <StatusBadge tone="neutral">{telemetryEvents.length} events</StatusBadge> : undefined} />
          {hasEvents ? (
            <DataTable columns={eventColumns} rows={recent} rowKey={e => e.id} pageSize={10} initialSort={{ key: 'timestamp', dir: 'desc' }} loading={!ready} />
          ) : (
            <EmptyState
              icon={<TrendingUp />}
              title="No growth events yet"
              description="Events flow in as this workspace is used — sign up, create a key, run a call in the Explorer, invite a teammate."
              action={<Button size="sm" onClick={goExplorer} icon={<Play />}>Run a call in the Explorer</Button>}
            />
          )}
        </motion.div>

        {/* Cross-links */}
        <nav aria-label="Related pages" className="flex flex-wrap items-center gap-2 text-xs text-fg-muted pt-2">
          <span className="font-black uppercase tracking-widest text-fg-muted mr-1">Go deeper</span>
          {[
            ['/console/analytics', 'Analytics'], ['/console/logs', 'Logs'], ['/console/billing', 'Billing'], ['/console/settings/team', 'Team'], ['/console/explorer', 'Explorer'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full border border-border bg-glass px-3 py-1 hover:border-teal/40 hover:text-teal transition-colors">{label} →</Link>
          ))}
        </nav>
      </div>
    </RoleGuard>
  );
}
