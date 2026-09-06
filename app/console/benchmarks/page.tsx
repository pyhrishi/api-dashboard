'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Target, ShieldCheck, TrendingUp, Database, Layers, Award, Play, RefreshCw,
  Info, History, CircleCheck, FlaskConical,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  getBenchmarkReport, pct,
  type CategoryBenchmark, type BenchmarkEngine, type BenchmarkGrade, type DataCategory,
} from '@/lib/accuracy-benchmark';
import {
  PageHeader, KpiTile, GlassCard, Skeleton, StatusBadge, Button, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';

const ENGINE_META: Record<BenchmarkEngine, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  ids: { label: 'Registry (IDS)', tone: 'teal', icon: ShieldCheck },
  hybrid: { label: 'Hybrid', tone: 'neutral', icon: Layers },
  lookup: { label: 'Lookup', tone: 'neutral', icon: Database },
};
const GRADE_TONE: Record<BenchmarkGrade, BadgeTone> = { excellent: 'success', strong: 'teal', fair: 'warning' };

const VENDOR_ACCENT = 'bg-fg-subtle';
const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

type View = 'category' | 'competitors';

function BenchmarksInner() {
  const { accuracyBenchmarkRuns, runAccuracyBenchmark, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [view, setView] = useState<View>('category');
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<DataCategory>('registry_id');
  const canMutate = user?.role !== 'billing';

  useEffect(() => {
    setPhase('loading');
    track('accuracy_benchmark_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  // The published report reflects the latest re-sample cycle.
  const cycle = accuracyBenchmarkRuns.length;
  const report = useMemo(() => getBenchmarkReport(cycle), [cycle]);
  const selectedCmp = report.comparisons.find((c) => c.category === selected) ?? report.comparisons[0];

  const onRun = () => {
    if (running || !canMutate) return;
    setRunning(true);
    try {
      const run = runAccuracyBenchmark();
      track('accuracy_benchmark_run', { precision: run.precision, samples: run.totalSamples });
      toast.success('Benchmark re-sampled', `${run.totalSamples.toLocaleString()} samples · ${pct(run.precision)} precision`);
    } catch (e) {
      toast.error('Could not re-sample', e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setTimeout(() => setRunning(false), 500);
    }
  };

  if (phase === 'loading') return <BenchmarkSkeleton />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Accuracy Benchmarks"
        description="Sampled precision and recall for every data category, measured against ground truth — with sample sizes, 95% confidence intervals, and how we compare to the incumbents. The proof behind the accuracy number, not a vanity figure."
        icon={<Target />}
        actions={canMutate ? (
          <Button variant="primary" onClick={onRun} disabled={running}>
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Re-sample
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Overall precision" value={pct(report.overall.precision)} icon={<Target />} hint={`Grade: ${report.overall.grade}`} />
        <KpiTile label="Overall recall" value={pct(report.overall.recall)} icon={<TrendingUp />} hint="Coverage of true values" />
        <KpiTile label="F1 score" value={pct(report.overall.f1)} icon={<Award />} hint="Precision · recall balance" />
        <KpiTile label="Samples scored" value={report.overall.totalSamples.toLocaleString()} icon={<FlaskConical />} hint={report.period} />
      </div>

      <div className="flex items-center justify-between gap-3 mt-6 mb-4 flex-wrap">
        <SegmentedControl<View>
          options={[
            { value: 'category', label: 'By category' },
            { value: 'competitors', label: 'vs. competitors' },
          ]}
          value={view}
          onChange={setView}
          layoutId="benchmark-view"
        />
        <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Re-sample #{cycle} · {report.period}
        </span>
      </div>

      {view === 'category' ? (
        <div className="space-y-3">
          {report.categories.map((c, i) => (
            <CategoryRow key={c.category} bench={c} index={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
          <GlassCard className="p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle px-2 py-1.5">Category</div>
            <div className="space-y-0.5">
              {report.categories.map((c) => {
                const active = c.category === selected;
                return (
                  <button
                    key={c.category}
                    onClick={() => setSelected(c.category)}
                    aria-pressed={active}
                    className={`w-full text-left text-[13px] px-2.5 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${active ? 'bg-teal/10 text-teal font-semibold' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <CompetitorPanel cmp={selectedCmp} />
        </div>
      )}

      {/* Methodology */}
      <GlassCard className="p-5 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Methodology</div>
        <p className="text-[13px] text-fg-muted leading-relaxed">{report.methodology}</p>
        <p className="text-[11px] text-fg-subtle mt-2">Competitor figures are third-party sampled estimates for reference, not vendor-published numbers. See <Link href="/console/quality-sla" className="text-teal hover:underline">Quality SLA</Link> for live target compliance.</p>
      </GlassCard>

      {accuracyBenchmarkRuns.length > 0 && (
        <GlassCard className="p-5 mt-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Re-sample history</div>
          <ul className="divide-y divide-border-subtle">
            {accuracyBenchmarkRuns.map((run) => (
              <li key={run.id} className="py-2 flex items-center justify-between text-[12px]">
                <span className="text-fg-muted">#{run.cycle} · {timeAgo(run.timestamp)} · {run.totalSamples.toLocaleString()} samples</span>
                <span className="font-mono text-fg-subtle tabular-nums">{pct(run.precision)} P · {pct(run.recall)} R</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}

function CategoryRow({ bench, index }: { bench: CategoryBenchmark; index: number }) {
  const engine = ENGINE_META[bench.engine];
  const EngineIcon = engine.icon;
  const p = Math.round(bench.precision * 100);
  const [ciLo, ciHi] = bench.ci;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <GlassCard className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-fg">{bench.label}</span>
              <StatusBadge tone={engine.tone}><EngineIcon className="w-3 h-3" /> {engine.label}</StatusBadge>
              <StatusBadge tone={GRADE_TONE[bench.grade]}>{bench.grade}</StatusBadge>
            </div>
            {/* Precision bar with CI band */}
            <div className="mt-2.5 relative h-2 rounded-full bg-surface-2 overflow-hidden">
              {/* CI band */}
              <div className="absolute inset-y-0 bg-teal/20" style={{ left: `${ciLo * 100}%`, width: `${Math.max(0, (ciHi - ciLo) * 100)}%` }} aria-hidden />
              {/* Point estimate fill */}
              <motion.div className="absolute inset-y-0 left-0 bg-teal rounded-full" initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
            <div className="mt-1.5 text-[11px] text-fg-subtle tabular-nums">
              95% CI {pct(ciLo)}–{pct(ciHi)} · {bench.sampleSize.toLocaleString()} samples · benchmarked {bench.lastBenchmarked}
            </div>
          </div>
          <div className="flex items-center gap-5 md:gap-6 shrink-0">
            <Metric label="Precision" value={pct(bench.precision)} accent />
            <Metric label="Recall" value={pct(bench.recall)} />
            <Metric label="F1" value={pct(bench.f1)} />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className={`text-base font-bold tabular-nums leading-none ${accent ? 'text-teal' : 'text-fg'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle mt-1">{label}</div>
    </div>
  );
}

function CompetitorPanel({ cmp }: { cmp: import('@/lib/accuracy-benchmark').CategoryComparison }) {
  // Rows: Zinbit (highlighted) + each vendor, sorted by precision desc.
  const rows = [
    { vendor: 'Zinbit', precision: cmp.zinbitPrecision, isUs: true },
    ...cmp.competitors.map((c) => ({ vendor: c.vendor, precision: c.precision, isUs: false })),
  ].sort((a, b) => b.precision - a.precision);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-fg">{cmp.label} · precision</div>
          <div className="text-[11px] text-fg-subtle">Zinbit vs. incumbents on the same sampled task</div>
        </div>
        {cmp.lead > 0 ? (
          <StatusBadge tone="success"><Award className="w-3 h-3" /> Leads by {(cmp.lead * 100).toFixed(1)} pts</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Competitive</StatusBadge>
        )}
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const w = r.precision * 100; // absolute — honest bar widths on a proof surface
          return (
            <div key={r.vendor} className="flex items-center gap-3">
              <span className={`w-32 shrink-0 text-[12px] truncate ${r.isUs ? 'font-bold text-fg' : 'text-fg-muted'}`}>{r.vendor}</span>
              <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-md ${r.isUs ? 'bg-teal' : VENDOR_ACCENT}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
                <span className={`absolute inset-y-0 right-2 flex items-center text-[11px] font-mono tabular-nums ${r.isUs ? 'text-fg' : 'text-fg-muted'}`}>{pct(r.precision)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border-subtle text-[11px] text-fg-subtle flex items-center gap-1.5">
        <CircleCheck className="w-3.5 h-3.5 text-teal shrink-0" />
        {cmp.category === 'registry_id'
          ? 'Registry-verified identity is our moat — no incumbent offers deterministic CIN/DIN/GST-anchored identity.'
          : 'Registry-anchored data lifts precision where incumbents rely on scraped sources alone.'}
      </div>
    </GlassCard>
  );
}

function BenchmarkSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="flex items-center justify-between mt-6 mb-4">
        <Skeleton className="h-9 w-52 rounded-lg" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function BenchmarksPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <BenchmarksInner />
    </RoleGuard>
  );
}
