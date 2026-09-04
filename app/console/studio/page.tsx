'use client';

import React, { Suspense, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Search, ArrowRight, Copy, Check, Lock, ShieldCheck, Clock, Trash2, RefreshCw,
  ExternalLink, Info, Zap, Layers, UserSearch, Building2, PhoneCall, Mail, Fingerprint, Landmark, Globe2,
} from 'lucide-react';
import Link from 'next/link';
import { useStore, type EnrichmentRecord } from '@/lib/store';
import {
  getEnrichmentPresets, getPresetById, detectInputKind, validateInput, toEnrichmentResult,
  type EnrichmentPreset, type EnrichmentResult,
} from '@/data/enrichments';
import { consoleApiUrl, authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, StatusBadge, EmptyState, Skeleton, ConfirmAction } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

const ICONS: Record<string, React.ElementType> = { UserSearch, Building2, PhoneCall, Mail, Fingerprint, Landmark, Globe2, Sparkles };

type Phase = 'idle' | 'running' | 'ok' | 'not_found' | 'error';

function confidenceTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success'; if (c >= 0.7) return 'teal'; if (c >= 0.55) return 'warning'; return 'error';
}
function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High confidence'; if (c >= 0.7) return 'Good confidence'; if (c >= 0.55) return 'Moderate'; return 'Low confidence';
}

