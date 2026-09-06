'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Target, CheckCircle2, XCircle, Info, ArrowRight, Crosshair } from 'lucide-react';
import { useStore, type ApiLog } from '@/lib/store';
import { track } from '@/lib/telemetry';
import {
  aggregateMatchRate, explainMatch,
  type MatchRateBucket, type MatchExplanation,
} from '@/lib/insight-engine';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, SegmentedControl, Button,
  type BadgeTone,
} from '@/components/ui';

type Timeframe = '24h' | '7d' | '30d';
const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];
const WINDOW_MS: Record<Timeframe, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };

function rateTone(rate: number): BadgeTone {
  if (rate >= 0.85) return 'success';
  if (rate >= 0.7) return 'teal';
  if (rate >= 0.5) return 'warning';
  return 'error';
}
function verdictTone(v: MatchExplanation['verdict']): BadgeTone {
  if (v === 'matched') return 'success';
  if (v === 'missed') return 'warning';
  if (v === 'error') return 'error';
  return 'neutral';
}
const pct = (n: number) => `${Math.round(n * 100)}%`;

function CoverageInner() {
  const { environment, apiLogs, seedRequestHistory } = useStore();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');

  // Seed a deterministic history when this env has little real traffic, then settle.
  useEffect(() => {
    setPhase('loading');
    seedRequestHistory();
    track('coverage_viewed', { environment });
    const t = setTimeout(() => setPhase('ready'), 700);
    return () => clearTimeout(t);
  }, [seedRequestHistory, environment]);

  const scopedLogs = useMemo<ApiLog[]>(() => {
    const cutoff = Date.now() - WINDOW_MS[timeframe];
    return apiLogs.filter((l) => {
      if (l.environment !== environment) return false;
      const t = new Date(l.timestamp).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
  }, [apiLogs, environment, timeframe]);

  const summary = useMemo(() => aggregateMatchRate(scopedLogs), [scopedLogs]);

  // The recent-lookups explainer: newest coverage attempts with a per-request why.
  const recent = useMemo(() => {
    return scopedLogs
      .map((l) => ({ log: l, ex: explainMatch(l) }))
      .filter((r) => r.ex.endpointKind === 'lookup')
      .slice(0, 12);
  }, [scopedLogs]);

  if (phase === 'loading') return <CoverageSkeleton />;

  if (summary.attempted === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Header timeframe={timeframe} setTimeframe={setTimeframe} />
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<Target className="w-8 h-8" />}
            title="No coverage lookups yet"
            description="Run a person, company, phone, or IP lookup and its match result appears here — with an honest match rate and the reason behind every hit or miss."
            action={<Link href="/console/studio"><Button variant="primary">Open the Studio <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <Header timeframe={timeframe} setTimeframe={setTimeframe} />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile
          label="Match rate"
          value={pct(summary.matchRate)}
          icon={<Target />}
          hint={`${summary.matched} of ${summary.attempted} coverage attempts`}
        />
        <KpiTile label="Attempted lookups" value={summary.attempted.toLocaleString()} icon={<Crosshair />} hint="Matched + missed (the honest denominator)" />
        <KpiTile label="Matched" value={summary.matched.toLocaleString()} icon={<CheckCircle2 />} hint="Resolved to a record" />
        <KpiTile label="Missed" value={summary.missed.toLocaleString()} icon={<XCircle />} hint="Outside current coverage" lowerIsBetter />
      </div>

      {/* Excluded/errors transparency line */}
      <p className="text-xs text-fg-subtle mt-3">
        {summary.excluded.toLocaleString()} request{summary.excluded === 1 ? '' : 's'} excluded (transforms &amp; non-lookups) and {summary.errors.toLocaleString()} error{summary.errors === 1 ? '' : 's'} (invalid input, auth, rate limits) are kept out of the match-rate math.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <BucketCard title="Match rate by endpoint" buckets={summary.byEndpoint} />
        <BucketCard title="Match rate by identifier" buckets={summary.byIdentifier} />
      </div>

      {/* Miss reasons + recent explainer */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 mt-6">
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Why lookups missed</div>
          {summary.missReasons.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted"><CheckCircle2 className="w-4 h-4 text-semantic-success" /> No misses in this window — full coverage.</div>
          ) : (
            <ul className="space-y-3">
              {summary.missReasons.map((r, i) => (
                <motion.li key={r.key} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-fg">{r.label}</span>
                    <span className="text-xs font-mono tabular-nums text-fg-subtle">{r.count} · {pct(r.share)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-glass mt-1.5 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: pct(r.share) }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full bg-semantic-warning" />
                  </div>
                  {r.recovery && <p className="text-[11px] text-fg-muted mt-1">{r.recovery}</p>}
                </motion.li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Recent lookups — why each matched or missed</span>
            <Link href="/console/logs" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">All logs <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <ul className="divide-y divide-border-subtle">
            {recent.map(({ log, ex }, i) => (
              <motion.li key={log.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }} className="py-2.5 flex items-start gap-3">
                <StatusBadge tone={verdictTone(ex.verdict)}>{ex.verdict}</StatusBadge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg truncate">{ex.label}</span>
                    <span className="text-[11px] font-mono text-fg-subtle truncate">{String((log.request?.parameters && Object.values(log.request.parameters)[0]) ?? log.path)}</span>
                  </div>
                  <p className="text-[12px] text-fg-muted leading-snug">{ex.detail}</p>
                  {ex.recovery && (
                    <Link
                      href="/console/studio?preset=reverse"
                      onClick={() => track('match_recovery_clicked', { identifier: ex.identifier, environment })}
                      className="text-[11px] font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1 mt-0.5"
                    >
                      {ex.recovery} <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {/* Methodology / transparency note */}
      <GlassCard className="p-5 mt-6 border-teal/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Info className="w-4 h-4 text-teal" /></div>
          <div>
            <div className="text-sm font-bold text-fg">How we compute match rate</div>
            <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
              Match rate is <span className="font-semibold text-fg">matched ÷ (matched + missed)</span> over genuine coverage lookups only. Deterministic transforms (email verification, title normalization, domain auth) always return, so they never inflate the number. Invalid input, auth failures, and rate limits are errors, not coverage misses, so they are excluded from the denominator. Every request is classified from its real status and response — the same traffic always yields the same rate.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function Header({ timeframe, setTimeframe }: { timeframe: Timeframe; setTimeframe: (t: Timeframe) => void }) {
  return (
    <PageHeader
      title="Match Rate"
      description="Your honest coverage: how often lookups resolve, broken down by endpoint and identifier, with the reason behind every hit and miss."
      icon={<Target />}
      actions={
        <SegmentedControl
          options={TIMEFRAMES}
          value={timeframe}
          onChange={(t) => { setTimeframe(t); track('coverage_timeframe_changed', { timeframe: t }); }}
          layoutId="coverage-timeframe"
        />
      }
    />
  );
}

function BucketCard({ title, buckets }: { title: string; buckets: MatchRateBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.attempted));
  return (
    <GlassCard className="p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">{title}</div>
      {buckets.length === 0 ? (
        <p className="text-sm text-fg-muted">No coverage lookups in this window.</p>
      ) : (
        <ul className="space-y-3">
          {buckets.map((b, i) => (
            <motion.li key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-fg truncate">{b.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge tone={rateTone(b.matchRate)}>{pct(b.matchRate)}</StatusBadge>
                  <span className="text-[11px] font-mono tabular-nums text-fg-subtle w-16 text-right">{b.matched}/{b.attempted}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-glass overflow-hidden flex">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${(b.matchRate) * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full ${b.matchRate >= 0.85 ? 'bg-semantic-success' : b.matchRate >= 0.7 ? 'bg-teal' : b.matchRate >= 0.5 ? 'bg-semantic-warning' : 'bg-semantic-error'}`}
                />
              </div>
              {/* relative volume cue */}
              <div className="h-0.5 rounded-full bg-border-subtle mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-fg-subtle/40" style={{ width: `${(b.attempted / max) * 100}%` }} />
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function CoverageSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-96" /></div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export default function CoveragePage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <CoverageInner />
    </RoleGuard>
  );
}
