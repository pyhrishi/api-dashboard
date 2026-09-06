'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Gauge, Droplets, Zap, Play, Loader2, Ban, ArrowRight, Info, Timer, Activity,
} from 'lucide-react';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  RATE_LIMIT, refillPerSecond, simulateBurst, summarizeBurst, fillPct, retryAfterSeconds, rateSummary,
} from '@/lib/rate-limit';
import {
  PageHeader, KpiTile, GlassCard, Button, StatusBadge, Skeleton,
} from '@/components/ui';

interface BurstOutcome { total: number; allowed: number; throttled: number; firstThrottle: number | null; sample: { remaining: number; status: number }[]; retryAfter: number | null; }

function RateLimitsInner() {
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [burstSize, setBurstSize] = useState(120);
  const [ratePerSec, setRatePerSec] = useState(1000);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<BurstOutcome | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    track('rate_limits_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const sim = useMemo(() => {
    const steps = simulateBurst(burstSize, ratePerSec);
    return { steps, summary: summarizeBurst(steps) };
  }, [burstSize, ratePerSec]);

  // Re-emit a simulate event when the inputs settle (debounced by React batching).
  useEffect(() => { track('rate_limit_simulated', { burst: burstSize, rate: ratePerSec }); }, [burstSize, ratePerSec]);

  const runLive = async () => {
    if (running) return;
    setRunning(true);
    setLiveError(null);
    // A fresh key starts with a full bucket, so the drain is clean and reproducible.
    const key = `sk_test_burst_${Math.random().toString(36).slice(2, 10)}`;
    const n = Math.min(140, Math.max(1, burstSize));
    try {
      const results = await Promise.all(Array.from({ length: n }, () =>
        fetch('/api/v1/_ping', { headers: { Authorization: `Bearer ${key}` } })
          .then((res) => ({ remaining: Number(res.headers.get('x-ratelimit-remaining') ?? -1), status: res.status, retry: Number(res.headers.get('retry-after') ?? 0) }))
          .catch(() => ({ remaining: -1, status: 0, retry: 0 })),
      ));
      // Reconstruct the drain: the bucket is monotonic, so sort by remaining desc.
      const sorted = [...results].sort((a, b) => b.remaining - a.remaining);
      const throttled = results.filter((r) => r.status === 429);
      setLive({
        total: n,
        allowed: n - throttled.length,
        throttled: throttled.length,
        firstThrottle: throttled.length ? n - throttled.length : null,
        sample: sorted.map((r) => ({ remaining: r.remaining, status: r.status })),
        retryAfter: throttled.length ? Math.max(...throttled.map((r) => r.retry || retryAfterSeconds())) : null,
      });
      track('rate_limit_burst_tested', { requests: n, throttled: throttled.length });
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : 'Burst failed');
    } finally {
      setRunning(false);
    }
  };

  if (phase === 'loading') return <RateLimitsSkeleton />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Rate Limits"
        description="Every key is rate-limited with a token bucket: burst up to the capacity instantly, then throttle to the steady refill rate. Preview a burst here, or fire a real one against the gateway and watch the bucket drain."
        icon={<Gauge />}
        actions={<Link href="/console/rate-limit-headers"><Button variant="secondary"><Timer className="w-4 h-4" /> Rate-limit headers</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Burst capacity" value={String(RATE_LIMIT.capacity)} icon={<Zap />} hint="Tokens in a full bucket" />
        <KpiTile label="Refill rate" value={`${RATE_LIMIT.refillPerMinute}/min`} icon={<Droplets />} hint={`~${refillPerSecond.toFixed(2)}/sec sustained`} />
        <KpiTile label="On exhaustion" value="429" icon={<Ban />} hint="Too Many Requests" lowerIsBetter />
        <KpiTile label="Retry-After" value={`${retryAfterSeconds()}s`} icon={<Timer />} hint="To earn 1 token" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-muted"><Info className="w-3.5 h-3.5 text-teal" /> {rateSummary()}. The limit, remaining, and reset are returned on every response — see <Link href="/console/rate-limit-headers" className="text-teal hover:underline">Rate-Limit Headers</Link>.</div>

      {/* Controls */}
      <GlassCard className="p-5 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-4">Burst</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold text-fg">Requests</span><span className="text-xs font-mono tabular-nums text-fg-muted">{burstSize}</span></div>
            <input type="range" min={10} max={200} step={5} value={burstSize} onChange={(e) => setBurstSize(Number(e.target.value))} className="w-full accent-teal" aria-label="Number of requests in the burst" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold text-fg">Rate</span><span className="text-xs font-mono tabular-nums text-fg-muted">{ratePerSec}/sec</span></div>
            <input type="range" min={1} max={1000} step={1} value={ratePerSec} onChange={(e) => setRatePerSec(Number(e.target.value))} className="w-full accent-teal" aria-label="Requests per second" />
            <div className="text-[11px] text-fg-subtle mt-1">Below ~{refillPerSecond.toFixed(2)}/sec the bucket keeps up — no throttling.</div>
          </div>
        </div>
      </GlassCard>

      {/* Simulated preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4 items-start">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Simulated preview</span>
            <StatusBadge tone={sim.summary.throttled > 0 ? 'warning' : 'success'}>{sim.summary.throttled > 0 ? `${sim.summary.throttled} throttled` : 'all allowed'}</StatusBadge>
          </div>
          <BurstStrip steps={sim.steps.map((s) => s.allowed)} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Allowed" value={sim.summary.allowed} tone="text-semantic-success" />
            <Stat label="Throttled (429)" value={sim.summary.throttled} tone="text-semantic-warning" />
            <Stat label="First 429 at" value={sim.summary.firstThrottle === null ? '—' : `#${sim.summary.firstThrottle + 1}`} tone="text-fg" />
          </div>
          <p className="text-[11px] text-fg-subtle mt-3">Deterministic model — the same math the gateway runs. No requests sent.</p>
        </GlassCard>

        {/* Live burst */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle inline-flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Live burst</span>
            <Button variant="primary" size="sm" onClick={runLive} disabled={running}>{running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Fire {Math.min(140, burstSize)}</Button>
          </div>
          {liveError ? (
            <div className="text-sm text-semantic-error inline-flex items-center gap-2"><Ban className="w-4 h-4" /> {liveError}</div>
          ) : running ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : live ? (
            <>
              <BurstStrip steps={live.sample.map((s) => s.status !== 429)} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Allowed" value={live.allowed} tone="text-semantic-success" />
                <Stat label="429" value={live.throttled} tone="text-semantic-warning" />
                <Stat label="Retry-After" value={live.retryAfter ? `${live.retryAfter}s` : '—'} tone="text-fg" />
              </div>
              <p className="text-[11px] text-fg-subtle mt-3">Real requests to the gateway with a fresh key — the burst is throttled with 429s and a Retry-After once the bucket empties (the edge may add its own DDoS protection on top).</p>
            </>
          ) : (
            <div className="text-[13px] text-fg-muted py-6 text-center">Fire a real burst to watch the gateway&apos;s bucket drain and return 429s.</div>
          )}
        </GlassCard>
      </div>

      {/* Bucket fill */}
      <GlassCard className="p-5 mt-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">The bucket right now (simulated end state)</div>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 rounded-full bg-surface-2 overflow-hidden">
            <motion.div className="h-full bg-teal rounded-full" initial={{ width: 0 }} animate={{ width: `${fillPct(sim.steps.length ? sim.steps[sim.steps.length - 1].remaining : RATE_LIMIT.capacity)}%` }} transition={{ duration: 0.4 }} />
          </div>
          <span className="text-sm font-mono tabular-nums text-fg shrink-0">{sim.steps.length ? sim.steps[sim.steps.length - 1].remaining : RATE_LIMIT.capacity} / {RATE_LIMIT.capacity}</span>
        </div>
      </GlassCard>

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/rate-limit-headers" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Rate-Limit Headers <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/analytics" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Usage & Analytics <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

/** A compact strip: one cell per request, green=allowed, amber=throttled. */
function BurstStrip({ steps }: { steps: boolean[] }) {
  const shown = steps.slice(0, 120);
  return (
    <div className="flex flex-wrap gap-0.5" role="img" aria-label={`${steps.filter(Boolean).length} allowed, ${steps.filter((s) => !s).length} throttled`}>
      {shown.map((ok, i) => (
        <span key={i} className={`w-2 h-4 rounded-sm ${ok ? 'bg-semantic-success/70' : 'bg-semantic-warning/70'}`} />
      ))}
      {steps.length > 120 && <span className="text-[10px] text-fg-subtle self-center ml-1">+{steps.length - 120}</span>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-border-subtle py-2">
      <div className={`text-base font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
    </div>
  );
}

function RateLimitsSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-32 rounded-2xl mt-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>
    </div>
  );
}

export default function RateLimitsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <RateLimitsInner />
    </RoleGuard>
  );
}
