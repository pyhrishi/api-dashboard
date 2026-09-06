'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cable, Gauge, Zap, Copy, Check, Play, RefreshCw, AlertTriangle, ArrowRight,
  Server, Lock, Rocket, Timer, Activity, GitBranch, ChevronRight,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue, GRPC_HOST, GRPC_PORT } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, StatusBadge, type BadgeTone } from '@/components/ui';
import { renderProto, METHODS, GRPC_PACKAGE, GRPC_SERVICE, inputKeyFor, isStreaming, type RpcMethod } from '@/lib/grpc/schema';

interface BenchmarkResponse {
  method: string;
  rpcType: string;
  count: number;
  matched: number;
  cost: number;
  p50: number; p95: number; p99: number;
  meanLatencyMs: number;
  serialMs: number;
  multiplexedStreams: number;
  elapsedMs: number;
  rps: number;
}

const RPC_TONE: Record<string, BadgeTone> = { unary: 'info', server_stream: 'teal', client_stream: 'teal', bidi_stream: 'success' };
const rpcLabel = (t: string) => t.replace('_', ' ');

type SnippetLang = 'grpcurl' | 'go' | 'python' | 'node';
const LANGS: { id: SnippetLang; label: string }[] = [
  { id: 'grpcurl', label: 'grpcurl' }, { id: 'go', label: 'Go' }, { id: 'python', label: 'Python' }, { id: 'node', label: 'Node' },
];

function snippet(lang: SnippetLang, method: RpcMethod, apiKey: string): string {
  const target = `${GRPC_HOST}:${GRPC_PORT}`;
  const fq = `${GRPC_PACKAGE}.${GRPC_SERVICE}`;
  const key = inputKeyFor(method);
  const sample = key === 'email' ? 'jane@stripe.com' : key === 'ip' ? '8.8.8.8' : 'stripe.com';
  const bearer = apiKey || 'sk_live_...';
  switch (lang) {
    case 'grpcurl':
      return `grpcurl -H "authorization: Bearer ${bearer}" \\\n  -d '{"${key}": "${sample}"}' \\\n  ${target} ${fq}/${method.name}`;
    case 'go':
      return `conn, _ := grpc.Dial("${target}", grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})))\nclient := pb.New${GRPC_SERVICE}Client(conn)\nctx := metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer ${bearer}")\nres, _ := client.${method.name}(ctx, &pb.${method.requestType}{${key[0].toUpperCase()}${key.slice(1)}: "${sample}"})`;
    case 'python':
      return `channel = grpc.secure_channel("${target}", grpc.ssl_channel_credentials())\nstub = ${GRPC_SERVICE}Stub(channel)\nres = stub.${method.name}(\n    ${method.requestType}(${key}="${sample}"),\n    metadata=[("authorization", "Bearer ${bearer}")],\n)`;
    case 'node':
      return `const client = new proto.${fq}.${GRPC_SERVICE}(\n  "${target}", grpc.credentials.createSsl());\nconst meta = new grpc.Metadata();\nmeta.add("authorization", "Bearer ${bearer}");\nclient.${method.name}({ ${key}: "${sample}" }, meta, (err, res) => console.log(res));`;
  }
}

function GrpcInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);
  const toast = useToast();

  const methodList = useMemo(() => Object.values(METHODS), []);
  const [selectedMethod, setSelectedMethod] = useState<string>('BatchEnrichCompanies');
  const [lang, setLang] = useState<SnippetLang>('grpcurl');
  const [count, setCount] = useState(1000);
  const [phase, setPhase] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<BenchmarkResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const proto = useMemo(() => renderProto(), []);
  const method = METHODS[selectedMethod];

  useEffect(() => { track('grpc_channel_viewed', { environment }); }, [environment]);

  const copy = (text: string, tag: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1200); }).catch(() => {}); };

  const runBenchmark = useCallback(async () => {
    setPhase('running');
    try {
      const res = await fetch('/api/grpc', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: GRPC_SERVICE, method: selectedMethod, benchmark: count }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Benchmark failed');
      const b = body.benchmark as BenchmarkResponse;
      setResult(b);
      setPhase('ready');
      track('grpc_benchmark_run', { method: selectedMethod, count: b.count, rps: b.rps, matched: b.matched, environment });
      toast.success('Channel benchmark complete', `${b.rps.toLocaleString()} req/s over ${b.multiplexedStreams} multiplexed streams.`);
    } catch (e) {
      setPhase('error');
      toast.error('Benchmark failed', e instanceof Error ? e.message : 'Unexpected error');
    }
  }, [apiKey, selectedMethod, count, toast, environment]);

  const speedup = result && result.elapsedMs > 0 ? Math.max(1, Math.round(result.serialMs / result.elapsedMs)) : 0;

  return (
    <div className="max-w-[1150px] mx-auto pb-16">
      <PageHeader
        icon={<Cable />}
        title="gRPC High-Throughput Channel"
        description="A binary protobuf service over HTTP/2 for enterprise-scale ingestion — unary calls plus bidirectional streaming that pushes thousands of records over one multiplexed connection. Same resolvers, auth, billing, and live-key masking as REST + GraphQL. Browsers reach it via gRPC-JSON transcoding at /api/grpc."
        actions={<Link href="/console/graphql"><Button variant="secondary" size="sm"><GitBranch className="w-4 h-4" /> GraphQL</Button></Link>}
      />

      {/* Connection */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Server className="w-4 h-4 text-teal" />
          <span className="font-mono text-sm text-fg">{GRPC_HOST}:{GRPC_PORT}</span>
          <StatusBadge tone="success"><Lock className="w-3 h-3" /> TLS</StatusBadge>
          <StatusBadge tone="teal">HTTP/2 multiplexed</StatusBadge>
          <StatusBadge tone="info">{GRPC_PACKAGE}.{GRPC_SERVICE}</StatusBadge>
          <span className="ml-auto text-[11px] text-fg-subtle">{methodList.length} methods · gRPC-JSON at <span className="font-mono">/api/grpc</span></span>
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-[1fr_400px] gap-5 mt-5">
        {/* Left: methods + benchmark */}
        <div className="space-y-5">
          {/* Benchmark */}
          <GlassCard className="p-5">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Rocket className="w-4 h-4 text-teal" /> Throughput benchmark</h3>
                <p className="text-[12px] text-fg-muted mt-1 leading-snug">Push a batch of records through the channel and measure real throughput over one multiplexed connection.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1.5 focus:border-teal/50 outline-none">
                  {methodList.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1.5 focus:border-teal/50 outline-none">
                  {[100, 500, 1000, 5000].map((n) => <option key={n} value={n}>{n.toLocaleString()} records</option>)}
                </select>
                <Button onClick={runBenchmark} disabled={phase === 'running'}>{phase === 'running' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run</Button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {phase === 'idle' && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mt-4"><EmptyState icon={<Gauge className="w-7 h-7" />} title="Run a benchmark" description="Pick a method and batch size, then Run to see req/s, latency percentiles, and channel speedup." /></div>
                </motion.div>
              )}
              {phase === 'error' && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
                  <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-2 text-sm text-fg-muted">
                    <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" /> Benchmark failed — check your API key has credits, then retry.
                    <Button variant="secondary" size="sm" className="ml-auto" onClick={runBenchmark}><RefreshCw className="w-4 h-4" /> Retry</Button>
                  </div>
                </motion.div>
              )}
              {phase === 'ready' && result && (
                <motion.div key="res" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-teal/30 bg-teal/5 p-5 text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Throughput</div>
                    <div className="text-4xl font-black text-teal tabular-nums mt-1">{result.rps.toLocaleString()}<span className="text-lg text-fg-muted font-bold"> req/s</span></div>
                    <div className="text-[11px] text-fg-subtle mt-1">{result.count.toLocaleString()} records · {result.matched.toLocaleString()} matched · {result.elapsedMs}ms · {result.multiplexedStreams} streams</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiTile label="p50" value={`${result.p50}ms`} icon={<Timer />} />
                    <KpiTile label="p95" value={`${result.p95}ms`} icon={<Timer />} />
                    <KpiTile label="p99" value={`${result.p99}ms`} icon={<Timer />} />
                    <KpiTile label="Speedup" value={`${speedup}×`} icon={<Zap />} hint="vs serial" />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-fg-subtle flex-wrap">
                    <StatusBadge tone={RPC_TONE[result.rpcType]}>{rpcLabel(result.rpcType)}</StatusBadge>
                    <span>serial equivalent {Math.round(result.serialMs)}ms → multiplexed {result.elapsedMs}ms</span>
                    <span className="ml-auto">{result.cost.toLocaleString()} credits</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Methods */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Service methods</div>
            <div className="space-y-2">
              {methodList.map((m) => (
                <button key={m.name} onClick={() => setSelectedMethod(m.name)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${selectedMethod === m.name ? 'border-teal/40 bg-teal/10' : 'border-border bg-surface-2 hover:border-border'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[13px] font-bold text-fg">{m.name}</span>
                    <StatusBadge tone={RPC_TONE[m.rpcType]}>{rpcLabel(m.rpcType)}</StatusBadge>
                    {isStreaming(m) && <StatusBadge tone="teal">streaming</StatusBadge>}
                    <span className="ml-auto text-[11px] text-fg-subtle">{m.creditCost} credit{m.creditCost === 1 ? '' : 's'}/rec</span>
                  </div>
                  <div className="text-[11px] text-fg-subtle mt-1 flex items-center gap-1.5 font-mono">
                    {m.requestType} <ArrowRight className="w-3 h-3" /> {m.responseType}
                  </div>
                  <p className="text-[12px] text-fg-muted mt-1 leading-snug">{m.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: proto + client snippets */}
        <div className="space-y-5">
          <GlassCard className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">enrichment.proto</span>
              <button onClick={() => copy(proto, 'proto')} className="text-[11px] font-semibold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">{copied === 'proto' ? <><Check className="w-3 h-3 text-teal" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}</button>
            </div>
            <pre className="text-[10.5px] font-mono p-4 overflow-x-auto text-fg-muted max-h-[22rem] leading-relaxed">{proto}</pre>
          </GlassCard>

          <GlassCard className="p-0 overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors shrink-0 ${lang === l.id ? 'bg-teal/10 text-teal' : 'text-fg-muted hover:text-fg'}`}>{l.label}</button>
              ))}
              <button onClick={() => copy(snippet(lang, method, apiKey), 'snip')} className="ml-auto text-[11px] font-semibold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1 shrink-0">{copied === 'snip' ? <><Check className="w-3 h-3 text-teal" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}</button>
            </div>
            <pre className="text-[10.5px] font-mono p-4 overflow-x-auto text-fg-muted leading-relaxed">{snippet(lang, method, apiKey)}</pre>
            <div className="px-4 pb-3 text-[10.5px] text-fg-subtle flex items-center gap-1"><ChevronRight className="w-3 h-3" /> Client for <span className="font-mono text-fg-muted">{method.name}</span> ({rpcLabel(method.rpcType)})</div>
          </GlassCard>

          <div className="flex items-center justify-between">
            <Link href="/console/stream" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> REST streaming</Link>
            <Link href="/console/coalescing" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request coalescing <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GrpcPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <GrpcInner />
    </RoleGuard>
  );
}
