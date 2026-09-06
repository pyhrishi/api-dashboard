'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Search, ArrowRight, Copy, Check, Lock, ShieldCheck, Clock, Trash2, RefreshCw,
  ExternalLink, Info, Zap, Layers, UserSearch, Building2, PhoneCall, Mail, Fingerprint, Landmark, Globe2, Network, Share2, Tags, BarChart3,
  Users, Code2, AtSign, Award, Newspaper, BadgeCheck, MailCheck, CircleCheck, CircleAlert, CircleX, CircleDot,
  Cpu, Server, Database, Gauge, Lightbulb, Wallet, Banknote,
  MapPin, Globe, Sun, Hash, GitCompareArrows, SpellCheck, MailQuestion, Flag, PencilLine, Languages, ArrowDown, Unplug,
  Crosshair, Flame, TrendingUp, TrendingDown, IdCard, BriefcaseBusiness, Store, LineChart,
} from 'lucide-react';
import Link from 'next/link';
import { useStore, type EnrichmentRecord } from '@/lib/store';
import {
  getEnrichmentPresets, getPresetById, detectInputKind, validateInput, toEnrichmentResult, freshnessAgeLabel, applyCorrections,
  type EnrichmentPreset, type EnrichmentResult, type SocialProfileView, type DeliverabilityView, type FieldFreshness, type DisposableView,
  type TechnographicView, type ResultTone, type FundingView, type OfficeGeographyView, type OfficeLocationView, type NewsFeedView, type CompanyEventView, type FuzzyMatchView, type DedupView, type NameCanonicalView, type CatchAllView, type PartialView,
} from '@/data/enrichments';
import type { CompletenessScore } from '@/lib/completeness-scorer';
import type { SourceAttribution, SourceCategory } from '@/lib/source-catalog';
import type { NormalizedText } from '@/lib/text-normalizer';
import type { BuyerIntentProfile, IntentTopic, IntentSignal, IntentTier, IntentTrend } from '@/lib/intent-resolver';
import type { CompanyTimeseries, AttributeSeries } from '@/lib/company-timeseries-resolver';
import { correctionEntityKey, acceptedCorrectionsFor } from '@/lib/corrections';
import { consoleApiUrl, authHeaderValue } from '@/lib/api-config';
import { sha256Hex } from '@/lib/sha256';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, StatusBadge, EmptyState, Skeleton, ConfirmAction, Modal, Field, Textarea, Sparkline } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

const ICONS: Record<string, React.ElementType> = { UserSearch, Building2, PhoneCall, Mail, Fingerprint, Landmark, Globe2, Network, Share2, Tags, BarChart3, MailCheck, ShieldCheck, BadgeCheck, Trash2, Sparkles, Cpu, Banknote, MapPin, Newspaper, Hash, GitCompareArrows, Layers, SpellCheck, MailQuestion, Languages, Crosshair, IdCard, BriefcaseBusiness, Store, LineChart };

type Phase = 'idle' | 'running' | 'ok' | 'not_found' | 'error';

function confidenceTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success'; if (c >= 0.7) return 'teal'; if (c >= 0.55) return 'warning'; return 'error';
}
function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High confidence'; if (c >= 0.7) return 'Good confidence'; if (c >= 0.55) return 'Moderate'; return 'Low confidence';
}
const FRESHNESS_STYLE: Record<FieldFreshness, { text: string; dot: string }> = {
  fresh: { text: 'text-semantic-success', dot: 'bg-semantic-success' },
  aging: { text: 'text-semantic-warning', dot: 'bg-semantic-warning' },
  stale: { text: 'text-fg-subtle', dot: 'bg-fg-subtle' },
};

