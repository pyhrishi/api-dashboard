'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Repeat2, KeyRound, Coins, Clock, Copy, Check, RefreshCw, ArrowRight, Compass, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue, API_BASE_URL } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, DataTable, type Column,
} from '@/components/ui';

interface IdempotencyKeyView {
  key: string;
  path: string;
  replayCount: number;
  creditCost: number;
  creditsSaved: number;
  storedAt: number;
  expiresAt: number;
  ttlRemainingMs: number;
}
interface IdempotencyStats {
  activeKeys: number;
  replaysServed: number;
  creditsSaved: number;
  ttlHours: number;
  recent: IdempotencyKeyView[];
}

const relTime = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
};
const ttlLabel = (ms: number) => {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
};

function IdempotencyInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stats, setStats] = useState<IdempotencyStats | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/idempotency', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to load idempotency registry');
      setStats(body.data as IdempotencyStats);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [apiKey]);

  useEffect(() => {
    track('idempotency_viewed', { environment });
    refresh();
  }, [refresh, environment]);

  // Live TTL: re-render every 20s so countdowns stay honest.
  useEffect(() => {
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const curl = `curl -X POST "${API_BASE_URL}/v1/batch/companies/enrich" \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"domains":["stripe.com","datadoghq.com"]}'
# Retry with the same key → the same response, and no second charge.`;

  const copy = () => {
    navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const columns: Column<IdempotencyKeyView>[] = [
    {
      key: 'key', header: 'Idempotency key',
      render: (r) => <span className="font-mono text-xs text-fg">{r.key}</span>,
    },
    {
      key: 'path', header: 'Endpoint',
      render: (r) => <span className="font-mono text-xs text-fg-muted">{r.path}</span>,
    },
    {
      key: 'replayCount', header: 'Replays', align: 'right',
      render: (r) => r.replayCount > 0
        ? <StatusBadge tone="teal">{r.replayCount}×</StatusBadge>
        : <span className="text-fg-subtle text-xs">—</span>,
      sortValue: (r) => r.replayCount,
    },
    {
      key: 'creditsSaved', header: 'Credits saved', align: 'right',
      render: (r) => <span className="tabular-nums text-fg">{r.creditsSaved}</span>,
      sortValue: (r) => r.creditsSaved,
    },
    {
      key: 'storedAt', header: 'Stored', align: 'right',
      render: (r) => <span className="text-xs text-fg-muted">{relTime(r.storedAt)}</span>,
      sortValue: (r) => r.storedAt,
    },
    {
      key: 'ttl', header: 'TTL left', align: 'right',
      render: (r) => (
        <span className="text-xs font-semibold text-fg-muted inline-flex items-center gap-1 justify-end">
          <Clock className="w-3 h-3 text-fg-subtle" /> {ttlLabel(r.ttlRemainingMs)}
        </span>
      ),
      sortValue: (r) => r.ttlRemainingMs,
    },
  ];

  if (phase === 'loading') return <IdempotencySkeleton />;

  if (phase === 'error') {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader icon={<Repeat2 />} title="Idempotency" description="Safe retries for writes — replay the same response, never double-charge or duplicate." />
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8" />}
            title="Couldn’t load the idempotency registry"
            description="The gateway didn’t respond. Check that you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>}
          />
        </GlassCard>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<Repeat2 />}
        title="Idempotency"
        description="Send an Idempotency-Key on a pipeline write (like batch enrichment) and retries are safe: the same key replays the exact original response — never re-processed, never re-charged. Keys live for 24 hours."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /> Refresh</Button>
            <Link href="/console/explorer"><Button variant="secondary" size="sm"><Compass className="w-4 h-4" /> Try in Explorer</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Active keys" value={s.activeKeys} icon={<KeyRound />} hint="within the 24h window" />
        <KpiTile label="Replays served" value={s.replaysServed} icon={<Repeat2 />} hint="retries safely deduplicated" />
        <KpiTile label="Credits saved" value={s.creditsSaved} icon={<Coins />} hint="by not re-charging replays" />
        <KpiTile label="Key retention" value={`${s.ttlHours}h`} icon={<Clock />} hint="TTL per key" />
      </div>

      {/* How it works */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-teal" />
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">How idempotency works</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { n: '1', t: 'Send a key', d: 'Add an Idempotency-Key header (a UUID) to a pipeline write like batch enrichment. The request runs once and its response is stored for 24h.' },
            { n: '2', t: 'Retry safely', d: 'A retry with the same key replays the exact stored response — not re-processed, and no credits charged (X-Idempotency-Replayed: true).' },
            { n: '3', t: 'Reuse is caught', d: 'Reusing a key with a different body returns 409 IDEMPOTENCY_KEY_REUSED, so a stale replay can never mask a real change.' },
          ].map((step) => (
            <div key={step.n} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="w-6 h-6 rounded-full bg-teal/10 border border-teal/30 text-teal text-xs font-black flex items-center justify-center mb-2">{step.n}</div>
              <div className="text-sm font-bold text-fg">{step.t}</div>
              <p className="text-[12px] text-fg-muted mt-1 leading-snug">{step.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3 relative">
          <button onClick={copy} className="absolute top-2.5 right-2.5 text-fg-subtle hover:text-teal transition-colors p-1 rounded-md hover:bg-glass" aria-label="Copy cURL">
            {copied ? <Check className="w-4 h-4 text-semantic-success" /> : <Copy className="w-4 h-4" />}
          </button>
          <pre className="text-[11px] font-mono text-fg-muted whitespace-pre-wrap break-all pr-8">{curl}</pre>
        </div>
      </GlassCard>

      {/* Recent keys */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-fg">Active idempotency keys</h3>
          <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
            View replays in Logs <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {s.recent.length === 0 ? (
          <GlassCard className="p-0 overflow-hidden">
            <EmptyState
              icon={<Repeat2 className="w-8 h-8" />}
              title="No idempotent writes yet"
              description="Send a POST with an Idempotency-Key header and it will appear here with its replay count and TTL. Retries of that key are then free and duplicate-safe."
              action={<Link href="/console/explorer"><Button variant="secondary" size="sm"><Compass className="w-4 h-4" /> Run a POST in Explorer</Button></Link>}
            />
          </GlassCard>
        ) : (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <DataTable<IdempotencyKeyView>
              columns={columns}
              rows={s.recent}
              rowKey={(r) => r.key + r.storedAt}
              initialSort={{ key: 'storedAt', dir: 'desc' }}
              pageSize={10}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function IdempotencySkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-44 rounded-2xl mt-6" />
      <Skeleton className="h-80 rounded-2xl mt-6" />
    </div>
  );
}

export default function IdempotencyPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <IdempotencyInner />
    </RoleGuard>
  );
}