function StudioInner() {
  const search = useSearchParams();
  const presets = useMemo(() => getEnrichmentPresets(), []);
  const initialPreset = getPresetById(search.get('preset') ?? '') ?? presets[0];

  const { environment, activeKeys, deductCredits, incrementKeyUsage, enrichments,
    addEnrichment, removeEnrichment, clearEnrichments, isFirstCallMade, markFirstCallMade } = useStore();

  const [preset, setPreset] = useState<EnrichmentPreset>(initialPreset);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [meta, setMeta] = useState<{ message?: string; durationMs?: number; status?: number }>({});
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const key = activeKeys.find(k => k.environment === environment) ?? activeKeys[0];
  const apiKey = key?.key ?? '';
  const isLive = environment === 'live';

  const scoped = useMemo(() => enrichments.filter(r => r.environment === environment), [enrichments, environment]);
  const stats = useMemo(() => {
    const ok = scoped.filter(r => r.status === 'ok');
    const avg = ok.length ? ok.reduce((n, r) => n + r.confidence, 0) / ok.length : 0;
    const presetsUsed = new Set(scoped.map(r => r.presetId));
    const credits = scoped.reduce((n, r) => n + (r.status === 'ok' ? r.creditCost : 0), 0);
    return { total: ok.length, avg, presets: presetsUsed.size, credits };
  }, [scoped]);

  const effectiveKind = preset.inputKind === 'auto' ? detectInputKind(value) : preset.inputKind;
  const valid = validateInput(preset.inputKind, value);
  const canRun = valid && phase !== 'running' && !!apiKey;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text); setCopied(id);
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1600);
  };

  const selectPreset = (p: EnrichmentPreset) => {
    setPreset(p); setPhase('idle'); setResult(null); setValue(''); setMeta({});
    track('feature_viewed', { feature: `studio:${p.id}` });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  async function run(preFill?: string, presetOverride?: EnrichmentPreset) {
    const p = presetOverride ?? preset;
    const raw = (preFill ?? value).trim();
    if (!validateInput(p.inputKind, raw)) { inputRef.current?.focus(); return; }
    setPreset(p); setValue(raw); setPhase('running'); setResult(null); setMeta({});

    const startedAt = performance.now();
    const url = consoleApiUrl(p.path, { [p.param]: raw });
    try {
      const res = await fetch(url, { method: p.endpoint.method, headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' } });
      const durationMs = Math.round(performance.now() - startedAt);
      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }
      const requestId = res.headers.get('x-request-id');

      useStore.getState().logApiRequest({
        id: requestId || `req_${Date.now().toString(36)}`, environment, timestamp: new Date().toISOString(),
        method: p.endpoint.method, path: p.path, status: res.status, duration: durationMs, ip: '::1',
        request: { headers: { Authorization: authHeaderValue(apiKey) }, parameters: { [p.param]: raw } }, response: body,
      });

      const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
      const vm = res.ok ? toEnrichmentResult(data) : null;

      if (res.ok && vm) {
        deductCredits(p.creditCost); incrementKeyUsage(key?.id ?? '', p.creditCost);
        setResult(vm); setPhase('ok'); setMeta({ durationMs, status: res.status });
        addEnrichment({
          id: requestId || `enr_${Date.now().toString(36)}`, presetId: p.id, endpointId: p.endpointId, input: raw,
          result: vm, status: 'ok', environment, confidence: vm.confidence ?? 0, creditCost: p.creditCost, requestId, durationMs, timestamp: Date.now(),
        });
        track('enrichment_run', { preset: p.id, endpoint: p.endpointId, confidence: vm.confidence ?? null, environment, durationMs });
        if (!isFirstCallMade) markFirstCallMade({ endpoint: p.endpointId, method: p.endpoint.method, statusCode: res.status, responseTime: durationMs, response: body });
      } else if (res.status === 402) {
        setPhase('error'); setMeta({ message: 'You are out of credits. Recharge to keep enriching.', durationMs, status: 402 });
        track('upgrade_prompt_shown', { surface: 'studio', reason: 'out_of_credits' });
        track('enrichment_failed', { preset: p.id, environment, reason: 'out_of_credits' });
      } else if (res.status === 429) {
        setPhase('error'); setMeta({ message: 'Rate limit reached. Please slow down and try again.', durationMs, status: 429 });
        track('enrichment_failed', { preset: p.id, environment, reason: 'rate_limited' });
      } else {
        const errMsg = (data && typeof data === 'object' && 'error' in data && (data as { error?: { message?: string } }).error?.message) || 'No result for that input.';
        setPhase(res.ok ? 'not_found' : 'error'); setMeta({ message: String(errMsg), durationMs, status: res.status });
        addEnrichment({
          id: requestId || `enr_${Date.now().toString(36)}`, presetId: p.id, endpointId: p.endpointId, input: raw, result: null,
          status: res.ok ? 'not_found' : 'error', environment, confidence: 0, creditCost: 0, requestId, durationMs, timestamp: Date.now(), message: String(errMsg),
        });
        track('enrichment_failed', { preset: p.id, environment, reason: res.ok ? 'not_found' : `http_${res.status}` });
      }
    } catch (e: unknown) {
      setPhase('error'); setMeta({ message: e instanceof Error ? e.message : 'Network error reaching the gateway' });
      track('enrichment_failed', { preset: p.id, environment, reason: 'network' });
    }
  }

  const rerun = (r: EnrichmentRecord) => { const p = getPresetById(r.presetId); if (p) run(r.input, p); };

  return (
    <div className="max-w-[1200px] mx-auto space-y-8">
      <PageHeader icon={<Layers />} title="Enrichment Studio"
        description="One workspace for every lookup — resolve a person, enrich a company, find a phone, or auto-detect any identifier. Each result carries a confidence score and per-field provenance. Runs against the live gateway and bills like production."
        actions={<StatusBadge tone={isLive ? 'warning' : 'teal'} dot>{isLive ? 'Live · PII masked' : 'Sandbox · full data'}</StatusBadge>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Enrichments" value={stats.total} icon={<Layers />} hint={`in ${environment}`} />
        <KpiTile label="Avg confidence" value={stats.total ? `${Math.round(stats.avg * 100)}%` : '—'} icon={<Sparkles />} hint="across results" />
        <KpiTile label="Lookups used" value={stats.presets} icon={<Fingerprint />} hint={`of ${presets.length} presets`} />
        <KpiTile label="Credits used" value={stats.credits} icon={<Zap />} hint="this environment" />
      </div>

      {/* Preset picker */}
      <div className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Choose a lookup</span>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const Icon = ICONS[p.icon] ?? Sparkles;
            const active = p.id === preset.id;
            return (
              <button key={p.id} onClick={() => selectPreset(p)}
                className={`group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${active ? 'bg-teal/10 border-teal/40 text-teal' : 'bg-surface-2 border-border text-fg-muted hover:text-fg hover:bg-glass'}`}>
                <Icon className="w-3.5 h-3.5" /> {p.label}
                <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${active ? 'bg-teal/15' : 'bg-glass'}`}>{p.creditCost}c</span>
              </button>
            );
          })}
        </div>
      </div>

      <GlassCard className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="studio-input" className="block text-sm font-bold text-fg">{preset.label}</label>
          <span className="text-[11px] text-fg-subtle font-mono">{preset.endpoint.method} {preset.path}</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none z-10" />
            <Input id="studio-input" ref={inputRef} value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canRun) run(); }}
              placeholder={preset.placeholder} aria-label={`${preset.label} input`} autoComplete="off" spellCheck={false} className="pl-9" />
          </div>
          <Button onClick={() => run()} disabled={!canRun} loading={phase === 'running'} className="shrink-0">
            {phase === 'running' ? 'Running' : <>Run <ArrowRight className="w-4 h-4" /></>}
          </Button>
        </div>
        <div className="flex items-center flex-wrap gap-2 mt-3">
          <span className="text-[11px] font-semibold text-fg-subtle">Try:</span>
          {preset.examples.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="text-[11px] font-mono px-2 py-1 rounded-md bg-glass hover:bg-glass-2 text-fg-muted hover:text-fg border border-border-subtle transition-colors">{ex}</button>
          ))}
          {preset.inputKind === 'auto' && value && <StatusBadge tone="info">detected: {effectiveKind}</StatusBadge>}
          {value && !valid && <span className="text-[11px] font-semibold text-semantic-error ml-1">Enter a valid {preset.inputKind === 'auto' ? 'identifier' : preset.inputKind}.</span>}
          {!apiKey && <span className="text-[11px] font-semibold text-semantic-warning ml-1">No {environment} key — create one in <Link href="/console/keys" className="underline">API Keys</Link>.</span>}
        </div>
      </GlassCard>

      <AnimatePresence mode="wait">
        {phase === 'running' && <ResultSkeleton key="loading" />}
        {phase === 'ok' && result && <ResultCard key="result" result={result} preset={preset} isLive={isLive} meta={meta} copied={copied} onCopy={copy} />}
        {phase === 'not_found' && (
          <motion.div key="nf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <EmptyState icon={<Search className="w-8 h-8" />} title="No result" description={meta.message || 'That input returned no match. Try another value or lookup.'}
              action={<Button variant="secondary" onClick={() => inputRef.current?.focus()}>Try again</Button>} />
          </motion.div>
        )}
        {phase === 'error' && (
          <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard className="p-6 border-semantic-error/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-semantic-error/10 flex items-center justify-center shrink-0"><Info className="w-5 h-5 text-semantic-error" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-fg">Enrichment failed{meta.status ? ` · ${meta.status}` : ''}</h3>
                  <p className="text-sm text-fg-muted mt-1">{meta.message || 'Something went wrong reaching the gateway.'}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button variant="secondary" onClick={() => run()}>Retry</Button>
                    {meta.status === 402 && (
                      <Link href="/console/billing" onClick={() => track('upgrade_prompt_clicked', { surface: 'studio', reason: 'out_of_credits' })}>
                        <Button variant="primary">Recharge credits</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState icon={<Layers className="w-8 h-8" />} title={`Run your first ${preset.label.toLowerCase()}`}
              description="Pick a lookup above, enter an identifier or tap an example. Every result comes back with the fields, a confidence score, and the signals behind each one." />
          </motion.div>
        )}
      </AnimatePresence>

      {scoped.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Recent enrichments</h3>
            <ConfirmAction onConfirm={clearEnrichments} variant="ghost" size="sm" confirmLabel="Clear all?">Clear history</ConfirmAction>
          </div>
          <div className="rounded-2xl overflow-hidden border border-border divide-y divide-border">
            {scoped.slice(0, 12).map((r) => (
              <motion.div key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group flex items-center gap-3 bg-surface-2 hover:bg-glass transition-colors p-3">
                <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center text-[10px] font-black shrink-0">{r.result?.avatar ?? '—'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-fg truncate">{r.result?.title ?? r.input}</span>
                    {r.status === 'ok'
                      ? <StatusBadge tone={confidenceTone(r.confidence)}>{Math.round(r.confidence * 100)}%</StatusBadge>
                      : <StatusBadge tone={r.status === 'not_found' ? 'neutral' : 'error'}>{r.status === 'not_found' ? 'No match' : 'Error'}</StatusBadge>}
                  </div>
                  <div className="text-[11px] text-fg-subtle font-mono truncate">{getPresetById(r.presetId)?.label ?? r.presetId} · {r.input}</div>
                </div>
                <button onClick={() => rerun(r)} aria-label="Re-run" className="p-2 rounded-lg text-fg-subtle hover:text-teal hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={() => removeEnrichment(r.id)} aria-label="Remove" className="p-2 rounded-lg text-fg-subtle hover:text-semantic-error hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, preset, isLive, meta, copied, onCopy }: {
  result: EnrichmentResult; preset: EnrichmentPreset; isLive: boolean;
  meta: { durationMs?: number }; copied: string | null; onCopy: (t: string, id: string) => void;
}) {
  const maskVal = (v: string) => (isLive ? v.replace(/[^@.\s+()-]/g, '•') : v);
  const curl = `curl "${consoleApiUrl(preset.path, { [preset.param]: '<VALUE>' })}" \\\n  -H "Authorization: Bearer <YOUR_KEY>"`;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/30 to-teal/5 border border-teal/30 flex items-center justify-center text-lg font-black text-teal shrink-0">
            {result.avatar}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-fg">{result.title}</h2>
              {result.badges.map((b) => <StatusBadge key={b} tone="info">{b}</StatusBadge>)}
            </div>
            {result.subtitle && <p className="text-sm text-fg-muted mt-0.5">{result.subtitle}</p>}
            {result.links && result.links.length > 0 && (
              <div className="flex items-center gap-3 mt-3">
                {result.links.map((l) => (
                  <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">{l.label} <ExternalLink className="w-3 h-3" /></a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border mt-5">
          {result.fields.map((f, i) => (
            <motion.div key={f.label + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="bg-surface-2 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">
                {f.label}
                {f.verified && <ShieldCheck className="w-3 h-3 text-semantic-success" aria-label="Verified" />}
                {f.masked && isLive && <Lock className="w-3 h-3 text-fg-subtle" aria-label="Masked in live" />}
              </div>
              <div className={`text-sm font-semibold text-fg ${f.mono ? 'font-mono break-all' : ''}`}>{f.masked ? maskVal(f.value) : f.value}</div>
            </motion.div>
          ))}
        </div>

        {result.chips && result.chips.items.length > 0 && (
          <div className="mt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">{result.chips.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {result.chips.items.map((t) => <span key={t} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle">{t}</span>)}
            </div>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={() => onCopy(JSON.stringify(result.raw, null, 2), 'json')}>
            {copied === 'json' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onCopy(curl, 'curl')}>
            {copied === 'curl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy cURL
          </Button>
          <Link href={`/console/explorer?endpoint=${preset.endpointId}`}><Button variant="ghost" size="sm">Open in Explorer <ExternalLink className="w-3.5 h-3.5" /></Button></Link>
          <Link href="/console/logs"><Button variant="ghost" size="sm">View in Logs <ExternalLink className="w-3.5 h-3.5" /></Button></Link>
        </div>
      </GlassCard>

      {result.confidence !== undefined ? (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Confidence</span>
            <StatusBadge tone={confidenceTone(result.confidence)}>{confidenceLabel(result.confidence)}</StatusBadge>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black text-fg tabular-nums">{Math.round(result.confidence * 100)}</span>
            <span className="text-lg font-bold text-fg-muted">%</span>
          </div>
          <div className="h-2 rounded-full bg-glass mt-3 overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${result.confidence * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full bg-teal" />
          </div>
          {result.provenance && result.provenance.length > 0 && (
            <div className="mt-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Provenance — where each field came from</span>
              <ul className="mt-2 space-y-2">
                {result.provenance.map((p, i) => (
                  <motion.li key={p.field} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex items-start gap-2.5">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-fg capitalize">{p.field.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] font-mono tabular-nums text-fg-subtle">{Math.round(p.confidence * 100)}%</span>
                      </div>
                      <div className="text-[11px] text-fg-muted">{p.source} — {p.signal}</div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {result.lastVerified ? `Verified ${result.lastVerified}` : 'Live result'}</span>
            <span className="font-mono">{meta.durationMs ?? 0}ms</span>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="p-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Response</span>
          <p className="text-sm text-fg-muted mt-2">This lookup returned {result.fields.length} field{result.fields.length === 1 ? '' : 's'} with no confidence score. Copy the JSON for the raw payload.</p>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Live result</span>
            <span className="font-mono">{meta.durationMs ?? 0}ms</span>
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}

function ResultSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4"><Skeleton className="w-16 h-16 rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-full" /></div>))}</div>
      </GlassCard>
      <GlassCard className="p-5 space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-20" /><Skeleton className="h-2 w-full" />{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</GlassCard>
    </motion.div>
  );
}

export default function StudioPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']} fallback={
      <div className="max-w-[1200px] mx-auto">
        <EmptyState icon={<Lock className="w-8 h-8" />} title="The Studio is for developers and admins"
          description="Your role can view usage and billing, but running enrichment consumes credits and API keys, which is limited to developer and admin roles." />
      </div>
    }>
      <Suspense fallback={<div className="max-w-[1200px] mx-auto"><ResultSkeleton /></div>}>
        <StudioInner />
      </Suspense>
    </RoleGuard>
  );
}
