'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LineChart, Key, Activity, Clock, AlertTriangle, ArrowRight, ShieldAlert,
  CircleCheck, Zap, FlaskConical, RotateCcw, Trash2, Eye,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  computeKeyUsage, summarizeKeyUsage, usageInsights, freshnessLabel, relativeLastUsed,
  type KeyFreshness, type InsightSeverity, type UsageInsight,
} from '@/lib/key-usage';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Button, StatusBadge, Skeleton, SegmentedControl, Sparkline,
  type BadgeTone,
} from '@/components/ui';

const FRESH_META: Record<KeyFreshness, { tone: BadgeTone; text: string }> = {
  active: { tone: 'success', text: 'text-semantic-success' },
  idle: { tone: 'teal', text: 'text-teal' },
  dormant: { tone: 'warning', text: 'text-semantic-warning' },
  stale: { tone: 'error', text: 'text-semantic-error' },
  never: { tone: 'neutral', text: 'text-fg-muted' },
};
const SEV_TONE: Record<InsightSeverity, BadgeTone> = { high: 'error', medium: 'warning', low: 'neutral' };
const ACTION_ICON = { rotate: RotateCcw, revoke: Trash2, review: Eye } as const;

type Filter = 'all' | 'active' | 'quiet' | 'attention';
const fmt = (n: number) => n.toLocaleString();

function KeyUsageInner() {
  const { activeKeys } = useStore();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    track('key_usage_viewed', { keys: activeKeys.length });
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usage = useMemo(() => computeKeyUsage(activeKeys), [activeKeys]);
  const summary = useMemo(() => summarizeKeyUsage(activeKeys), [activeKeys]);
  const insights = useMemo(() => usageInsights(activeKeys), [activeKeys]);

  const visible = useMemo(() => usage.filter((u) => {
    if (filter === 'active') return u.freshness === 'active';
    if (filter === 'quiet') return u.freshness === 'idle' || u.freshness === 'dormant';
    if (filter === 'attention') return u.freshness === 'stale' || u.freshness === 'never';
    return true;
  }), [usage, filter]);

  const onFilter = (f: Filter) => { setFilter(f); track('key_usage_filtered', { filter: f }); };

  if (phase === 'loading') return <UsageSkeleton />;

  if (activeKeys.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title="Key Usage" description="See when and how each API key was last exercised." icon={<LineChart />} />
        <GlassCard className="p-0 mt-6">
          <EmptyState icon={<Key className="w-8 h-8" />} title="No keys to report on" description="Generate an API key and its usage will appear here." action={<Link href="/console/keys"><Button variant="primary">Create a key <ArrowRight className="w-4 h-4" /></Button></Link>} />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Key Usage"
        description="When and how much each API key is exercised — freshness, request volume, and which keys have gone quiet. Idle and never-used keys are a standing liability; here's where to rotate or revoke."
        icon={<LineChart />}
        actions={<Link href="/console/keys"><Button variant="secondary"><Key className="w-4 h-4" /> Manage keys</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Total requests" value={fmt(summary.totalRequests)} icon={<Activity />} hint="Across all keys" />
        <KpiTile label="Active keys" value={String(summary.activeKeys)} icon={<CircleCheck />} hint="Used in last 24h" />
        <KpiTile label="Idle / dormant" value={String(summary.idleOrDormant)} icon={<Clock />} hint="Quiet lately" lowerIsBetter />
        <KpiTile label="Never used" value={String(summary.neverUsed)} icon={<AlertTriangle />} hint="Live + sandbox" lowerIsBetter />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <GlassCard className="p-5 mt-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Hygiene ({insights.length})</div>
          <ul className="space-y-2.5">
            {insights.slice(0, 5).map((ins) => <InsightRow key={ins.id} insight={ins} />)}
          </ul>
        </GlassCard>
      )}

      {/* Filter + list */}
      <div className="flex items-center justify-between gap-3 mt-6 mb-4 flex-wrap">
        <SegmentedControl<Filter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'quiet', label: 'Quiet' },
            { value: 'attention', label: 'Needs attention' },
          ]}
          value={filter}
          onChange={onFilter}
          size="sm"
          layoutId="usage-filter"
        />
        <span className="text-[11px] text-fg-subtle">{visible.length} of {usage.length} keys</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<CircleCheck className="w-8 h-8" />} title="Nothing in this view" description="No keys match this filter. Switch to All to see every key." action={<Button variant="secondary" onClick={() => onFilter('all')}>Show all</Button>} />
      ) : (
        <div className="space-y-3">
          {visible.map((u, i) => {
            const meta = FRESH_META[u.freshness];
            const EnvIcon = u.key.environment === 'live' ? Zap : FlaskConical;
            return (
              <motion.div key={u.key.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <GlassCard className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-fg truncate">{u.key.name}</span>
                        <StatusBadge tone={u.key.environment === 'live' ? 'teal' : 'neutral'}><EnvIcon className="w-3 h-3" /> {u.key.environment === 'live' ? 'Live' : 'Test'}</StatusBadge>
                        <StatusBadge tone={meta.tone}>{freshnessLabel(u.freshness)}</StatusBadge>
                        {u.key.status === 'revoked' && <StatusBadge tone="error">revoked</StatusBadge>}
                      </div>
                      <div className="text-[11px] text-fg-subtle mt-1 inline-flex items-center gap-1.5"><Clock className="w-3 h-3" /> last used {relativeLastUsed(u.key)}</div>
                    </div>
                    <div className={`shrink-0 ${meta.text}`}>
                      <Sparkline values={u.timeline.length >= 2 ? u.timeline : [0, 0]} width={120} height={30} />
                    </div>
                    <div className="text-right shrink-0 w-24">
                      <div className="text-base font-bold tabular-nums text-fg">{fmt(u.totalRequests)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">requests</div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/keys" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">API Keys <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/analytics" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Usage & Analytics <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Security Hub <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: UsageInsight }) {
  const Icon = ACTION_ICON[insight.action];
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5"><StatusBadge tone={SEV_TONE[insight.severity]}>{insight.severity}</StatusBadge></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg">{insight.title}</div>
        <div className="text-[12px] text-fg-muted leading-snug">{insight.detail}</div>
      </div>
      <Link href="/console/keys" className="shrink-0">
        <Button variant="ghost" size="sm"><Icon className="w-3.5 h-3.5" /> {insight.action}</Button>
      </Link>
    </li>
  );
}

function UsageSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-40 rounded-2xl mt-6" />
      <div className="space-y-3 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
    </div>
  );
}

export default function KeyUsagePage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <KeyUsageInner />
    </RoleGuard>
  );
}