function StudioInner() {
  const search = useSearchParams();
  const presets = useMemo(() => getEnrichmentPresets(), []);
  const initialPreset = getPresetById(search.get('preset') ?? '') ?? presets[0];

  const { environment, activeKeys, deductCredits, incrementKeyUsage, enrichments,
    addEnrichment, removeEnrichment, clearEnrichments, isFirstCallMade, markFirstCallMade,
    corrections, reportCorrection } = useStore();
  const toast = useToast();

  const [preset, setPreset] = useState<EnrichmentPreset>(initialPreset);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [resultCtx, setResultCtx] = useState<{ presetId: string; presetLabel: string; input: string; entityKey: string } | null>(null);
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

  // Overlay any accepted user-reported corrections (F-046) onto the shown result.
  const displayResult = useMemo(() => {
    if (!result || !resultCtx) return result;
    return applyCorrections(result, acceptedCorrectionsFor(corrections, resultCtx.entityKey));
  }, [result, resultCtx, corrections]);

  const handleReportCorrection = (field: string, oldValue: string, newValue: string, reason: string) => {
    if (!resultCtx) return;
    reportCorrection({
      presetId: resultCtx.presetId, presetLabel: resultCtx.presetLabel, input: resultCtx.input,
      field, oldValue, newValue, reason, environment,
    });
    track('correction_reported', { field, presetId: resultCtx.presetId, environment });
    toast.success('Correction submitted', 'It’s pending review in Corrections. Accepted corrections apply to future results.');
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
    // A transform preset hashes the input client-side, so only the digest — never
    // the plaintext — is put on the wire or into the request log.
    const sent = p.transform === 'sha256' ? sha256Hex(raw.trim().toLowerCase()) : raw;
    const url = consoleApiUrl(p.path, { [p.param]: sent });
    try {
      const res = await fetch(url, { method: p.endpoint.method, headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' } });
      const durationMs = Math.round(performance.now() - startedAt);
      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }
      const requestId = res.headers.get('x-request-id');

      useStore.getState().logApiRequest({
        id: requestId || `req_${Date.now().toString(36)}`, environment, timestamp: new Date().toISOString(),
        method: p.endpoint.method, path: p.path, status: res.status, duration: durationMs, ip: '::1',
        request: { headers: { Authorization: authHeaderValue(apiKey) }, parameters: { [p.param]: sent } }, response: body,
      });

      const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
      const vm = res.ok ? toEnrichmentResult(data) : null;
      // Attach partial-result metadata (F-071) when a degraded upstream withheld fields.
      const partialMeta = body && typeof body === 'object' && 'metadata' in body
        ? (body as { metadata?: { partial?: EnrichmentResult['partial'] } }).metadata?.partial
        : undefined;
      if (vm && partialMeta?.partial) vm.partial = partialMeta;

      if (res.ok && vm) {
        deductCredits(p.creditCost); incrementKeyUsage(key?.id ?? '', p.creditCost);
        setResult(vm); setResultCtx({ presetId: p.id, presetLabel: p.label, input: raw, entityKey: correctionEntityKey(p.id, raw) });
        setPhase('ok'); setMeta({ durationMs, status: res.status });
        addEnrichment({
          id: requestId || `enr_${Date.now().toString(36)}`, presetId: p.id, endpointId: p.endpointId, input: raw,
          result: vm, status: 'ok', environment, confidence: vm.confidence ?? 0, creditCost: p.creditCost, requestId, durationMs, timestamp: Date.now(),
        });
        track('enrichment_run', { preset: p.id, endpoint: p.endpointId, confidence: vm.confidence ?? null, environment, durationMs });
        if (vm.intent) track('intent_resolved', { domain: raw, score: vm.intent.score, tier: vm.intent.tier, in_market: vm.intent.in_market, environment });
        if (vm.timeseries) track('timeseries_resolved', { domain: raw, months: vm.timeseries.months, momentum: vm.timeseries.momentum, environment });
        if (vm.partial?.partial) track('partial_result_received', { preset: p.id, endpoint: p.endpointId, completeness: vm.partial.completeness, degraded: vm.partial.degraded_upstreams.join(','), environment });
        if (vm.deliverability) {
          track('email_deliverability_checked', { verdict: vm.deliverability.verdict, score: vm.deliverability.score, environment });
        }
        if (vm.technographic) {
          track('technographic_detected', { technologies: vm.technographic.total, categories: vm.technographic.categories.length, signals: vm.technographic.signals.length, sophistication: vm.technographic.sophistication, environment });
        }
        if (vm.officeGeo) {
          track('offices_resolved', { offices: vm.officeGeo.officeCount, countries: vm.officeGeo.countryCount, continents: vm.officeGeo.continentCount, followTheSun: vm.officeGeo.followTheSun, environment });
        }
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
        {phase === 'ok' && displayResult && <ResultCard key="result" result={displayResult} preset={preset} isLive={isLive} meta={meta} copied={copied} onCopy={copy} onReportCorrection={handleReportCorrection} />}
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

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  LinkedIn: Users,
  GitHub: Code2,
  X: AtSign,
  'Stack Overflow': Award,
  Medium: Newspaper,
  'Personal site': Globe2,
};

function SocialFootprint({ profiles, presetId }: { profiles: SocialProfileView[]; presetId: string }) {
  return (
    <div className="mt-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">
        Cross-platform footprint
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {profiles.map((p, i) => {
          const Icon = PLATFORM_ICON[p.platform] ?? Globe2;
          const card = (
            <div className="flex items-start gap-3 h-full">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${p.primary ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-glass border-border-subtle text-fg-muted'}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-fg truncate">{p.platform}</span>
                  {p.verified && <BadgeCheck className="w-3.5 h-3.5 text-teal shrink-0" aria-label="Verified account" />}
                  {p.url && <ExternalLink className="w-3 h-3 text-fg-subtle ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
                <div className="text-xs font-mono text-fg-muted truncate">{p.handle || '—'}</div>
                {p.headline && <div className="text-[11px] text-fg-subtle truncate mt-0.5">{p.headline}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {p.metric && (
                    <span className="text-[10px] font-bold text-fg-muted tabular-nums">
                      {p.metric.value} <span className="font-semibold text-fg-subtle">{p.metric.label}</span>
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="w-10 h-1 rounded-full bg-glass overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.round(p.confidence * 100)}%` }} />
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-fg-subtle">{Math.round(p.confidence * 100)}%</span>
                  </span>
                </div>
              </div>
            </div>
          );
          const baseCls = `group block rounded-xl border p-3 h-full transition-colors ${p.primary ? 'border-teal/30 bg-teal/5' : 'border-border-subtle bg-surface-2'}`;
          return p.url ? (
            <motion.a
              key={p.platform + i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('social_profile_opened', { preset: presetId, platform: p.platform, verified: p.verified })}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileHover={{ y: -2 }}
              className={`${baseCls} hover:border-teal/40`}
            >
              {card}
            </motion.a>
          ) : (
            <motion.div
              key={p.platform + i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className={baseCls}
            >
              {card}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const CHECK_ICON = { pass: CircleCheck, warn: CircleAlert, fail: CircleX, info: CircleDot } as const;
const CHECK_COLOR = {
  pass: 'text-semantic-success',
  warn: 'text-semantic-warning',
  fail: 'text-semantic-error',
  info: 'text-fg-subtle',
} as const;

function verdictTone(verdict: DeliverabilityView['verdict']): BadgeTone {
  if (verdict === 'deliverable') return 'success';
  if (verdict === 'risky') return 'warning';
  if (verdict === 'undeliverable') return 'error';
  return 'neutral';
}
function DeliverabilityPanel({ d }: { d: DeliverabilityView }) {
  const verdictLabel = d.verdict.charAt(0).toUpperCase() + d.verdict.slice(1);
  return (
    <div className="mt-5 space-y-5">
      {/* Score + verdict header */}
      <div className="flex items-center gap-5 rounded-xl border border-border bg-surface-2 p-5">
        <div className="relative shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
            <circle cx="44" cy="44" r="38" className="fill-none stroke-glass" strokeWidth="8" />
            <motion.circle
              cx="44" cy="44" r="38"
              className={`fill-none ${d.score >= 80 ? 'stroke-semantic-success' : d.score >= 45 ? 'stroke-semantic-warning' : 'stroke-semantic-error'}`}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 38}
              initial={{ strokeDashoffset: 2 * Math.PI * 38 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 38 * (1 - d.score / 100) }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-fg tabular-nums leading-none">{d.score}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-fg-subtle mt-0.5">/ 100</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Deliverability</span>
            <StatusBadge tone={verdictTone(d.verdict)}>{verdictLabel}</StatusBadge>
          </div>
          <p className="text-sm text-fg-muted mt-1">
            Inbox-reachability score for <span className="font-semibold text-fg">{d.domain || 'this address'}</span> via {d.provider}.
          </p>
          {d.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {d.flags.map((f) => <StatusBadge key={f.label} tone={f.tone}>{f.label}</StatusBadge>)}
            </div>
          )}
        </div>
      </div>

      {/* Did-you-mean nudge */}
      {d.didYouMean && (
        <div className="flex items-center gap-2 rounded-xl border border-teal/30 bg-teal/10 px-4 py-3">
          <Info className="w-4 h-4 text-teal shrink-0" />
          <span className="text-sm text-fg">Did you mean <span className="font-mono font-bold text-teal">{d.didYouMean}</span>?</span>
        </div>
      )}

      {/* Signal breakdown */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Signal breakdown</div>
        <ul className="space-y-px rounded-xl overflow-hidden border border-border">
          {d.checks.map((c, i) => {
            const Icon = CHECK_ICON[c.status];
            return (
              <motion.li
                key={c.key || i}
                initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}
                className="flex items-start gap-3 bg-surface-2 px-4 py-3"
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${CHECK_COLOR[c.status]}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold text-fg">{c.label}</span>
                  <p className="text-[13px] text-fg-muted leading-snug">{c.detail}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const COMPLETENESS_STYLE: Record<CompletenessScore['tier'], { bar: string; text: string; label: string }> = {
  complete: { bar: 'bg-semantic-success', text: 'text-semantic-success', label: 'Complete record' },
  partial: { bar: 'bg-semantic-warning', text: 'text-semantic-warning', label: 'Partial record' },
  sparse: { bar: 'bg-semantic-error', text: 'text-semantic-error', label: 'Sparse record' },
};

function CompletenessMeter({ c }: { c: CompletenessScore }) {
  const style = COMPLETENESS_STYLE[c.tier];
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Record completeness</span>
          <span className={`text-[11px] font-bold ${style.text}`}>{style.label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-black text-fg tabular-nums">{c.score}%</span>
          <span className="text-[11px] font-mono text-fg-subtle">{c.populated}/{c.total} fields</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-glass mt-2.5 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${c.score}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className={`h-full rounded-full ${style.bar}`} />
      </div>
      {c.missing.length > 0 && (
        <p className="text-[11px] text-fg-muted mt-2">
          Missing: <span className="font-semibold text-fg">{c.missing.join(', ')}</span>. Try another identifier to fill the gaps.
        </p>
      )}
    </div>
  );
}

const SOURCE_CATEGORY_STYLE: Record<SourceCategory, { tone: BadgeTone; label: string }> = {
  'first-party': { tone: 'teal', label: 'First-party' },
  registry: { tone: 'success', label: 'Registry' },
  partner: { tone: 'info', label: 'Partner' },
  derived: { tone: 'warning', label: 'Derived' },
};

function SourceAttributionPanel({ s }: { s: SourceAttribution }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Sources — who supplied each field</span>
        <div className="flex items-center gap-1.5">
          {s.byCategory.map((c) => (
            <StatusBadge key={c.category} tone={SOURCE_CATEGORY_STYLE[c.category].tone}>{SOURCE_CATEGORY_STYLE[c.category].label} {c.count}</StatusBadge>
          ))}
        </div>
      </div>
      <ul className="space-y-2">
        {s.providers.map((p, i) => (
          <motion.li key={p.provider.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
            className="rounded-xl border border-border-subtle bg-surface-2 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-fg">{p.provider.name}</span>
              <StatusBadge tone={SOURCE_CATEGORY_STYLE[p.provider.category].tone}>{SOURCE_CATEGORY_STYLE[p.provider.category].label}</StatusBadge>
              <span className="ml-auto text-[10px] font-mono tabular-nums text-fg-subtle">reliability {Math.round(p.provider.reliability * 100)}%</span>
            </div>
            <p className="text-[12px] text-fg-muted mt-0.5">{p.provider.description}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {p.fields.map((f) => (
                <span key={f.field} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-glass text-fg-muted border border-border-subtle capitalize">
                  {f.field.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-fg-subtle">
              <Lock className="w-3 h-3" /> {p.provider.license}
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const DISPOSABLE_STYLE: Record<DisposableView['verdict'], { icon: typeof Trash2; ring: string; text: string; badge: BadgeTone }> = {
  disposable: { icon: Trash2, ring: 'border-semantic-error/30 bg-semantic-error/10', text: 'text-semantic-error', badge: 'error' },
  suspected: { icon: CircleAlert, ring: 'border-semantic-warning/30 bg-semantic-warning/10', text: 'text-semantic-warning', badge: 'warning' },
  trusted: { icon: CircleCheck, ring: 'border-semantic-success/30 bg-semantic-success/10', text: 'text-semantic-success', badge: 'success' },
};

function DisposablePanel({ d }: { d: DisposableView }) {
  const style = DISPOSABLE_STYLE[d.verdict];
  const Icon = style.icon;
  const verdictLabel = d.verdict.charAt(0).toUpperCase() + d.verdict.slice(1);
  return (
    <div className="mt-5">
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${style.ring}`}>
        <div className={`w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 ${style.text}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Disposable check</span>
            <StatusBadge tone={style.badge}>{verdictLabel}</StatusBadge>
            <span className="text-[11px] font-semibold text-fg-muted capitalize">{d.category}</span>
          </div>
          <p className="text-sm text-fg mt-1.5">{d.reason}</p>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <span className="w-16 h-1.5 rounded-full bg-glass overflow-hidden inline-block" aria-hidden>
                <span className={`block h-full rounded-full ${style.text.replace('text-', 'bg-')}`} style={{ width: `${Math.round(d.confidence * 100)}%` }} />
              </span>
              <span className="font-mono tabular-nums">{Math.round(d.confidence * 100)}% confidence</span>
            </span>
            <span className="capitalize">Matched: {d.matchedOn}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatchAllPanel({ c }: { c: CatchAllView }) {
  const toneRing = c.tone === 'warning' ? 'border-semantic-warning/30' : c.tone === 'success' ? 'border-semantic-success/25' : 'border-border';
  const toneText = c.tone === 'warning' ? 'text-semantic-warning' : c.tone === 'success' ? 'text-semantic-success' : 'text-fg-subtle';
  const toneBadge: BadgeTone = c.tone === 'warning' ? 'warning' : c.tone === 'success' ? 'success' : 'neutral';
  const statusLabel = c.status === 'catch_all' ? 'Catch-all' : c.status === 'not_catch_all' ? 'Not catch-all' : 'Unknown';
  const evDot = (t: ResultTone) => t === 'success' ? 'bg-semantic-success' : t === 'error' ? 'bg-semantic-error' : t === 'warning' ? 'bg-semantic-warning' : 'bg-fg-subtle';
  return (
    <div className="mt-5 space-y-4">
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${toneRing}`}>
        <div className={`w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 ${toneText}`}><MailQuestion className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Catch-all detection</span>
            <StatusBadge tone={toneBadge}>{statusLabel}</StatusBadge>
            <span className="text-[11px] font-semibold text-fg-muted">{c.provider}</span>
          </div>
          <p className="text-sm text-fg mt-1.5 leading-snug">{c.guidance}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Evidence</div>
        <ul className="space-y-2">
          {c.evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${evDot(e.tone)}`} aria-hidden />
              <div className="min-w-0">
                <span className="text-sm font-semibold text-fg">{e.label}</span>
                <p className="text-[12px] text-fg-muted leading-snug">{e.value}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border-subtle text-[11px] font-mono text-fg-subtle break-all">
          RCPT TO {c.probeMailbox} → <span className={c.probeAccepted ? 'text-semantic-error' : 'text-semantic-success'}>{c.probeAccepted ? 'accepted (catch-all)' : 'rejected (per-mailbox verifiable)'}</span>
        </div>
      </div>
    </div>
  );
}

function NormalizePanel({ n }: { n: NormalizedText }) {
  const changed = n.flags.changed;
  const toneRing = changed ? 'border-teal/30' : 'border-semantic-success/25';
  const byteDelta = n.bytes.normalized - n.bytes.original;
  return (
    <div className="mt-5 space-y-4">
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${toneRing}`}>
        <div className={`w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 ${changed ? 'text-teal' : 'text-semantic-success'}`}><Languages className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Encoding &amp; language</span>
            <StatusBadge tone={n.primaryScript === 'Latin' || n.primaryScript === 'Common' ? 'info' : 'teal'}>{n.primaryScript}</StatusBadge>
            {n.languageHint && <span className="text-[11px] font-semibold text-fg-muted">{n.languageHint}</span>}
            {n.flags.mixedScript && <StatusBadge tone="warning">Mixed script</StatusBadge>}
          </div>
          <p className="text-sm text-fg mt-1.5 leading-snug">
            {changed ? 'Normalized to canonical UTF-8.' : 'Already clean, canonical UTF-8 — no changes needed.'}
          </p>
        </div>
      </div>

      {/* Before → after */}
      <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">Original</div>
          <div className="text-sm font-mono break-all text-fg-muted">{n.original || '—'}</div>
        </div>
        <div className="flex justify-center text-fg-subtle"><ArrowDown className="w-4 h-4" /></div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-teal mb-1">Canonical UTF-8</div>
          <div className="text-sm font-mono break-all text-fg font-semibold">{n.normalized || '—'}</div>
        </div>
        {n.ascii && n.ascii !== n.normalized && (
          <div className="pt-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">ASCII form</div>
            <div className="text-sm font-mono break-all text-fg-muted">{n.ascii}</div>
          </div>
        )}
        <div className="flex items-center gap-3 pt-2 border-t border-border-subtle text-[11px] text-fg-subtle">
          <span>{n.bytes.original} → {n.bytes.normalized} bytes{byteDelta !== 0 ? ` (${byteDelta > 0 ? '+' : ''}${byteDelta})` : ''}</span>
          <span>·</span>
          <span>Scripts: {n.scripts.length ? n.scripts.join(', ') : 'none'}</span>
        </div>
      </div>

      {/* What changed */}
      {n.transformations.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Transformations applied</div>
          <ul className="space-y-2">
            {n.transformations.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Check className="w-3.5 h-3.5 text-semantic-success mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-fg capitalize">{t.type.replace(/_/g, ' ')}</span>
                  <p className="text-[12px] text-fg-muted leading-snug">{t.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-semantic-success/25 bg-surface-2 p-4 flex items-center gap-2 text-sm text-fg-muted">
          <BadgeCheck className="w-4 h-4 text-semantic-success shrink-0" /> Input was already valid, composed UTF-8.
        </div>
      )}
    </div>
  );
}

const TECH_CATEGORY_ICON: Record<string, React.ElementType> = {
  'Cloud & Infrastructure': Server,
  'Languages & Frameworks': Code2,
  'Data & Analytics': Database,
  'Monitoring & Security': ShieldCheck,
  'Payments & Commerce': Wallet,
  'Marketing & CDP': Sparkles,
  'CRM & Sales': Users,
  'Vertical Software': Layers,
};
const SIGNAL_TONE: Record<ResultTone, { text: string; dot: string }> = {
  success: { text: 'text-semantic-success', dot: 'bg-semantic-success' },
  warning: { text: 'text-semantic-warning', dot: 'bg-semantic-warning' },
  error: { text: 'text-semantic-error', dot: 'bg-semantic-error' },
  teal: { text: 'text-teal', dot: 'bg-teal' },
  info: { text: 'text-teal', dot: 'bg-teal' },
  neutral: { text: 'text-fg-muted', dot: 'bg-fg-muted' },
};

function TechnographicPanel({ t }: { t: TechnographicView }) {
  return (
    <div className="mt-5 space-y-4">
      {/* Sophistication + spend */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Stack sophistication</span>
          <span className="text-xs font-mono tabular-nums font-bold text-fg flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-fg-subtle" /> {t.spendBand}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-2 flex-1 rounded-full bg-glass overflow-hidden">
            <motion.span initial={{ width: 0 }} animate={{ width: `${t.sophistication}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="block h-full rounded-full bg-gradient-to-r from-teal/60 to-teal" />
          </span>
          <span className="text-xs font-mono tabular-nums font-bold text-teal shrink-0">{t.sophistication}/100</span>
        </div>
      </div>

      {/* Category-grouped stack */}
      <div className="space-y-3">
        {t.categories.map((cat) => {
          const Icon = TECH_CATEGORY_ICON[cat.category] ?? Cpu;
          return (
            <div key={cat.category} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-glass border border-border-subtle flex items-center justify-center text-teal shrink-0"><Icon className="w-4 h-4" /></span>
                <span className="text-sm font-bold text-fg">{cat.category}</span>
                <span className="text-[11px] font-semibold text-fg-subtle tabular-nums">{cat.count}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((tech) => (
                  <span
                    key={tech.name}
                    title={`${tech.vendor} · detected via ${tech.method} · ${Math.round(tech.confidence * 100)}% confidence · first seen ${tech.firstDetected}`}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md border ${tech.premium ? 'bg-teal/10 text-teal border-teal/30' : 'bg-glass text-fg-muted border-border-subtle'}`}
                  >
                    {tech.premium && <Sparkles className="w-3 h-3 shrink-0" aria-label="Premium platform" />}
                    {tech.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Derived GTM signals */}
      {t.signals.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Buying &amp; intent signals</div>
          <div className="space-y-3">
            {t.signals.map((s) => {
              const tone = SIGNAL_TONE[s.tone] ?? SIGNAL_TONE.neutral;
              return (
                <div key={s.label} className="flex items-start gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${tone.dot}`} aria-hidden />
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${tone.text}`}>{s.label}</div>
                    <p className="text-[12px] text-fg-muted leading-snug mt-0.5">{s.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ROUND_TONE: Record<string, string> = {
  Seed: 'bg-fg-subtle', 'Series A': 'bg-teal', 'Series B': 'bg-teal', 'Series C': 'bg-semantic-success',
  'Series D': 'bg-semantic-success', 'Series E': 'bg-semantic-success',
};

function FundingPanel({ f }: { f: FundingView }) {
  if (!f.hasFunding) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-surface-2 p-5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-glass border border-border-subtle flex items-center justify-center shrink-0 text-fg-subtle"><Banknote className="w-4 h-4" /></div>
        <div>
          <div className="text-sm font-bold text-fg">No venture funding on record</div>
          <p className="text-[13px] text-fg-muted mt-0.5">{f.noFundingReason || 'This company has no disclosed institutional funding rounds.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-5">
      {/* Headline */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {[
          { label: 'Total raised', value: f.totalRaised },
          { label: 'Stage', value: f.stage },
          { label: 'Latest valuation', value: f.latestValuation ?? '—' },
        ].map((s) => (
          <div key={s.label} className="bg-surface-2 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">{s.label}</div>
            <div className="text-lg font-black text-fg tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Round timeline */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Round history</div>
        <ol className="relative border-l border-border-subtle ml-2 space-y-4">
          {f.rounds.map((r, i) => (
            <motion.li key={r.stage + r.date} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="ml-4">
              <span className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full ${ROUND_TONE[r.stage] ?? 'bg-teal'}`} aria-hidden />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-fg">{r.stage}</span>
                  <span className="text-[11px] text-fg-subtle">{r.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-fg tabular-nums">{r.amount}</span>
                  {r.valuation && <span className="text-[11px] text-fg-subtle">at {r.valuation} post</span>}
                </div>
              </div>
              <div className="text-[12px] text-fg-muted mt-0.5">
                Led by <span className="font-semibold text-fg">{r.lead}</span>
                {r.investors.length > 1 && <span className="text-fg-subtle"> · with {r.investors.filter((x) => x !== r.lead).join(', ')}</span>}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>

      {/* Investor roster */}
      {f.investors.length > 0 && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Investors ({f.investors.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {f.investors.map((inv) => (
              <span key={inv} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle">{inv}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Office local wall-clock time from a UTC offset (live, derived — not random). */
function officeLocalTime(nowMs: number, offsetMin: number): { label: string; open: boolean } {
  const d = new Date(nowMs);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const local = (((utcMin + offsetMin) % 1440) + 1440) % 1440;
  const hh = Math.floor(local / 60);
  const mm = local % 60;
  return { label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, open: local >= 9 * 60 && local < 17 * 60 };
}

function OfficeGeoPanel({ g }: { g: OfficeGeographyView }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const summary: { label: string; value: string; icon: React.ElementType }[] = [
    { label: 'Offices', value: String(g.officeCount), icon: Building2 },
    { label: 'Countries', value: String(g.countryCount), icon: Globe },
    { label: 'Continents', value: String(g.continentCount), icon: MapPin },
    { label: 'HQ window', value: g.outreachWindowUtc, icon: Clock },
  ];

  return (
    <div className="mt-5 space-y-4">
      {/* Reach summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {summary.map((s) => (
          <div key={s.label} className="bg-surface-2 p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1 flex items-center gap-1"><s.icon className="w-3 h-3" />{s.label}</div>
            <div className="text-sm font-black text-fg tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {g.followTheSun && (
        <div className="flex items-center gap-2 text-[12px] font-semibold text-teal"><Sun className="w-3.5 h-3.5 shrink-0" /> Follow-the-sun coverage across {g.continentCount} continents</div>
      )}

      {/* Office list with live local clocks */}
      <div className="space-y-2.5">
        {g.offices.map((o: OfficeLocationView, i: number) => {
          const t = officeLocalTime(now, o.utcOffsetMinutes);
          return (
            <motion.div
              key={o.city + i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className={`rounded-xl border p-4 flex items-start gap-3 ${o.isHq ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface-2'}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${o.isHq ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-glass border-border-subtle text-fg-subtle'}`}>
                {o.isHq ? <MapPin className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-fg">{o.city}, {o.countryCode}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">{o.label}</span>
                  {o.isHq && <StatusBadge tone="teal">HQ</StatusBadge>}
                </div>
                <div className="text-[12px] text-fg-muted mt-0.5 truncate">{o.address}</div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-fg-subtle flex-wrap">
                  <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{o.headcount.toLocaleString()}</span>
                  <span className="font-mono tabular-nums">{o.lat.toFixed(2)}, {o.lng.toFixed(2)}</span>
                  <span className={`inline-flex items-center gap-1 font-semibold ${t.open ? 'text-semantic-success' : 'text-fg-subtle'}`}>
                    <Clock className="w-3 h-3" />{t.label} local · {t.open ? 'open' : 'closed'}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  funding: Banknote, leadership: Users, expansion: MapPin, product: Sparkles,
  acquisition: Building2, partnership: Share2, award: Award, hiring: Gauge,
};
const SENTIMENT_DOT: Record<CompanyEventView['sentiment'], string> = {
  positive: 'bg-semantic-success', neutral: 'bg-fg-subtle', negative: 'bg-semantic-error',
};

const INTENT_TIER_STYLE: Record<IntentTier, { tone: BadgeTone; ring: string; text: string; label: string }> = {
  hot: { tone: 'error', ring: 'border-semantic-error/30', text: 'text-semantic-error', label: 'Hot' },
  warm: { tone: 'warning', ring: 'border-semantic-warning/30', text: 'text-semantic-warning', label: 'Warm' },
  cool: { tone: 'info', ring: 'border-border', text: 'text-fg-muted', label: 'Cool' },
  cold: { tone: 'neutral', ring: 'border-border', text: 'text-fg-subtle', label: 'Cold' },
};
const INTENT_TREND_META: Record<IntentTrend, { icon: React.ElementType; text: string }> = {
  surging: { icon: Flame, text: 'text-semantic-error' },
  rising: { icon: TrendingUp, text: 'text-semantic-success' },
  steady: { icon: ArrowRight, text: 'text-fg-subtle' },
  cooling: { icon: TrendingDown, text: 'text-fg-subtle' },
};
const INTENT_SIGNAL_ICON: Record<IntentSignal['category'], React.ElementType> = {
  funding: Banknote, hiring: Users, technographic: Cpu, news: Newspaper, engagement: BarChart3,
};

const TS_TREND_TONE: Record<AttributeSeries['trend'], BadgeTone> = {
  accelerating: 'success', growing: 'teal', flat: 'neutral', declining: 'error',
};
function fmtTsValue(v: number, unit: string): string {
  if (unit === 'USD') {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }
  return v.toLocaleString();
}
function TimeseriesPanel({ t }: { t: CompanyTimeseries }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-border bg-surface-2 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-teal shrink-0"><LineChart className="w-5 h-5" /></span>
        <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Growth history</span>
        <StatusBadge tone={TS_TREND_TONE[t.momentum]}>{t.momentum}</StatusBadge>
        <span className="text-[11px] text-fg-muted">{t.from_month} → {t.to_month} · {t.months} months</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {t.attributes.map((a) => {
          const up = a.growth_12mo_pct >= 0;
          return (
            <div key={a.attribute} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">{a.label}</div>
                  <div className="text-lg font-black text-fg tabular-nums mt-0.5">{fmtTsValue(a.current, a.unit)}</div>
                </div>
                <div className="text-teal shrink-0"><Sparkline values={a.points.map((p) => p.value)} width={88} height={30} /></div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${up ? 'text-semantic-success' : 'text-semantic-error'}`}>
                  {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {up ? '+' : ''}{a.growth_12mo_pct}% <span className="text-fg-subtle font-normal">12mo</span>
                </span>
                <span className="text-[11px] text-fg-subtle">·  {a.avg_mom_pct > 0 ? '+' : ''}{a.avg_mom_pct}%/mo avg</span>
                <StatusBadge tone={TS_TREND_TONE[a.trend]}>{a.trend}</StatusBadge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntentPanel({ i }: { i: BuyerIntentProfile }) {
  const tier = INTENT_TIER_STYLE[i.tier];
  const TrendIcon = INTENT_TREND_META[i.trend].icon;
  return (
    <div className="mt-5 space-y-4">
      {/* Score header */}
      <div className={`rounded-xl border p-5 ${tier.ring}`}>
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 rounded-2xl bg-surface-2 border border-border flex flex-col items-center justify-center shrink-0 ${tier.text}`}>
            <span className="text-2xl font-black tabular-nums leading-none">{i.score}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle mt-0.5">/ 100</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Buyer intent</span>
              <StatusBadge tone={tier.tone}>{tier.label}</StatusBadge>
              <StatusBadge tone={i.in_market ? 'success' : 'neutral'}>{i.in_market ? 'In-market' : 'Not in-market'}</StatusBadge>
              <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${INTENT_TREND_META[i.trend].text}`}><TrendIcon className="w-3.5 h-3.5" /> {i.trend}</span>
            </div>
            <p className="text-sm text-fg mt-1.5 leading-snug">{i.recommended_action}</p>
          </div>
        </div>
      </div>

      {/* Topic surges */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Topics being researched</div>
        <ul className="space-y-2.5">
          {i.topics.map((t: IntentTopic) => {
            const tm = INTENT_TREND_META[t.trend];
            const TI = tm.icon;
            return (
              <li key={t.topic}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-fg truncate">{t.topic}</span>
                  <span className={`text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${tm.text}`}>
                    <TI className="w-3 h-3" /> {t.delta > 0 ? `+${t.delta}` : t.delta}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-glass overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${t.score}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className="h-full rounded-full bg-teal" />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Contributing signals */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Contributing signals</div>
        <ul className="space-y-2.5">
          {i.signals.map((s: IntentSignal, idx: number) => {
            const SI = INTENT_SIGNAL_ICON[s.category];
            return (
              <li key={s.category + idx} className="flex items-start gap-2.5">
                <span className="text-teal mt-0.5 shrink-0"><SI className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{s.label}</span>
                    <span className="text-[10px] font-mono tabular-nums text-fg-subtle shrink-0">{Math.round(s.weight * 100)}%</span>
                  </div>
                  <p className="text-[12px] text-fg-muted leading-snug">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NewsFeedPanel({ n }: { n: NewsFeedView }) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const shown = typeFilter ? n.events.filter((e) => e.type === typeFilter) : n.events;
  return (
    <div className="mt-5">
      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          onClick={() => setTypeFilter(null)}
          className={`text-[11px] font-bold px-2 py-1 rounded-md border transition-colors ${typeFilter === null ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-glass border-border-subtle text-fg-muted hover:text-fg'}`}
        >All {n.eventCount}</button>
        {n.byType.map((bt) => (
          <button
            key={bt.type}
            onClick={() => setTypeFilter(typeFilter === bt.type ? null : bt.type)}
            className={`text-[11px] font-bold px-2 py-1 rounded-md border capitalize transition-colors ${typeFilter === bt.type ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-glass border-border-subtle text-fg-muted hover:text-fg'}`}
          >{bt.type} {bt.count}</button>
        ))}
      </div>

      {/* Event timeline */}
      <ol className="relative border-l border-border-subtle ml-2">
        {shown.map((e, i) => {
          const Icon = EVENT_ICON[e.type] ?? Sparkles;
          return (
            <motion.li key={e.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }} className="ml-5 pb-4 last:pb-0">
              <span className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full ${SENTIMENT_DOT[e.sentiment]}`} aria-hidden />
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-center shrink-0 text-fg-muted">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-fg">{e.headline}</span>
                    <span className="text-[11px] text-fg-subtle whitespace-nowrap">{e.date}</span>
                  </div>
                  <p className="text-[12px] text-fg-muted leading-snug mt-0.5">{e.summary}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-fg-subtle">
                    <span className="capitalize font-semibold">{e.type}</span>
                    <span>·</span>
                    <span>{e.source}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <span className="w-8 h-1 rounded-full bg-glass overflow-hidden inline-block" aria-hidden>
                        <span className="block h-full rounded-full bg-teal" style={{ width: `${e.importance}%` }} />
                      </span>
                      <span className="font-mono tabular-nums">{e.importance}</span>
                    </span>
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function fuzzyVerdictTone(v: FuzzyMatchView['verdict']): BadgeTone {
  if (v === 'strong') return 'success';
  if (v === 'likely') return 'teal';
  if (v === 'weak') return 'warning';
  return 'error';
}

function FuzzyMatchPanel({ f }: { f: FuzzyMatchView }) {
  const verdictLabel = f.verdict === 'no_match' ? 'No match' : f.verdict.charAt(0).toUpperCase() + f.verdict.slice(1);
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-border bg-surface-2 p-4 flex items-center gap-3 flex-wrap">
        <StatusBadge tone={fuzzyVerdictTone(f.verdict)}>{verdictLabel}</StatusBadge>
        <span className="text-sm text-fg-muted">
          Interpreted as <span className="font-bold text-fg">{f.interpreted.name}</span>
          {f.interpreted.company && <> at <span className="font-bold text-fg">{f.interpreted.company}</span></>}
        </span>
      </div>

      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Ranked candidates</div>
        <ul className="space-y-2">
          {f.candidates.map((c, i) => (
            <motion.li
              key={c.email + i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className={`rounded-xl border p-3 ${c.best ? 'border-teal/30 bg-teal/5' : 'border-border-subtle bg-surface-2'}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-fg">{c.fullName}</span>
                {c.best && <StatusBadge tone="teal">Best match</StatusBadge>}
                <span className="ml-auto text-sm font-black text-fg tabular-nums">{Math.round(c.matchProbability * 100)}%</span>
              </div>
              <div className="text-[12px] text-fg-muted mt-0.5">{c.title} · {c.company} · <span className="font-mono">{c.email}</span></div>
              <div className="h-1.5 rounded-full bg-glass mt-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${c.matchProbability * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full ${c.matchProbability >= 0.9 ? 'bg-semantic-success' : c.matchProbability >= 0.75 ? 'bg-teal' : c.matchProbability >= 0.55 ? 'bg-semantic-warning' : 'bg-semantic-error'}`}
                />
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-[10px] text-fg-subtle">
                <span>name {Math.round(c.nameSimilarity * 100)}%</span>
                <span>company {Math.round(c.companySimilarity * 100)}%</span>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DedupPanel({ d }: { d: DedupView }) {
  const summary: { label: string; value: string }[] = [
    { label: 'Input', value: String(d.inputCount) },
    { label: 'Golden', value: String(d.uniqueCount) },
    { label: 'Duplicates', value: String(d.duplicateCount) },
    { label: 'Dedup rate', value: `${Math.round(d.dedupRate * 100)}%` },
  ];
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {summary.map((s) => (
          <div key={s.label} className="bg-surface-2 p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">{s.label}</div>
            <div className="text-sm font-black text-fg tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {d.clusters.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
            className={`rounded-xl border p-4 ${c.size > 1 ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface-2'}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-4 h-4 text-teal shrink-0" />
              <span className="text-sm font-bold text-fg">{c.golden.name}</span>
              {c.golden.company && c.golden.company !== '—' && <span className="text-[12px] text-fg-muted">· {c.golden.company}</span>}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] font-semibold text-fg-subtle">{c.size} record{c.size === 1 ? '' : 's'}</span>
                {c.size > 1 && <StatusBadge tone={c.confidence >= 0.9 ? 'success' : c.confidence >= 0.78 ? 'teal' : 'warning'}>{Math.round(c.confidence * 100)}% conf</StatusBadge>}
              </span>
            </div>
            {c.size > 1 && (
              <ul className="mt-3 space-y-1.5">
                {c.members.map((m, j) => (
                  <li key={j} className="flex items-center gap-2 text-[12px]">
                    {m.isGolden
                      ? <StatusBadge tone="teal">golden</StatusBadge>
                      : <span className="w-12 text-right font-mono tabular-nums text-fg-subtle shrink-0">{Math.round(m.similarity * 100)}%</span>}
                    <span className={m.isGolden ? 'font-bold text-fg' : 'text-fg-muted'}>{m.name}</span>
                    {m.company && m.company !== '—' && <span className="text-fg-subtle truncate">· {m.company}</span>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function NameCanonicalPanel({ n }: { n: NameCanonicalView }) {
  const comps: { label: string; value: string | null }[] = [
    { label: 'Prefix', value: n.components.prefix },
    { label: 'First', value: n.components.first },
    { label: 'Middle', value: n.components.middle },
    { label: 'Last', value: n.components.last || null },
    { label: 'Suffix', value: n.components.suffix },
  ];
  return (
    <div className="mt-5 space-y-4">
      {/* Canonical forms */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {[
          { label: 'Canonical', value: n.canonical },
          { label: 'ASCII', value: n.ascii },
          { label: 'Formal', value: n.formal },
        ].map((f) => (
          <div key={f.label} className="bg-surface-2 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">{f.label}</div>
            <div className="text-sm font-bold text-fg break-words">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Parsed components */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Parsed components</div>
        <div className="flex flex-wrap gap-1.5">
          {comps.map((c) => (
            <span key={c.label} className={`text-[11px] px-2 py-1 rounded-md border ${c.value ? 'bg-glass border-border-subtle text-fg' : 'bg-surface-2 border-border-subtle text-fg-subtle'}`}>
              <span className="font-black uppercase tracking-wider text-fg-subtle">{c.label}</span> {c.value ?? '—'}
            </span>
          ))}
        </div>
      </div>

      {/* Change log */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">What changed</div>
        <ul className="space-y-1.5">
          {n.changes.map((ch, i) => (
            <motion.li key={ch + i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }} className="flex items-start gap-2 text-[13px] text-fg-muted">
              <CircleCheck className="w-3.5 h-3.5 text-teal mt-0.5 shrink-0" />
              {ch}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PartialBanner({ p }: { p: PartialView }) {
  return (
    <div className="mt-5 rounded-xl border border-semantic-warning/30 bg-semantic-warning/5 p-4">
      <div className="flex items-start gap-3">
        <span className="text-semantic-warning shrink-0 mt-0.5"><Unplug className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-fg">Partial result</span>
            <StatusBadge tone="warning">{Math.round(p.completeness * 100)}% complete</StatusBadge>
          </div>
          <p className="text-[12px] text-fg-muted mt-1 leading-snug">
            A data source was degraded, so some fields were withheld. What resolved is shown below — you were billed only for what was returned.
          </p>
          <ul className="mt-3 space-y-1.5">
            {p.missing.map((m) => (
              <li key={m.upstream} className="flex items-start gap-2 text-[12px]">
                <CircleAlert className="w-3.5 h-3.5 text-semantic-warning mt-0.5 shrink-0" />
                <span className="text-fg"><span className="font-semibold">{m.label}</span> — unavailable <span className="text-fg-subtle">({m.upstreamName} degraded)</span></span>
              </li>
            ))}
          </ul>
          <Link href="/console/circuits" className="text-[11px] font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1 mt-2">
            View upstream health <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, preset, isLive, meta, copied, onCopy, onReportCorrection }: {
  result: EnrichmentResult; preset: EnrichmentPreset; isLive: boolean;
  meta: { durationMs?: number }; copied: string | null; onCopy: (t: string, id: string) => void;
  onReportCorrection?: (field: string, oldValue: string, newValue: string, reason: string) => void;
}) {
  const maskVal = (v: string) => (isLive ? v.replace(/[^@.\s+()-]/g, '•') : v);
  const curl = `curl "${consoleApiUrl(preset.path, { [preset.param]: '<VALUE>' })}" \\\n  -H "Authorization: Bearer <YOUR_KEY>"`;
  const [correcting, setCorrecting] = useState<{ field: string; oldValue: string } | null>(null);

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

        {result.partial && result.partial.partial && (
          <PartialBanner p={result.partial} />
        )}

        {result.fields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border mt-5">
            {result.fields.map((f, i) => {
              const canReport = !!onReportCorrection && !(f.masked && isLive);
              return (
              <motion.div key={f.label + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="group relative bg-surface-2 p-3.5">
                <div className="flex items-center justify-between gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{f.label}</span>
                    {f.verified && !f.corrected && <ShieldCheck className="w-3 h-3 text-semantic-success shrink-0" aria-label="Verified" />}
                    {f.masked && isLive && <Lock className="w-3 h-3 text-fg-subtle shrink-0" aria-label="Masked in live" />}
                    {f.corrected && <PencilLine className="w-3 h-3 text-teal shrink-0" aria-label="Corrected" />}
                  </span>
                  {f.corrected ? (
                    <span title={f.correctionNote} className="flex items-center gap-1 shrink-0 normal-case tracking-normal font-semibold text-teal">corrected</span>
                  ) : f.freshness && f.verifiedAt ? (
                    <span title={`Last verified ${f.verifiedAt}`} className={`flex items-center gap-1 shrink-0 normal-case tracking-normal font-semibold ${FRESHNESS_STYLE[f.freshness].text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${FRESHNESS_STYLE[f.freshness].dot}`} aria-hidden />
                      {freshnessAgeLabel(f.verifiedAt)}
                    </span>
                  ) : null}
                </div>
                <div className={`text-sm font-semibold text-fg ${f.mono ? 'font-mono break-all' : ''}`}>{f.masked ? maskVal(f.value) : f.value}</div>
                {f.corrected && f.correctionNote && <div className="text-[11px] text-fg-subtle mt-1 normal-case tracking-normal font-normal">{f.correctionNote}</div>}
                {canReport && (
                  <button
                    onClick={() => setCorrecting({ field: f.label, oldValue: f.value })}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-fg-subtle hover:text-teal p-1 rounded-md hover:bg-glass"
                    aria-label={`Report a correction for ${f.label}`} title="Flag a wrong value"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                )}
              </motion.div>
              );
            })}
          </div>
        )}

        {result.completeness && (
          <CompletenessMeter c={result.completeness} />
        )}

        {result.sources && result.sources.providers.length > 0 && (
          <SourceAttributionPanel s={result.sources} />
        )}

        {result.social && result.social.profiles.length > 0 && (
          <SocialFootprint profiles={result.social.profiles} presetId={preset.id} />
        )}

        {result.deliverability && (
          <DeliverabilityPanel d={result.deliverability} />
        )}

        {result.disposable && (
          <DisposablePanel d={result.disposable} />
        )}

        {result.catchAll && (
          <CatchAllPanel c={result.catchAll} />
        )}

        {result.normalize && (
          <NormalizePanel n={result.normalize} />
        )}

        {result.technographic && (
          <TechnographicPanel t={result.technographic} />
        )}

        {result.funding && (
          <FundingPanel f={result.funding} />
        )}

        {result.officeGeo && (
          <OfficeGeoPanel g={result.officeGeo} />
        )}

        {result.news && (
          <NewsFeedPanel n={result.news} />
        )}

        {result.intent && (
          <IntentPanel i={result.intent} />
        )}

        {result.timeseries && (
          <TimeseriesPanel t={result.timeseries} />
        )}

        {result.fuzzy && (
          <FuzzyMatchPanel f={result.fuzzy} />
        )}

        {result.nameCanonical && (
          <NameCanonicalPanel n={result.nameCanonical} />
        )}

        {result.dedupe && (
          <DedupPanel d={result.dedupe} />
        )}

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

      <CorrectionModal
        open={!!correcting}
        field={correcting?.field ?? ''}
        oldValue={correcting?.oldValue ?? ''}
        onClose={() => setCorrecting(null)}
        onSubmit={(newValue, reason) => {
          if (correcting) onReportCorrection?.(correcting.field, correcting.oldValue, newValue, reason);
          setCorrecting(null);
        }}
      />
    </motion.div>
  );
}

function CorrectionModal({ open, field, oldValue, onClose, onSubmit }: {
  open: boolean; field: string; oldValue: string; onClose: () => void;
  onSubmit: (newValue: string, reason: string) => void;
}) {
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setNewValue(''); setReason(''); } }, [open, field]);
  const changed = newValue.trim().length > 0 && newValue.trim() !== oldValue.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a correction"
      description={`Flag the value of "${field}" and tell us what it should be. Corrections are reviewed before they apply.`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!changed} onClick={() => onSubmit(newValue.trim(), reason.trim())}>
            <Flag className="w-4 h-4" /> Submit correction
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Current value">
          <div className="text-sm font-semibold text-fg-muted bg-surface-2 border border-border rounded-lg px-3 py-2 line-through break-all">{oldValue || '—'}</div>
        </Field>
        <Field label="Correct value" required htmlFor="correction-new-value" hint={newValue.trim() && !changed ? 'That matches the current value.' : undefined}>
          <Input id="correction-new-value" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="What it should be" autoFocus />
        </Field>
        <Field label="Why (optional but speeds up review)" htmlFor="correction-reason">
          <Textarea id="correction-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Promoted to CEO in July 2026 — confirmed on the company blog." />
        </Field>
      </div>
    </Modal>
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
