'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler, ShieldCheck, AlertTriangle, RefreshCw, Send, FlaskConical, ArrowRight, Sparkles, Check, X,
  Layers, Braces, FileJson, Gauge, Rocket, ListFilter, Timer, ChevronDown, KeyRound,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, ConfirmAction, DataTable,
  type Column,
} from '@/components/ui';
import { tierForKey, type ThroughputTier } from '@/lib/throughput-tiers';
import { orgHandleForKey } from '@/lib/encryption';
import {
  usePayloadLimits, overridesForOrg, resolveLimits, measurePayload, evaluatePayload, utilisation, formatMeasure, formatBytes,
  chunkPlan, tierThatFits, DIMENSIONS, DIMENSION_BY_KEY, TIER_PAYLOAD_LIMITS, SAMPLE_PAYLOADS, ENDPOINT_PROFILES,
  type PayloadLimits, type PayloadDimension, type PayloadVerdict, type PayloadMeasure, type PayloadOverrides,
} from '@/lib/payload-limits';

/** Shape of `GET /v1/limits/payload` (mirrors the gateway snapshot). */
interface RejectionRow {
  id: string; at: number; method: string; path: string; dimension: PayloadDimension;
  measured: number; limit: number; code: string; status: number;
}
interface LimitsSnapshot {
  tier: ThroughputTier; limits: PayloadLimits; ceiling: PayloadLimits; overrides: PayloadOverrides;
  rejections: RejectionRow[]; stats: { total: number; last24h: number; byDimension: Record<PayloadDimension, number> };
}
interface DryRunBody { data?: { verdict?: PayloadVerdict; wouldReturn?: { status: number; code: string | null } }; error?: { code?: string; message?: string } }

type ProbeState =
  | { mode: 'dry' | 'real'; status: 'ok'; httpStatus: number; code: string | null; message: string; limitBytes: string; limitDepth: string }
  | { mode: 'dry' | 'real'; status: 'error'; message: string };

const MAX_ANALYZER_CHARS = 2_000_000; // characters — the analyzer is a teaching tool, not a proxy
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

const DIM_ICON: Record<PayloadDimension, React.ReactNode> = {
  bytes: <FileJson className="w-4 h-4" />,
  depth: <Layers className="w-4 h-4" />,
  arrayLength: <ListFilter className="w-4 h-4" />,
  keys: <Braces className="w-4 h-4" />,
  stringLength: <Ruler className="w-4 h-4" />,
  urlLength: <Gauge className="w-4 h-4" />,
};

