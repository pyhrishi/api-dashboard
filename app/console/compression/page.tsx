'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Archive, Gauge, TrendingDown, Layers, RefreshCw, Copy, Check, Play, AlertTriangle, ArrowRight, Zap } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue, API_BASE_URL } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, type BadgeTone } from '@/components/ui';

type Encoding = 'br' | 'gzip' | 'identity';
interface EncodingStat { encoding: Encoding; responses: number; original_bytes: number; compressed_bytes: number; saved_bytes: number; avg_ratio: number; }
interface CompressionStats { total_responses: number; compressed_responses: number; total_saved_bytes: number; avg_ratio: number; saved_pct: number; by_encoding: EncodingStat[]; }

const ENC_META: Record<Encoding, { label: string; tone: BadgeTone }> = {
  br: { label: 'Brotli', tone: 'teal' }, gzip: { label: 'Gzip', tone: 'info' }, identity: { label: 'Uncompressed', tone: 'neutral' },
};

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

function CompressionInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stats, setStats] = useState<CompressionStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [sample, setSample] = useState<{ original: number; compressed: number } | null>(null);
  const [sampling, setSampling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/compression', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to load compression stats');
      setStats(body.data as CompressionStats);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [apiKey]);

  useEffect(() => { track('compression_viewed', { environment }); refresh(); }, [refresh, environment]);

  // Live sample: read the byte-saving headers off a real compressed response.
  const runSample = async () => {
    setSampling(true);
    try {
      const res = await fetch('/api/v1/companies/employees?domain=acme.com&limit=100', {
        headers: { Authorization: authHeaderValue(apiKey), 'Accept-Encoding': 'br, gzip' },
      });
      const original = Number(res.headers.get('X-Uncompressed-Bytes') || 0);
      const compressed = Number(res.headers.get('X-Compressed-Bytes') || 0);
      if (original) setSample({ original, compressed });
      await refresh();
    } catch { /* ignore */ } finally { setSampling(false); }
  };

  const curl = `curl "${API_BASE_URL}/v1/companies/employees?domain=acme.com&limit=100" \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Accept-Encoding: br, gzip" --compressed`;
  const copy = () => { navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  if (phase === 'loading') return <CompressionSkeleton />;
  if (phase === 'error') {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader icon={<Archive />} title="Compression" description="Brotli / Gzip response compression and the bandwidth it saves." />
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load compression stats"
            description="The gateway didn’t respond. Check you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      </div>
    );
  }

  const s = stats!;
  const samplePct = sample && sample.original > 0 ? Math.round((1 - sample.compressed / sample.original) * 1000) / 10 : null;

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<Archive />}
        title="Compression"
        description="Send Accept-Encoding: br (or gzip) and the gateway compresses the JSON response — Brotli preferred, it beats gzip on JSON — reporting exactly how many bytes it saved. Small payloads pass through uncompressed."
        actions={<Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Bandwidth saved" value={fmtBytes(s.total_saved_bytes)} icon={<TrendingDown />} hint="cumulative" />
        <KpiTile label="Payload reduction" value={`${s.saved_pct}%`} icon={<Gauge />} hint="of total bytes" />
        <KpiTile label="Avg ratio" value={s.avg_ratio.toFixed(3)} icon={<Zap />} hint="compressed ÷ original" />
        <KpiTile label="Compressed" value={s.compressed_responses.toLocaleString()} icon={<Layers />} hint={`of ${s.total_responses.toLocaleString()} responses`} />
      </div>

      {/* Live sample */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Live sample</span>
            <p className="text-sm text-fg-muted mt-1">Fetch a 100-row list with <code className="text-teal font-mono text-xs">Accept-Encoding: br</code> and read the byte savings straight off the response headers.</p>
          </div>
          <Button size="sm" onClick={runSample} disabled={sampling}>{sampling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run sample</Button>
        </div>
        {sample && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono text-fg-muted">{fmtBytes(sample.original)}</span>
            <ArrowRight className="w-4 h-4 text-teal" />
            <span className="text-sm font-mono font-bold text-fg">{fmtBytes(sample.compressed)}</span>
            {samplePct !== null && <StatusBadge tone="success">{samplePct}% smaller</StatusBadge>}
          </motion.div>
        )}
      </GlassCard>

      {/* By encoding */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {s.by_encoding.map((e, i) => (
          <motion.div key={e.encoding} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
            <GlassCard className="p-5 h-full">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-fg">{ENC_META[e.encoding].label}</span>
                <StatusBadge tone={ENC_META[e.encoding].tone}>{e.encoding}</StatusBadge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Responses</div><div className="text-lg font-bold text-fg tabular-nums mt-0.5">{e.responses.toLocaleString()}</div></div>
                <div><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Saved</div><div className="text-lg font-bold text-fg tabular-nums mt-0.5">{fmtBytes(e.saved_bytes)}</div></div>
              </div>
              {e.encoding !== 'identity' && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-[11px] text-fg-subtle mb-1"><span>Avg ratio</span><span className="font-mono text-fg-muted">{e.avg_ratio.toFixed(3)}</span></div>
                  <div className="h-2 rounded-full bg-glass overflow-hidden"><div className="h-full rounded-full bg-teal" style={{ width: `${Math.min(100, e.avg_ratio * 100)}%` }} /></div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* How-to */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-3"><Archive className="w-4 h-4 text-teal" /><span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Enable compression</span></div>
        <p className="text-sm text-fg-muted mb-3">Add an <code className="text-teal font-mono text-xs">Accept-Encoding</code> header (most HTTP clients do this automatically and decompress transparently). The gateway advertises <code className="text-teal font-mono text-xs">Vary: Accept-Encoding</code> so caches store each variant correctly.</p>
        <div className="rounded-xl border border-border bg-surface p-3 relative">
          <button onClick={copy} className="absolute top-2.5 right-2.5 text-fg-subtle hover:text-teal transition-colors p-1 rounded-md hover:bg-glass" aria-label="Copy cURL">
            {copied ? <Check className="w-4 h-4 text-semantic-success" /> : <Copy className="w-4 h-4" />}
          </button>
          <pre className="text-[11px] font-mono text-fg-muted whitespace-pre-wrap break-all pr-8">{curl}</pre>
        </div>
        <Link href="/console/field-selection" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1 mt-3">
          Combine with field selection for even smaller payloads <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </GlassCard>
    </div>
  );
}

function CompressionSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-24 rounded-2xl mt-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
    </div>
  );
}

export default function CompressionPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <CompressionInner />
    </RoleGuard>
  );
}
