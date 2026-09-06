'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Merge, Layers, Activity, RefreshCw, Play, AlertTriangle, ArrowRight, Zap, Coins, Sparkles, Waves,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge,
} from '@/components/ui';

interface WaveRecord {
  path: string;
  waveSize: number;
  upstreamCalls: number;
  coalesced: number;
  creditsSaved: number;
  at: number;
}
interface CoalescingStats {
  coalescedRequests: number;
  upstreamCallsSaved: number;
  creditsSaved: number;
  wavesTotal: number;
  largestWave: number;
  avgWaveSize: number;
  inFlightNow: number;
  recent: WaveRecord[];
}
interface DrillResult {
  path: string;
  concurrency: number;
  waveSize: number;
  upstreamCalls: number;
  coalesced: number;
  creditsSaved: number;
  latencyMs: number;
}

const DRILL_PATHS = ['/v1/companies/enrich', '/v1/people/search', '/v1/ip/to-company'];
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

function CoalescingInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);
  const toast = useToast();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<CoalescingStats | null>(null);
  const [drillPath, setDrillPath] = useState(DRILL_PATHS[0]);
  const [concurrency, setConcurrency] = useState(12);
  const [running, setRunning] = useState(false);
  const [lastDrill, setLastDrill] = useState<DrillResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/coalescing', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to load coalescing stats');
      setData(body.data as CoalescingStats);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [apiKey]);

  useEffect(() => { track('coalescing_viewed', { environment }); refresh(); }, [refresh, environment]);

  const runDrill = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/v1/coalescing', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: drillPath, concurrency }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Drill failed');
      const result = body.data as DrillResult & { stats: CoalescingStats };
      setLastDrill(result);
      setData(result.stats);
      track('coalescing_drill_run', { path: drillPath, concurrency: result.concurrency, coalesced: result.coalesced, environment });
      toast.success('Wave collapsed', `${result.concurrency} concurrent requests → ${result.upstreamCalls} upstream call (${result.coalesced} coalesced).`);
    } catch (e) {
      toast.error('Drill failed', e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setRunning(false);
    }
  };

  if (phase === 'loading') return <CoalescingSkeleton />;

  if (phase === 'error') {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader icon={<Merge />} title="Request Coalescing" description="Collapse identical in-flight lookups into a single upstream call." />
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load coalescing stats"
            description="The gateway didn’t respond. Check you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Merge />}
        title="Request Coalescing"
        description="When identical GET requests are in flight at the same moment — a cache stampede, a fan-out from many workers, a retry storm — only the first does the work. The rest coalesce onto it and share the one result: not re-computed, not re-billed. It's the concurrency-time complement to the edge cache."
        actions={<Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Upstream calls saved" value={d.upstreamCallsSaved} icon={<Layers />} hint="deduped in-flight" />
        <KpiTile label="Credits saved" value={d.creditsSaved} icon={<Coins />} />
        <KpiTile label="Largest wave" value={d.largestWave} icon={<Waves />} hint={`avg ${d.avgWaveSize}`} />
        <KpiTile label="In flight now" value={d.inFlightNow} icon={<Activity />} />
      </div>

      {/* Drill */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Zap className="w-4 h-4 text-teal" /> Run a coalescing drill</h3>
            <p className="text-[12px] text-fg-muted mt-1 leading-snug">Fire N truly-concurrent identical requests and watch them collapse to a single upstream call.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={drillPath} onChange={(e) => setDrillPath(e.target.value)} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1.5 focus:border-teal/50 outline-none">
              {DRILL_PATHS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1.5 focus:border-teal/50 outline-none">
              {[4, 8, 12, 24, 48].map((n) => <option key={n} value={n}>{n} concurrent</option>)}
            </select>
            <Button onClick={runDrill} disabled={running}>{running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run drill</Button>
          </div>
        </div>

        <AnimatePresence>
          {lastDrill && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
              <div className="rounded-xl border border-teal/30 bg-teal/5 p-4 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-2xl font-black tabular-nums text-fg">
                  <span>{lastDrill.concurrency}</span>
                  <ArrowRight className="w-5 h-5 text-fg-subtle" />
                  <span className="text-teal">{lastDrill.upstreamCalls}</span>
                </div>
                <div className="text-[12px] text-fg-muted">
                  <span className="font-bold text-fg">{lastDrill.coalesced} coalesced</span> · {lastDrill.creditsSaved} credits saved · {lastDrill.latencyMs}ms
                </div>
                <StatusBadge tone="success">1 upstream call</StatusBadge>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Explainer */}
      <GlassCard className="p-4 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">How coalescing works</div>
        <p className="text-[12px] text-fg-muted leading-relaxed">
          The first request for a given key (API key + method + path + params) becomes the <span className="text-fg font-semibold">leader</span> and does the real work.
          Any identical request that arrives while the leader is still in flight becomes a <span className="text-fg font-semibold">follower</span>: it attaches to the leader&apos;s in-flight result instead of hitting the upstream again. When the leader settles, every follower resolves with the same response — one upstream call, one bill. The cache dedupes <em>completed</em> work; coalescing dedupes work that is still <em>happening</em>.
        </p>
      </GlassCard>

      {/* Recent waves */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg">Recent coalesced waves</h3>
        <span className="text-[11px] text-fg-subtle">{d.wavesTotal} total</span>
      </div>
      {d.recent.length === 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <EmptyState icon={<Merge className="w-8 h-8" />} title="No waves yet" description="Run a drill above to see identical concurrent requests collapse into one upstream call." />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {d.recent.map((w, i) => (
            <motion.div key={`${w.at}-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }}
              className="rounded-xl border border-border bg-surface-2 px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[12px] text-fg min-w-0 flex-1 truncate">{w.path}</span>
              <StatusBadge tone="teal">{w.waveSize} in wave</StatusBadge>
              <StatusBadge tone="success">{w.coalesced} coalesced</StatusBadge>
              <span className="text-[11px] text-fg-subtle tabular-nums">{w.creditsSaved} credits saved</span>
              <span className="text-[11px] text-fg-subtle tabular-nums w-16 text-right">{ago(w.at)}</span>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Link href="/console/idempotency" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
          Idempotency keys <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> See it in Logs
        </Link>
      </div>
    </div>
  );
}

function CoalescingSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[40rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-28 rounded-2xl mt-6" />
      <div className="space-y-2 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
    </div>
  );
}

export default function CoalescingPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <CoalescingInner />
    </RoleGuard>
  );
}