function meterTone(u: number): string {
  return u > 1 ? 'bg-semantic-error' : u >= 0.8 ? 'bg-semantic-warning' : 'bg-teal';
}
function relTime(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function PayloadLimitsInner() {
  const { activeKeys, environment, user } = useStore();
  const byOrg = usePayloadLimits((s) => s.byOrg);
  const adopt = usePayloadLimits((s) => s.adopt);
  const setLimit = usePayloadLimits((s) => s.setLimit);
  const reset = usePayloadLimits((s) => s.reset);
  const toast = useToast();
  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );
  const noKeys = !apiKey;
  const orgId = useMemo(() => orgHandleForKey(apiKey || undefined), [apiKey]);
  const overrides = useMemo(() => overridesForOrg({ byOrg }, orgId), [byOrg, orgId]);
  const tier = useMemo(() => tierForKey(apiKey), [apiKey]);
  const ceiling = TIER_PAYLOAD_LIMITS[tier];
  const limits = useMemo(() => resolveLimits(tier, overrides), [tier, overrides]);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<LimitsSnapshot | null>(null);
  const [ledger, setLedger] = useState<'loading' | 'ready' | 'error'>('loading');
  const [payload, setPayload] = useState('');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeState | null>(null);
  const [probing, setProbing] = useState<'dry' | 'real' | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    track('payload_limits_viewed', { environment, tier });
    const t = setTimeout(() => setPhase('ready'), 260);
    return () => clearTimeout(t);
  }, [environment, tier]);

  // Ledger + gateway-side limits.
  const loadSnapshot = useCallback(async () => {
    if (!apiKey) { setLedger('ready'); return; }
    setLedger('loading');
    try {
      const res = await fetch('/api/v1/limits/payload', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      const data = body.data as LimitsSnapshot;
      setSnapshot(data);
      // The gateway is the writer of record — adopt its overrides into the cache.
      adopt(orgId, data.overrides ?? {});
      setNow(Date.now());
      setLedger('ready');
    } catch {
      setLedger('error');
    }
  }, [apiKey, orgId, adopt]);

  // Initial load (and on env/key switch): read the gateway's truth.
  useEffect(() => { loadSnapshot(); }, [loadSnapshot]);

  // Mirror one console edit to the gateway, then re-read so the cache == the server.
  const patchGateway = useCallback(async (patch: Record<string, number | null>) => {
    if (!apiKey) return;
    try {
      await fetch('/api/v1/limits/payload', {
        method: 'PATCH',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { /* the reload below reports the truth either way */ }
    loadSnapshot();
  }, [apiKey, loadSnapshot]);

  // ── Analyzer (client-side; the exact SSOT the edge runs) ──────────────────
  const deferredPayload = useDeferredValue(payload);
  const measure: PayloadMeasure | null = useMemo(() => (deferredPayload.trim() ? measurePayload(deferredPayload, '/v1/batch/enrich') : null), [deferredPayload]);
  const verdict: PayloadVerdict | null = useMemo(() => (measure ? evaluatePayload(measure, limits, tier) : null), [measure, limits, tier]);

  const analyzedRef = useRef<string>('');
  useEffect(() => {
    if (!verdict || !measure) return;
    const sig = `${measure.bytes}:${verdict.violations.map((v) => v.code).join(',')}`;
    if (sig === analyzedRef.current) return;
    const t = setTimeout(() => {
      analyzedRef.current = sig;
      track('payload_analyzed', { ok: verdict.ok, violations: verdict.violations.length, primary: verdict.primary?.code ?? null, bytes: measure.bytes, source: presetId ?? 'custom' });
    }, 600);
    return () => clearTimeout(t);
  }, [verdict, measure, presetId]);

  const pickPreset = (id: string) => {
    const s = SAMPLE_PAYLOADS.find((p) => p.id === id);
    if (!s) return;
    setPayload(s.build());
    setPresetId(id);
    setProbe(null);
    setCapped(false);
    setNudgeDismissed(false);
  };

  const onType = (v: string) => {
    if (v.length > MAX_ANALYZER_CHARS) { setPayload(v.slice(0, MAX_ANALYZER_CHARS)); setCapped(true); }
    else { setPayload(v); setCapped(false); }
    setPresetId(null);
    setProbe(null);
  };

  const upgrade = useMemo(() => {
    if (!verdict?.primary) return null;
    const p = verdict.primary;
    if (p.measured <= ceiling[DIMENSION_BY_KEY[p.dimension].limitKey]) return null; // an override, not the plan, is the blocker
    const next = tierThatFits(tier, p.dimension, p.measured);
    return next ? { tier: next, dimension: p.dimension, limit: TIER_PAYLOAD_LIMITS[next][DIMENSION_BY_KEY[p.dimension].limitKey] } : null;
  }, [verdict, ceiling, tier]);

  // ── Gateway probes ─────────────────────────────────────────────────────────
  const sendProbe = useCallback(async (mode: 'dry' | 'real') => {
    if (!apiKey || !payload.trim()) return;
    setProbing(mode);
    setProbe(null);
    try {
      const url = mode === 'dry' ? '/api/v1/limits/payload/check?target=/v1/batch/enrich' : '/api/v1/batch/enrich';
      const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' }, body: payload });
      const body = (await res.json().catch(() => null)) as DryRunBody | null;
      let code: string | null = null;
      let message = '';
      if (mode === 'dry' && res.ok) {
        code = body?.data?.wouldReturn?.code ?? null;
        const would = body?.data?.wouldReturn?.status ?? 200;
        message = body?.data?.verdict?.primary
          ? `Gateway verdict: would return ${would} ${code}. ${body.data.verdict.primary.fix}`
          : 'Gateway verdict: accepted — this body is within every limit.';
      } else {
        code = body?.error?.code ?? null;
        message = res.ok ? 'Accepted and executed by the gateway.' : (body?.error?.message ?? `HTTP ${res.status}`);
      }
      setProbe({ mode, status: 'ok', httpStatus: res.status, code, message, limitBytes: res.headers.get('X-Payload-Limit-Bytes') ?? '—', limitDepth: res.headers.get('X-Payload-Limit-Depth') ?? '—' });
      track('payload_probe_sent', { mode, status: res.status, code });
      if (mode === 'real') loadSnapshot();
    } catch {
      setProbe({ mode, status: 'error', message: 'Could not reach the gateway. Check your connection and retry.' });
      track('payload_probe_sent', { mode, status: 0, code: null });
    } finally {
      setProbing(null);
    }
  }, [apiKey, payload, loadSnapshot]);

  // ── Limits editor ──────────────────────────────────────────────────────────
  const changeLimit = (key: keyof PayloadLimits, raw: string) => {
    const value = raw === 'default' ? null : Number(raw);
    setLimit(orgId, key, value);
    patchGateway({ [key]: value });
    track('payload_limit_changed', { limit: key, value, tier });
    toast.success('Limit updated', value === null ? 'Back to the plan default.' : `Now ${formatMeasure(DIMENSIONS.find((d) => d.limitKey === key)!.key, value)} for this org.`);
  };
  const resetAll = async () => {
    reset(orgId);
    const clearAll: Record<string, number | null> = {};
    DIMENSIONS.forEach((d) => { clearAll[d.limitKey] = null; });
    await patchGateway(clearAll);
    track('payload_limits_reset', { tier });
    toast.success('Overrides cleared', 'All limits are back to your plan defaults.');
  };
  // Count only overrides that actually tighten the current tier's ceiling (a tier
  // switch can clamp an override until it no longer bites).
  const overrideCount = DIMENSIONS.filter((d) => limits[d.limitKey] < ceiling[d.limitKey]).length;

  const rejectionColumns: Column<RejectionRow>[] = [
    { key: 'at', header: 'When', sortValue: (r) => r.at, render: (r) => <span className="text-[12px] text-fg-muted whitespace-nowrap" title={new Date(r.at).toLocaleString()}>{relTime(r.at, now)}</span> },
    {
      key: 'path', header: 'Request', render: (r) => (
        <span className="font-mono text-[12px] text-fg truncate block max-w-[260px]"><span className="text-teal font-bold">{r.method}</span> {r.path}</span>
      ),
    },
    { key: 'dimension', header: 'Dimension', render: (r) => <span className="text-[12px] text-fg-muted inline-flex items-center gap-1.5">{DIM_ICON[r.dimension]} {DIMENSION_BY_KEY[r.dimension].label}</span> },
    {
      key: 'measured', header: 'Measured / limit', align: 'right', className: 'hidden md:table-cell',
      render: (r) => <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap"><span className="text-semantic-error">{formatMeasure(r.dimension, r.measured)}</span> / {formatMeasure(r.dimension, r.limit)}</span>,
    },
    { key: 'code', header: 'Response', align: 'right', render: (r) => <StatusBadge tone="error">{r.status} {r.code}</StatusBadge> },
  ];

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Ruler />}
        title="Payload Limits"
        description="Every request is measured before any handler parses it — body size, nesting depth, array length, keys, string length, URL length — against limits sized to your plan. Rejections explain themselves: the dimension, the measured value, the limit, and the fix."
        actions={
          <Button variant="secondary" size="sm" onClick={loadSnapshot} loading={ledger === 'loading' && phase === 'ready'} disabled={noKeys} icon={<RefreshCw className="w-4 h-4" />} title={noKeys ? 'Create an API key to read the ledger' : 'Re-read GET /v1/limits/payload'}>
            Refresh ledger
          </Button>
        }
      />

      {phase === 'loading' ? (
        <div className="mt-6" aria-busy="true" aria-label="Loading payload limits">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading label="Plan tier" value="" icon={<Rocket />} />
            <KpiTile loading label="Max body" value="" icon={<FileJson />} />
            <KpiTile loading label="Max depth" value="" icon={<Layers />} />
            <KpiTile loading label="Rejections (24h)" value="" icon={<AlertTriangle />} />
          </div>
          <Skeleton variant="block" className="h-[320px] mt-5" />
          <Skeleton variant="block" className="h-[420px] mt-5" />
          <Skeleton variant="block" className="h-[260px] mt-5" />
        </div>
      ) : (
        <>
          {noKeys && (
            <motion.div {...SECTION} className="mt-6 rounded-2xl border border-teal/30 bg-teal/5 p-4 flex items-start gap-3 flex-wrap">
              <KeyRound className="w-5 h-5 text-teal shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-fg">Limits are always enforced — create a key to test them live</div>
                <p className="text-[12px] text-fg-muted mt-0.5">The analyzer works without a key. With one you can dry-run at the gateway, send for real, and read your org’s rejection ledger.</p>
              </div>
              <Button size="sm" icon={<KeyRound className="w-4 h-4" />} onClick={() => router.push('/console/keys')}>Create a key</Button>
            </motion.div>
          )}

          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Plan tier" value={tier} icon={<Rocket />} hint={environment === 'sandbox' ? 'sandbox keys use Starter limits' : 'sized by your plan'} />
            <KpiTile label="Max body" value={formatBytes(limits.maxBodyBytes)} icon={<FileJson />} hint={limits.maxBodyBytes < ceiling.maxBodyBytes ? `tightened from ${formatBytes(ceiling.maxBodyBytes)}` : 'plan ceiling'} />
            <KpiTile label="Max depth" value={`${limits.maxDepth}`} icon={<Layers />} hint={`levels · arrays ≤ ${limits.maxArrayLength.toLocaleString()} items`} />
            <KpiTile label="Rejections (24h)" value={snapshot ? snapshot.stats.last24h : '—'} icon={<AlertTriangle />} hint={noKeys ? 'create a key to read the ledger' : snapshot ? `${snapshot.stats.total} on the ledger` : ledger === 'error' ? 'ledger unavailable' : 'loading ledger'} />
          </motion.div>

          {/* Limits */}
          <motion.div {...SECTION} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-start gap-3 flex-wrap mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal" />
                    <h3 className="text-sm font-bold text-fg">Your limits</h3>
                    <StatusBadge tone="info"><Rocket className="w-3 h-3" /> {tier} ceiling</StatusBadge>
                    {overrideCount > 0 && <StatusBadge tone="warning">{overrideCount} tightened</StatusBadge>}
                  </div>
                  <p className="text-[12px] text-fg-muted mt-0.5">
                    The plan ceiling is the hard maximum. {isAdmin ? 'Tighten any dimension for this org — useful to catch runaway integrations early.' : 'Only an admin can tighten limits for the org.'} Enforced on every request and advertised on every gateway response as <span className="font-mono">X-Payload-Limit-Bytes</span> / <span className="font-mono">X-Payload-Limit-Depth</span>. Changes are written to the gateway (<span className="font-mono">PATCH /v1/limits/payload</span>), which is the source of truth.
                  </p>
                </div>
                {isAdmin && overrideCount > 0 && (
                  <ConfirmAction size="sm" confirmLabel="Clear all overrides" onConfirm={resetAll}>
                    <RefreshCw className="w-4 h-4" /> Reset to plan defaults
                  </ConfirmAction>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {DIMENSIONS.map((d) => {
                  const effective = limits[d.limitKey];
                  const cap = ceiling[d.limitKey];
                  const tightened = effective < cap;
                  const options = d.presets.filter((p) => p <= cap);
                  return (
                    <div key={d.key} className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors ${tightened ? 'border-semantic-warning/30 bg-semantic-warning/5' : 'border-border bg-surface'}`}>
                      <span className="text-teal shrink-0">{DIM_ICON[d.key]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-fg">{d.label}</div>
                        <div className="text-[11px] text-fg-muted">
                          <span className="font-mono text-fg">{formatMeasure(d.key, effective)}</span>
                          {tightened ? <> · plan ceiling {formatMeasure(d.key, cap)}</> : <> · {d.status} {d.code}</>}
                        </div>
                      </div>
                      {isAdmin ? (
                        <div className="relative shrink-0">
                          <select
                            value={tightened ? String(effective) : 'default'}
                            onChange={(e) => changeLimit(d.limitKey, e.target.value)}
                            className="bg-surface-2 border border-border rounded-lg py-1.5 pl-2.5 pr-7 text-[12px] font-bold text-fg focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 transition-colors appearance-none cursor-pointer"
                            aria-label={`${d.label} limit`}
                          >
                            <option value="default">Plan default</option>
                            {options.filter((p) => p < cap).map((p) => <option key={p} value={String(p)}>{formatMeasure(d.key, p)}</option>)}
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
                        </div>
                      ) : (
                        <StatusBadge tone={tightened ? 'warning' : 'success'}>{tightened ? 'Tightened' : 'Default'}</StatusBadge>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1.5">Escape hatches — endpoint profiles on every plan</div>
                <ul className="space-y-1">
                  {ENDPOINT_PROFILES.map((p) => (
                    <li key={p.id} className="text-[12px] text-fg-muted flex items-start gap-2 flex-wrap">
                      <span className="font-mono text-fg">{p.paths.join(', ')}</span>
                      <span>· {Object.entries(p.limits).map(([k, v]) => `${DIMENSIONS.find((d) => d.limitKey === k)?.label.toLowerCase()} ≤ ${formatMeasure(DIMENSIONS.find((d) => d.limitKey === k)!.key, v as number)}`).join(' · ')}</span>
                      <span className="text-fg-subtle">— {p.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          </motion.div>

          {/* Analyzer */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <FlaskConical className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Payload analyzer</h3>
                <StatusBadge tone="info">same rules as the edge</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Paste a body or pick a sample. Every dimension is metered against your limits, with the exact fix the gateway would return. Then prove it: a free dry run measures the body at the real gateway; “send for real” fires it at <span className="font-mono">/v1/batch/enrich</span>.</p>

              <div className="flex flex-wrap gap-2 mb-1.5" role="group" aria-label="Sample payloads">
                {SAMPLE_PAYLOADS.map((s) => (
                  <motion.button
                    key={s.id} type="button" whileTap={{ scale: 0.98 }} onClick={() => pickPreset(s.id)}
                    aria-pressed={presetId === s.id} title={s.description}
                    className={`text-[11px] font-bold rounded-full px-3 py-1.5 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${presetId === s.id ? 'border-teal/50 bg-teal/10 text-teal' : 'border-border bg-surface text-fg-muted hover:text-fg hover:border-teal/40'}`}
                  >
                    {s.label}
                  </motion.button>
                ))}
              </div>
              <p className="text-[11px] text-fg-muted mb-3 min-h-[1rem]">{presetId ? SAMPLE_PAYLOADS.find((s) => s.id === presetId)?.description : 'Each sample is deterministic — the same bytes every time — so what you see here is what the tests assert.'}</p>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 min-w-0">
                  <div className="relative">
                    <textarea
                      value={payload}
                      onChange={(e) => onType(e.target.value)}
                      spellCheck={false}
                      aria-label="Payload to analyze"
                      placeholder='{"inputs":[{"email":"priya.0@acme.io"}, …]}'
                      className="w-full h-56 resize-y rounded-xl border border-border bg-surface font-mono text-[11px] text-fg p-3 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 transition-colors placeholder:text-fg-subtle"
                    />
                    {payload && (
                      <button type="button" onClick={() => { setPayload(''); setPresetId(null); setProbe(null); setCapped(false); }} aria-label="Clear payload" className="absolute top-2 right-2 rounded-md p-1 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-fg-muted flex-wrap">
                    <span>{measure ? <>{formatBytes(measure.bytes)} · {payload.length.toLocaleString()} chars{measure.validJson ? '' : ' · not valid JSON — only size and URL are measured'}</> : 'Nothing to measure yet.'}</span>
                    {capped && <span className="text-semantic-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Truncated to 2M characters for the analyzer</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => sendProbe('dry')} loading={probing === 'dry'} disabled={noKeys || !payload.trim() || probing === 'real'} icon={<FlaskConical className="w-4 h-4" />} title={noKeys ? 'Create an API key first' : 'POST /v1/limits/payload/check — measures without executing'}>
                      Dry run at gateway (free)
                    </Button>
                    <ConfirmAction size="sm" confirmLabel="Yes, send it" onConfirm={() => sendProbe('real')} disabled={noKeys || !payload.trim() || probing !== null}>
                      <Send className="w-4 h-4" /> Send for real
                    </ConfirmAction>
                    <span className="text-[11px] text-fg-muted">A real send bills credits if the gateway accepts it.</span>
                  </div>
                </div>

                <div className="lg:col-span-2 min-w-0 space-y-2">
                  {!measure ? (
                    <div className="rounded-xl border border-border bg-surface p-4 h-full flex flex-col items-center justify-center text-center">
                      <Ruler className="w-6 h-6 text-fg-muted mb-2" />
                      <div className="text-[12px] font-bold text-fg">Meters appear here</div>
                      <div className="text-[11px] text-fg-muted mt-0.5">Pick a sample or paste a body to see each dimension against your limits.</div>
                    </div>
                  ) : (
                    DIMENSIONS.map((d) => {
                      const u = utilisation(measure, limits, d.key);
                      const measured = measure[d.measureKey];
                      const structural = d.key !== 'bytes' && d.key !== 'urlLength';
                      const na = structural && !measure.validJson;
                      return (
                        <div key={d.key} className="rounded-xl border border-border bg-surface px-3 py-2">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 text-fg font-bold">{DIM_ICON[d.key]} {d.label}</span>
                            {na ? <span className="text-fg-muted">n/a</span> : (
                              <span className="font-mono text-fg-muted"><span className={u > 1 ? 'text-semantic-error font-bold' : 'text-fg'}>{formatMeasure(d.key, measured)}</span> / {formatMeasure(d.key, limits[d.limitKey])}</span>
                            )}
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden" role="meter" aria-label={`${d.label} utilisation`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(u * 100))} aria-valuetext={na ? 'not applicable' : `${formatMeasure(d.key, measured)} of ${formatMeasure(d.key, limits[d.limitKey])}`}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, u * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} className={`h-full rounded-full ${na ? 'bg-border' : meterTone(u)}`} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Verdict */}
              <AnimatePresence initial={false}>
                {verdict && (
                  <motion.div key={verdict.ok ? 'ok' : verdict.primary?.code} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    {verdict.ok ? (
                      <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 flex items-center gap-3">
                        <Check className="w-4 h-4 text-teal shrink-0" />
                        <div className="text-[12px] text-fg"><span className="font-bold">Within every limit.</span> The gateway would accept this body{measure && !measure.validJson ? ' on size — but it isn’t valid JSON, so the pipeline treats it as an empty body and the endpoint’s parameter validation decides' : ''}.</div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {verdict.violations.map((v) => {
                          const plan = v.dimension === 'arrayLength' ? chunkPlan(v.measured, v.limit) : null;
                          return (
                            <div key={v.code} className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-3 flex items-start gap-3">
                              <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge tone="error">{v.status} {v.code}</StatusBadge>
                                  <span className="text-[12px] font-bold text-fg">{v.message}</span>
                                </div>
                                <p className="text-[11px] text-fg-muted mt-1">{v.fix}</p>
                                {plan && (
                                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-fg">
                                    <ListFilter className="w-3.5 h-3.5 text-teal" /> Chunk plan: <span className="font-mono font-bold">{plan.chunks} × ≤{plan.perChunk.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Upgrade nudge (PLG) — only when the *plan*, not an override, is the blocker */}
              <AnimatePresence>
                {upgrade && !nudgeDismissed && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3 flex items-center gap-3 flex-wrap">
                    <Rocket className="w-4 h-4 text-teal shrink-0" />
                    <div className="text-[12px] text-fg min-w-0 flex-1">
                      <span className="font-bold">{upgrade.tier} raises {DIMENSION_BY_KEY[upgrade.dimension].label.toLowerCase()} to {formatMeasure(upgrade.dimension, upgrade.limit)}</span> — this payload would fit without splitting.
                    </div>
                    <Button size="sm" variant="secondary" icon={<ArrowRight className="w-4 h-4" />} onClick={() => { track('payload_upgrade_clicked', { from: tier, to: upgrade.tier, dimension: upgrade.dimension }); router.push('/console/billing'); }}>Compare plans</Button>
                    <button type="button" onClick={() => { setNudgeDismissed(true); track('payload_upgrade_dismissed', { from: tier, to: upgrade.tier, dimension: upgrade.dimension }); }} aria-label="Dismiss" className="rounded-md p-1 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><X className="w-3.5 h-3.5" /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Probe result */}
              <AnimatePresence initial={false}>
                {probe && (
                  <motion.div key={`${probe.mode}-${probe.status}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="status" aria-live="polite">
                    {probe.status === 'error' ? (
                      <div className="mt-3 rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-3 flex items-start gap-3 flex-wrap">
                        <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 text-[12px] text-fg"><span className="font-bold">Gateway unreachable.</span> {probe.message}</div>
                        <Button variant="secondary" size="sm" onClick={() => sendProbe(probe.mode)} loading={probing !== null} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                      </div>
                    ) : (
                      <div className={`mt-3 rounded-xl border p-3 ${probe.httpStatus >= 400 ? 'border-semantic-warning/30 bg-semantic-warning/5' : 'border-teal/30 bg-teal/5'}`}>
                        <div className="text-[10px] font-black uppercase tracking-widest text-fg mb-1.5 flex items-center gap-1.5 flex-wrap">
                          {probe.mode === 'dry' ? <FlaskConical className="w-3 h-3 text-teal" /> : <Send className="w-3 h-3 text-teal" />}
                          {probe.mode === 'dry' ? 'Live dry run · POST /v1/limits/payload/check' : 'Real send · POST /v1/batch/enrich'}
                          <StatusBadge tone={probe.httpStatus >= 400 ? 'warning' : 'success'}>HTTP {probe.httpStatus}{probe.code ? ` · ${probe.code}` : ''}</StatusBadge>
                        </div>
                        <p className="text-[12px] text-fg">{probe.message}</p>
                        <div className="font-mono text-[11px] text-fg-muted mt-1.5 break-all">
                          <span className="text-fg">X-Payload-Limit-Bytes:</span> {probe.limitBytes} · <span className="text-fg">X-Payload-Limit-Depth:</span> {probe.limitDepth}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>

          {/* Ledger */}
          <motion.div {...SECTION} transition={{ delay: 0.12 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Timer className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Recent rejections</h3>
                {snapshot && <StatusBadge tone={snapshot.stats.total ? 'warning' : 'success'}>{snapshot.stats.total} total</StatusBadge>}
              </div>
              {noKeys ? (
                <EmptyState icon={<Ruler className="w-8 h-8" />} title="Create an API key to see your rejections" description="The ledger is per org and read from the live gateway." action={<Button size="sm" onClick={() => router.push('/console/keys')}>Create a key</Button>} />
              ) : ledger === 'loading' && !snapshot ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
              ) : ledger === 'error' ? (
                <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-3 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" />
                  <div className="text-[12px] text-fg flex-1 min-w-0"><span className="font-bold">Couldn’t load the ledger.</span> The gateway didn’t answer GET /v1/limits/payload.</div>
                  <Button variant="secondary" size="sm" onClick={loadSnapshot} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                </div>
              ) : snapshot && snapshot.rejections.length === 0 ? (
                <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No rejected payloads" description="Every request in this org has been within its limits. Try “Send for real” with an oversized sample to see one land here." />
              ) : snapshot ? (
                <DataTable columns={rejectionColumns} rows={snapshot.rejections} rowKey={(r) => r.id} initialSort={{ key: 'at', dir: 'desc' }} pageSize={8} />
              ) : null}
            </GlassCard>
          </motion.div>

          <p className="text-[11px] text-fg-muted mt-4 flex items-center gap-1 flex-wrap"><Sparkles className="w-3 h-3 shrink-0" /> Anything bigger than one request still fits: <Link href="/console/jobs" className="text-teal hover:underline font-bold">async jobs</Link> accept the whole set and stream results back.</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/waf" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Firewall (WAF) <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request logs <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/explorer?endpoint=payload-limits" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Try /v1/limits/payload in the Explorer <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function PayloadLimitsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <PayloadLimitsInner />
    </RoleGuard>
  );
}
