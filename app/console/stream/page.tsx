'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Play, Square, CheckCircle2, XCircle, AlertTriangle, Zap, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, Button, EmptyState, StatusBadge, SegmentedControl, KpiTile,
  type BadgeTone,
} from '@/components/ui';

type StreamKind = 'people' | 'companies';
type RowStatus = 'matched' | 'missed' | 'error';
interface Row {
  index: number;
  input: string;
  status: RowStatus;
  output?: Record<string, unknown>;
  error?: string;
  latency_ms: number;
}

const KIND_OPTIONS: { value: StreamKind; label: string }[] = [
  { value: 'people', label: 'People (by email)' },
  { value: 'companies', label: 'Companies (by domain)' },
];
const KIND_ENDPOINT: Record<StreamKind, string> = { people: 'people-search', companies: 'company-enrich' };
const SAMPLE: Record<StreamKind, string> = {
  people: 'marcus@stripe.com\npriya.nair@zomato.in\nsarah@datadoghq.com\ndev@vercel.com\njordan@shopify.com\nceo@figma.com\nnot-an-email\nhana@notion.so',
  companies: 'stripe.com\ndatadoghq.com\nshopify.com\nzomato.in\nfigma.com\nvercel.com\nnotion.so\nairbnb.com',
};

function statusTone(s: RowStatus): BadgeTone {
  if (s === 'matched') return 'success';
  if (s === 'missed') return 'warning';
  return 'error';
}
function rowLabel(r: Row): string {
  if (r.status === 'matched' && r.output) return String(r.output.full_name || r.output.name || 'matched');
  return r.error || (r.status === 'missed' ? 'no match' : 'error');
}

function StreamInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [kind, setKind] = useState<StreamKind>('people');
  const [inputText, setInputText] = useState(SAMPLE.people);
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [meta, setMeta] = useState<{ total: number; matched: number; missed: number; errors: number; elapsedMs: number }>({ total: 0, matched: 0, missed: 0, errors: 0, elapsedMs: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function startStream() {
    const inputs = inputText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (inputs.length === 0) { setErrorMsg('Add at least one identifier, one per line.'); return; }

    setRows([]); setErrorMsg(null); setPhase('streaming');
    setMeta({ total: inputs.length, matched: 0, missed: 0, errors: 0, elapsedMs: 0 });
    track('stream_started', { kind, size: inputs.length, environment });
    const startedAt = performance.now();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/v1/enrich/stream', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: KIND_ENDPOINT[kind], inputs }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = 'The gateway rejected the stream.';
        try { const b = await res.json(); msg = b?.error?.message || msg; } catch { /* not JSON */ }
        setErrorMsg(msg); setPhase('error'); return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let matched = 0, missed = 0, errors = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          if (!raw.trim()) continue;
          let frame: Record<string, unknown>;
          try { frame = JSON.parse(raw); } catch { continue; }
          if (frame.type === 'row') {
            const row = frame as unknown as Row;
            if (row.status === 'matched') matched++; else if (row.status === 'missed') missed++; else errors++;
            setRows((prev) => [...prev, row]);
            setMeta((m) => ({ ...m, matched, missed, errors, elapsedMs: Math.round(performance.now() - startedAt) }));
          }
        }
      }
      const elapsedMs = Math.round(performance.now() - startedAt);
      setMeta((m) => ({ ...m, matched, missed, errors, elapsedMs }));
      setPhase('done');
      track('stream_completed', { kind, matched, missed, errors, durationMs: elapsedMs, environment });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase('done'); return; }
      setErrorMsg('Connection to the stream was lost.'); setPhase('error');
    } finally {
      abortRef.current = null;
    }
  }

  function stopStream() {
    abortRef.current?.abort();
  }

  const throughput = meta.elapsedMs > 0 ? Math.round((rows.length / meta.elapsedMs) * 1000) : 0;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Streaming Enrichment"
        description="Enrich a list over one low-latency connection — each row's result streams back the moment it resolves, instead of waiting for the whole batch. This runs the real POST /v1/enrich/stream (NDJSON)."
        icon={<Radio />}
      />

      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Inputs</div>
          <SegmentedControl
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => { setKind(k); setInputText(SAMPLE[k]); setErrorMsg(null); }}
            layoutId="stream-kind"
            size="sm"
          />
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={5}
          spellCheck={false}
          disabled={phase === 'streaming'}
          className="w-full mt-3 rounded-xl bg-surface-2 border border-border text-fg text-sm font-mono p-3 focus:outline-none focus:border-teal/50 transition-colors resize-y disabled:opacity-60"
          placeholder={kind === 'people' ? 'one email per line' : 'one domain per line'}
        />
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <span className="text-[11px] text-fg-subtle">
            {inputText.split(/[\n,]/).map(s => s.trim()).filter(Boolean).length} input(s) · 1 credit each · streamed as NDJSON
          </span>
          <div className="flex items-center gap-2">
            {errorMsg && <span className="text-[11px] font-semibold text-semantic-error">{errorMsg}</span>}
            {phase === 'streaming' ? (
              <Button variant="secondary" size="sm" onClick={stopStream}><Square className="w-3.5 h-3.5" /> Stop</Button>
            ) : (
              <Button variant="primary" size="sm" onClick={startStream} disabled={!apiKey}>
                <Play className="w-4 h-4" /> Start stream
              </Button>
            )}
          </div>
        </div>
        {!apiKey && <p className="text-[11px] text-semantic-warning mt-2">No {environment} key found — create one in <Link href="/console/keys" className="underline">API Keys</Link> to stream.</p>}
      </GlassCard>

      {/* Live stats */}
      {(phase !== 'idle') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <KpiTile label="Streamed" value={`${rows.length} / ${meta.total}`} icon={phase === 'streaming' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} />
          <KpiTile label="Matched" value={meta.matched} icon={<CheckCircle2 />} />
          <KpiTile label="Missed / errors" value={meta.missed + meta.errors} icon={<XCircle />} lowerIsBetter />
          <KpiTile label="Throughput" value={`${throughput}/s`} icon={<Zap />} hint={`${meta.elapsedMs}ms elapsed`} />
        </div>
      )}

      {/* Streamed rows */}
      <div className="mt-6">
        {phase === 'idle' ? (
          <GlassCard className="p-0">
            <EmptyState icon={<Radio className="w-8 h-8" />} title="Nothing streaming yet"
              description="Paste a list and hit Start stream to watch rows arrive one by one, or POST to /v1/enrich/stream from your code and read the NDJSON response." />
          </GlassCard>
        ) : phase === 'error' ? (
          <GlassCard className="p-0">
            <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="Stream failed"
              description={errorMsg || 'The gateway did not accept the stream.'}
              action={<Button variant="secondary" onClick={startStream}><Play className="w-4 h-4" /> Retry</Button>} />
          </GlassCard>
        ) : (
          <GlassCard className="p-2">
            <ul className="divide-y divide-border-subtle">
              <AnimatePresence initial={false}>
                {rows.map((r) => (
                  <motion.li key={r.index} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-[10px] font-mono text-fg-subtle w-8 text-right tabular-nums">{r.index}</span>
                    <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge>
                    <span className="font-mono text-[12px] text-fg-muted truncate w-56">{r.input}</span>
                    <span className="text-[13px] text-fg truncate flex-1">{rowLabel(r)}</span>
                    <span className="text-[10px] font-mono text-fg-subtle tabular-nums">{r.latency_ms}ms</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {phase === 'streaming' && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-fg-subtle">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal" /> streaming…
              </div>
            )}
          </GlassCard>
        )}

        {phase !== 'idle' && (
          <div className="flex items-center gap-3 pt-3 text-[11px] text-fg-subtle">
            <Link href="/console/async-jobs" className="hover:text-fg transition-colors">Async Jobs (very large batches)</Link>
            <span>·</span>
            <Link href="/console/explorer" className="hover:text-fg transition-colors">Explorer</Link>
            <span>·</span>
            <Link href="/console/logs" className="hover:text-fg transition-colors">Logs</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StreamPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <StreamInner />
    </RoleGuard>
  );
}
