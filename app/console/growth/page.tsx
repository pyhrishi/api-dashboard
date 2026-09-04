'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Zap, Key, Play, Compass, Users, CreditCard, Rocket, Sparkles, Radio } from 'lucide-react';
import { useStore } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import { isPostHogEnabled, type TelemetryEventRecord, type TelemetryEventName } from '@/lib/telemetry';
import { cn } from '@/lib/utils';
import {
  PageHeader, KpiTile, GlassCard, DataTable, EmptyState, StatusBadge, ConfirmAction, Sparkline,
  type Column, type BadgeTone,
} from '@/components/ui';

// ─── helpers ──────────────────────────────────────────────────────────────────

const count = (events: TelemetryEventRecord[], name: TelemetryEventName) => events.filter(e => e.name === name).length;
const first = (events: TelemetryEventRecord[], name: TelemetryEventName) => events.find(e => e.name === name);

const relTime = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};

const fmtDuration = (ms: number) => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

const CATEGORY: Record<string, BadgeTone> = {
  signup_completed: 'teal', onboarding_step_completed: 'teal', api_key_created: 'teal', first_call_made: 'teal', explorer_run: 'teal', feature_viewed: 'neutral',
  quota_threshold_reached: 'warning', upgrade_prompt_shown: 'warning', upgrade_prompt_clicked: 'success', upgrade_prompt_dismissed: 'neutral', plan_upgraded: 'success', credits_recharged: 'success',
  invite_sent: 'info', invite_accepted: 'info', referral_code_applied: 'info', org_created: 'info',
  webhook_created: 'neutral', export_downloaded: 'neutral', alert_rule_created: 'neutral', feature_abandoned: 'error',
};

