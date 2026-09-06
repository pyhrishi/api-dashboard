'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  RotateCw, Clock, Ban, CircleCheck, Play, Loader2, Copy, Check, ArrowRight, Info, Timer, Code,
} from 'lucide-react';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  DEFAULT_POLICY, retryTimeline, totalBackoff, parseRetryAfter, backoffDelay,
} from '@/lib/retry-after';
import {
  PageHeader, KpiTile, GlassCard, Button, StatusBadge, Skeleton,
} from '@/components/ui';

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`);

const SNIPPET = `// Honour Retry-After, else exponential backoff with jitter.
async function fetchWithRetry(url, init, max = 5) {
  for (let attempt = 0; attempt < max; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;   // done
    if (attempt === max - 1) return res;                      // out of retries
    const ra = res.headers.get('Retry-After');
    const wait = ra ? Number(ra) * 1000                       // server told us when
                    : Math.min(30_000, 500 * 2 ** attempt);   // else back off
    await new Promise(r => setTimeout(r, wait));
  }
}`;

function RetryStrategyInner() {
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [retryAfterSec, setRetryAfterSec] = useState(3);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<{ status: number; retryAfter: number | null } | null>(null);

  useEffect(() => {
    track('retry_strategy_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const withRetryAfter = useMemo(() => retryTimeline(DEFAULT_POLICY, retryAfterSec * 1000), [retryAfterSec]);
  const pureBackoff = useMemo(() => retryTimeline(DEFAULT_POLICY, null), []);

  const copySnippet = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(SNIPPET).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  // Live: drain a fresh key to a real 429 and read its Retry-After.
  const trigger429 = async () => {
    if (running) return;
    setRunning(true);
    setLive(null);
    const key = `sk_test_retry_${Math.random().toString(36).slice(2, 10)}`;
    try {
      const results = await Promise.all(Array.from({ length: 130 }, () =>
        fetch('/api/v1/_ping', { headers: { Authorization: `Bearer ${key}` } })
          .then((res) => ({ status: res.status, retryAfter: parseRetryAfter(res.headers.get('retry-after')) }))
          .catch(() => ({ status: 0, retryAfter: null })),
      ));
      const throttled = results.find((r) => r.status === 429);
      setLive(throttled ?? { status: results[0]?.status ?? 0, retryAfter: null });
      track('retry_429_triggered', { got429: !!throttled });
    } catch {
      setLive({ status: 0, retryAfter: null });
    } finally {
      setRunning(false);
    }
  };

  if (phase === 'loading') return <RetrySkeleton />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Retry Strategy"
        description="A 429 isn't a failure — it's a schedule. The gateway tells you exactly when to come back with a Retry-After header; a well-behaved client honours it, and falls back to exponential backoff with jitter when it's absent. Here's how, with a live 429 to try it against."
        icon={<RotateCw />}
        actions={<Link href="/console/rate-limits"><Button variant="secondary"><Timer className="w-4 h-4" /> Rate limits</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Max attempts" value={String(DEFAULT_POLICY.maxAttempts)} icon={<RotateCw />} hint="1 try + 4 retries" />
        <KpiTile label="Base backoff" value={fmtMs(DEFAULT_POLICY.baseDelayMs)} icon={<Clock />} hint={`×${DEFAULT_POLICY.multiplier} each retry`} />
        <KpiTile label="Backoff cap" value={fmtMs(DEFAULT_POLICY.maxDelayMs)} icon={<Timer />} hint="Max single wait" />
        <KpiTile label="Retryable" value="429 · 5xx" icon={<Ban />} hint="Not 4xx" />
      </div>

      {/* Timeline visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 items-start">
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Honouring Retry-After</div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-fg">Server says: retry after</span>
            <span className="text-xs font-mono tabular-nums text-fg-muted">{retryAfterSec}s</span>
          </div>
          <input type="range" min={1} max={30} step={1} value={retryAfterSec} onChange={(e) => setRetryAfterSec(Number(e.target.value))} className="w-full accent-teal" aria-label="Server Retry-After seconds" />
          <RetryLadder steps={withRetryAfter} />
          <p className="text-[11px] text-fg-subtle mt-2">The first retry honours <span className="font-mono">Retry-After</span> exactly; later retries back off. Total worst case: <span className="font-mono text-fg">{fmtMs(totalBackoff(withRetryAfter))}</span>.</p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">No Retry-After — exponential backoff</div>
          <RetryLadder steps={pureBackoff} />
          <p className="text-[11px] text-fg-subtle mt-3">When the server doesn&apos;t say when, back off: {pureBackoff.map((s) => fmtMs(backoffDelay(s.attempt - 2))).join(' → ')}. Jitter (seeded here) spreads a thundering herd.</p>
        </GlassCard>
      </div>

      {/* Live 429 */}
      <GlassCard className="p-5 mt-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Try it — trigger a real 429</span>
          <Button variant="primary" size="sm" onClick={trigger429} disabled={running}>{running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Trigger 429</Button>
        </div>
        {running ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : live ? (
          live.status === 429 ? (
            <div className="flex items-start gap-3">
              <StatusBadge tone="warning"><Ban className="w-3 h-3" /> 429</StatusBadge>
              <div className="text-[13px] text-fg-muted">
                The gateway rate-limited the burst and returned <span className="font-mono text-fg">429</span>
                {live.retryAfter != null ? <> with <span className="font-mono text-fg">Retry-After: {Math.round(live.retryAfter / 1000)}s</span> — a graceful client waits that long, then retries and succeeds.</> : <> — honour the Retry-After header if present, else back off.</>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-fg-muted"><CircleCheck className="w-4 h-4 text-semantic-success" /> The burst stayed under the limit (status {live.status}). Nothing to retry — try again to drain the bucket.</div>
          )
        ) : (
          <div className="text-[13px] text-fg-muted py-4 text-center">Fire a burst to hit a real 429 and read its Retry-After.</div>
        )}
      </GlassCard>

      {/* Snippet */}
      <GlassCard className="p-0 overflow-hidden mt-4">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/50">
          <span className="text-[11px] font-mono text-fg-subtle inline-flex items-center gap-1.5"><Code className="w-3.5 h-3.5" /> fetchWithRetry.ts</span>
          <button onClick={copySnippet} aria-label={copied ? 'Snippet copied' : 'Copy snippet'} className="text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded px-1">
            {copied ? <><Check className="w-3 h-3 text-semantic-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
        <pre className="text-[12px] font-mono text-fg-muted p-4 overflow-x-auto leading-relaxed">{SNIPPET}</pre>
      </GlassCard>

      <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-muted"><Info className="w-3.5 h-3.5 text-teal" /> Idempotent writes can be retried safely — pair this with an idempotency key. See <Link href="/console/idempotency" className="text-teal hover:underline">Idempotency</Link>.</div>

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/rate-limits" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Rate Limits <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/rate-limit-headers" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Rate-Limit Headers <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function RetryLadder({ steps }: { steps: { attempt: number; delayMs: number; cumulativeMs: number; honoredRetryAfter: boolean }[] }) {
  const max = Math.max(...steps.map((s) => s.delayMs), 1);
  return (
    <div className="mt-3 space-y-2">
      {steps.map((s) => (
        <div key={s.attempt} className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-fg-subtle w-14 shrink-0">retry {s.attempt - 1}</span>
          <div className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden relative">
            <motion.div className={`h-full rounded-md ${s.honoredRetryAfter ? 'bg-teal' : 'bg-teal/50'}`} initial={{ width: 0 }} animate={{ width: `${(s.delayMs / max) * 100}%` }} transition={{ duration: 0.4 }} />
            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-mono tabular-nums text-fg">{s.delayMs >= 1000 ? `${(s.delayMs / 1000).toFixed(s.delayMs % 1000 === 0 ? 0 : 1)}s` : `${s.delayMs}ms`}{s.honoredRetryAfter && ' · Retry-After'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RetrySkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
    </div>
  );
}

export default function RetryStrategyPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <RetryStrategyInner />
    </RoleGuard>
  );
}