/** Deterministic, state-aware growth insights (no randomness — reads the real event log). */
function growthInsights(events: TelemetryEventRecord[], funnel: { label: string; reached: boolean }[], upgradeRate: number | null): string[] {
  const out: string[] = [];
  const stalled = funnel.find(s => !s.reached);
  if (stalled) out.push(`Activation is stalled at "${stalled.label}". Prototype nudge: surface it in the Omnibar and onboarding checklist.`);
  else out.push('This workspace is fully activated — signup → key → first call → exploring. Shift focus to expansion.');
  const shown = count(events, 'upgrade_prompt_shown');
  if (shown > 0 && upgradeRate !== null) {
    out.push(upgradeRate >= 20
      ? `Upgrade prompts convert at ${upgradeRate}% — strong intent; consider surfacing plan value earlier.`
      : `Upgrade prompts convert at ${upgradeRate}% (${shown} shown). Try tying the prompt to a concrete blocked action rather than a generic banner.`);
  }
  const invites = count(events, 'invite_sent');
  if (invites === 0) out.push('No teammates invited yet — the invite loop is the cheapest expansion lever; prompt after the first successful call.');
  else out.push(`${invites} invite${invites === 1 ? '' : 's'} sent; ${count(events, 'invite_accepted')} accepted.`);
  const abandoned = count(events, 'feature_abandoned');
  if (abandoned > 0) out.push(`${abandoned} abandoned flow${abandoned === 1 ? '' : 's'} recorded — inspect the event stream for where users drop.`);
  return out;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function GrowthPage() {
  const { telemetryEvents, completedOnboardingSteps, isFirstCallMade, activeKeys, user, teamMembers, clearTelemetryEvents } = useStore();

  const funnel = useMemo(() => ([
    { key: 'signup', label: 'Signed up', icon: <Zap />, reached: !!first(telemetryEvents, 'signup_completed') || completedOnboardingSteps.includes('signup') || !!user },
    { key: 'key', label: 'Created an API key', icon: <Key />, reached: !!first(telemetryEvents, 'api_key_created') || completedOnboardingSteps.includes('apiKey') || activeKeys.length > 0 },
    { key: 'call', label: 'Made a first call', icon: <Play />, reached: !!first(telemetryEvents, 'first_call_made') || isFirstCallMade },
    { key: 'explore', label: 'Explored the console', icon: <Compass />, reached: count(telemetryEvents, 'feature_viewed') + count(telemetryEvents, 'explorer_run') > 0 || completedOnboardingSteps.includes('exploreMore') },
  ]), [telemetryEvents, completedOnboardingSteps, isFirstCallMade, activeKeys.length, user]);

  const activationPct = Math.round((funnel.filter(s => s.reached).length / funnel.length) * 100);

  const timeToFirstCall = useMemo(() => {
    const s = first(telemetryEvents, 'signup_completed');
    const c = first(telemetryEvents, 'first_call_made');
    return s && c ? new Date(c.timestamp).getTime() - new Date(s.timestamp).getTime() : null;
  }, [telemetryEvents]);

  const shown = count(telemetryEvents, 'upgrade_prompt_shown');
  const clicked = count(telemetryEvents, 'upgrade_prompt_clicked');
  const upgradeRate = shown > 0 ? Math.round((clicked / shown) * 100) : null;

  const adoption = useMemo(() => {
    const m = new Map<string, number>();
    telemetryEvents.forEach(e => {
      if (e.name === 'feature_viewed' && typeof e.props.feature === 'string') m.set(e.props.feature, (m.get(e.props.feature) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [telemetryEvents]);
  const adoptionMax = adoption[0]?.[1] ?? 1;

  const perDay = useMemo(() => {
    const days = 14;
    const buckets = Array.from({ length: days }, () => 0);
    const now = Date.now();
    telemetryEvents.forEach(e => {
      const d = Math.floor((now - new Date(e.timestamp).getTime()) / 86_400_000);
      if (d >= 0 && d < days) buckets[days - 1 - d]++;
    });
    return buckets;
  }, [telemetryEvents]);

  const insights = useMemo(() => growthInsights(telemetryEvents, funnel, upgradeRate), [telemetryEvents, funnel, upgradeRate]);

  const recent = useMemo(() => [...telemetryEvents].reverse(), [telemetryEvents]);
  const columns: Column<TelemetryEventRecord>[] = [
    { key: 'name', header: 'Event', render: e => <StatusBadge tone={CATEGORY[e.name] ?? 'neutral'}>{e.name.replace(/_/g, ' ')}</StatusBadge>, sortValue: e => e.name },
    { key: 'props', header: 'Properties', render: e => <span className="font-mono text-xs text-fg-muted truncate block max-w-[22rem]">{Object.keys(e.props).length ? JSON.stringify(e.props) : '—'}</span> },
    { key: 'environment', header: 'Env', render: e => <span className="text-xs uppercase text-fg-subtle">{e.environment}</span>, sortValue: e => e.environment },
    { key: 'timestamp', header: 'When', align: 'right', render: e => <span className="text-xs text-fg-muted whitespace-nowrap">{relTime(e.timestamp)}</span>, sortValue: e => e.timestamp },
  ];

  const hasEvents = telemetryEvents.length > 0;

  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <div className="space-y-8 animate-fade-in pb-12">
        <PageHeader
          icon={<TrendingUp />}
          title="Growth"
          description="Product-led growth measurement — activation funnel, time-to-value, feature adoption, upgrade conversion, and expansion loops, computed from the in-product event log."
          actions={
            <>
              <StatusBadge tone={isPostHogEnabled ? 'success' : 'neutral'} dot pulse={isPostHogEnabled}>
                <Radio className="w-3 h-3" /> {isPostHogEnabled ? 'Forwarding to PostHog' : 'In-product only'}
              </StatusBadge>
              {hasEvents && (
                <ConfirmAction size="sm" variant="ghost" onConfirm={clearTelemetryEvents} confirmLabel="Confirm clear">
                  Clear events
                </ConfirmAction>
              )}
            </>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile label="Activation" value={`${activationPct}%`} icon={<Zap />} hint={`${funnel.filter(s => s.reached).length} of ${funnel.length} milestones`} />
          <KpiTile label="Time to first call" value={timeToFirstCall !== null ? fmtDuration(timeToFirstCall) : '—'} icon={<Play />} hint={timeToFirstCall === null ? 'Needs signup + first-call events' : 'signup → first successful call'} />
          <KpiTile label="Upgrade conversion" value={upgradeRate !== null ? `${upgradeRate}%` : '—'} icon={<CreditCard />} hint={shown ? `${clicked} of ${shown} prompts clicked` : 'No upgrade prompts shown yet'} />
          <KpiTile label="Team size" value={teamMembers.length} icon={<Users />} hint={`${count(telemetryEvents, 'invite_sent')} invites sent`} />
        </div>

        {/* Funnel + insights */}
        <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-6 items-start">
          <GlassCard>
            <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-5">Activation funnel</h3>
            <ol className="space-y-3">
              {funnel.map((step, i) => (
                <motion.li key={step.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className={cn('flex items-center gap-4 rounded-xl border px-4 py-3', step.reached ? 'border-teal/30 bg-teal/5' : 'border-border bg-glass')}>
                  <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4', step.reached ? 'bg-teal text-ink' : 'bg-overlay text-fg-subtle')}>{step.icon}</span>
                  <span className={cn('flex-1 text-sm font-semibold', step.reached ? 'text-fg' : 'text-fg-muted')}>{step.label}</span>
                  <StatusBadge tone={step.reached ? 'success' : 'neutral'}>{step.reached ? 'Reached' : 'Pending'}</StatusBadge>
                </motion.li>
              ))}
            </ol>
          </GlassCard>

          <GlassCard className="border-indigo-500/30 bg-indigo-500/5">
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Growth insights</h3>
            <ul className="space-y-3">
              {insights.map((line, i) => (
                <li key={i} className="text-sm text-indigo-100/80 leading-relaxed flex gap-2"><Rocket className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />{line}</li>
              ))}
            </ul>
          </GlassCard>
        </div>

        {/* Adoption + volume */}
        <div className="grid lg:grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-4">Feature adoption</h3>
            {adoption.length === 0 ? (
              <p className="text-sm text-fg-subtle">No <code className="font-mono text-xs">feature_viewed</code> events yet — features emit one on view.</p>
            ) : (
              <ul className="space-y-3">
                {adoption.map(([feature, n]) => (
                  <li key={feature}>
                    <div className="flex items-center justify-between text-sm mb-1"><span className="text-fg font-medium">{feature}</span><span className="text-fg-muted tabular-nums">{n}</span></div>
                    <div className="h-1.5 rounded-full bg-overlay overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(n / adoptionMax) * 100}%` }} className="h-full rounded-full bg-gradient-to-r from-teal to-teal-ice" /></div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted">Event volume · 14 days</h3>
              <span className="text-2xl font-extrabold text-fg tabular-nums">{telemetryEvents.length}</span>
            </div>
            <div className="text-teal"><Sparkline values={perDay} width={420} height={72} className="w-full h-[72px]" /></div>
          </GlassCard>
        </div>

        {/* Stream */}
        {hasEvents ? (
          <DataTable columns={columns} rows={recent} rowKey={e => e.id} pageSize={10} initialSort={{ key: 'timestamp', dir: 'desc' }} />
        ) : (
          <EmptyState
            icon={<TrendingUp />}
            title="No growth events yet"
            description="Events start flowing as this workspace is used — sign up, create a key, run a call in the Explorer, invite a teammate. Every feature emits typed events via lib/telemetry.ts."
          />
        )}
      </div>
    </RoleGuard>
  );
}
