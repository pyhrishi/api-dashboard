'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ListFilter, Braces, Coins, ArrowRight, Check, Copy, Loader2, AlertTriangle, Zap, Feather, ShieldCheck, Play } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import { payloadBytes } from '@/lib/gateway/fieldSelection';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, Button,
} from '@/components/ui';

interface DemoEndpoint {
  id: string;
  label: string;
  path: string;
  param: string;
  example: string;
  hint: string;
}

// Curated rich GET endpoints — each returns a wide record worth trimming.
const DEMO_ENDPOINTS: DemoEndpoint[] = [
  { id: 'email-to-phone', label: 'Phone by Email', path: '/v1/people/phone', param: 'email', example: 'ceo@example.com', hint: 'Line type, carrier, DNC, reachability…' },
  { id: 'company-firmographics', label: 'Firmographics', path: '/v1/companies/firmographics', param: 'domain', example: 'acme.com', hint: 'NAICS/SIC, industry, size, revenue…' },
  { id: 'people-social', label: 'Social Profiles', path: '/v1/people/social', param: 'email', example: 'ceo@example.com', hint: 'Linked profiles across platforms.' },
  { id: 'company-enrich', label: 'Company Enrich', path: '/v1/companies/enrich', param: 'domain', example: 'acme.com', hint: 'Full company object + confidence.' },
];

interface SparseMeta {
  requested: string[];
  returned: number;
  omitted: number;
  bytes_before: number;
  bytes_after: number;
  discount_pct: number;
}

type Phase = 'idle' | 'discovering' | 'ready' | 'running' | 'error';

function FieldSelectionInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const environment = useStore((s) => s.environment);
  const toast = useToast();

  const apiKey = activeKeys[0]?.key ?? '';

  const [endpointId, setEndpointId] = useState<string>(DEMO_ENDPOINTS[0].id);
  const endpoint = useMemo(() => DEMO_ENDPOINTS.find((e) => e.id === endpointId)!, [endpointId]);
  const [identifier, setIdentifier] = useState<string>(DEMO_ENDPOINTS[0].example);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string>('');

  // Discovered full record
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sparse result
  const [sparseData, setSparseData] = useState<unknown>(null);
  const [sparseMeta, setSparseMeta] = useState<SparseMeta | null>(null);
  const [fullCost, setFullCost] = useState<number>(0);
  const [sparseCost, setSparseCost] = useState<number>(0);

  const pickEndpoint = (id: string) => {
    const ep = DEMO_ENDPOINTS.find((e) => e.id === id);
    if (!ep) return;
    setEndpointId(id);
    setIdentifier(ep.example);
    setPhase('idle');
    setFullData(null);
    setAvailable([]);
    setSelected(new Set());
    setSparseData(null);
    setSparseMeta(null);
    setError('');
  };

  const call = useCallback(
    async (fields?: string[]) => {
      const params = new URLSearchParams({ [endpoint.param]: identifier });
      if (fields && fields.length) params.set('fields', fields.join(','));
      const url = `/api${endpoint.path}?${params.toString()}`;
      const started = performance.now();
      const res = await fetch(url, { headers: { Authorization: authHeaderValue(apiKey) } });
      const duration = Math.round(performance.now() - started);
      const body = (await res.json()) as {
        success?: boolean;
        data?: unknown;
        error?: { message?: string };
        metadata?: { billing?: { cost?: number }; sparse?: SparseMeta };
      };
      // Log the real round-trip so it flows into Logs / Analytics / Billing.
      useStore.getState().logApiRequest({
        id: res.headers.get('x-request-id') || `req_${Math.random().toString(36).slice(2, 9)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: endpoint.path,
        status: res.status,
        duration,
        ip: '203.0.113.7',
        request: { headers: { Authorization: `Bearer ${apiKey.slice(0, 12)}…` }, parameters: Object.fromEntries(params) },
        response: body,
      });
      if (!res.ok || body.success === false) {
        throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      }
      return { data: body.data, cost: body.metadata?.billing?.cost ?? 0, sparse: body.metadata?.sparse };
    },
    [endpoint, identifier, apiKey, environment],
  );

  const analyze = async () => {
    if (!apiKey) {
      toast.error('No API key', 'Generate a key on the Keys page first.');
      return;
    }
    if (!identifier.trim()) {
      toast.error('Enter a value', `Provide a ${endpoint.param} to look up.`);
      return;
    }
    setPhase('discovering');
    setError('');
    setSparseData(null);
    setSparseMeta(null);
    try {
      const { data, cost } = await call();
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('This endpoint did not return a projectable object.');
      }
      const obj = data as Record<string, unknown>;
      const keys = Object.keys(obj);
      setFullData(obj);
      setAvailable(keys);
      // Default: pre-select a lean, useful subset (first 3) to show the win immediately.
      setSelected(new Set(keys.slice(0, Math.min(3, keys.length))));
      setFullCost(cost);
      setPhase('ready');
      track('field_selection_analyzed', { endpoint: endpoint.id, fields_available: keys.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
      setPhase('error');
    }
  };

  const runSparse = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one field', 'Pick the attributes you want returned.');
      return;
    }
    setPhase('running');
    setError('');
    try {
      const fields = available.filter((k) => selected.has(k)); // preserve source order
      const { data, cost, sparse } = await call(fields);
      setSparseData(data);
      setSparseMeta(sparse ?? null);
      setSparseCost(cost);
      setPhase('ready');
      track('field_selection_run', {
        endpoint: endpoint.id,
        fields_selected: fields.length,
        fields_available: available.length,
        bytes_saved_pct: sparse ? Math.round((1 - sparse.bytes_after / Math.max(1, sparse.bytes_before)) * 100) : 0,
        discount_pct: sparse?.discount_pct ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
      setPhase('error');
    }
  };

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const selectedFields = available.filter((k) => selected.has(k));
  const requestUrl = `GET /api${endpoint.path}?${endpoint.param}=${encodeURIComponent(identifier)}${selectedFields.length ? `&fields=${selectedFields.join(',')}` : ''}`;

  const bytesBefore = sparseMeta?.bytes_before ?? (fullData ? payloadBytes(fullData) : 0);
  const bytesAfter = sparseMeta?.bytes_after ?? 0;
  const bytesPct = bytesBefore > 0 && bytesAfter > 0 ? Math.round((1 - bytesAfter / bytesBefore) * 100) : 0;
  const discountPct = sparseMeta?.discount_pct ?? 0;

  const copyUrl = () => {
    navigator.clipboard?.writeText(requestUrl.replace('GET ', ''));
    toast.success('Copied', 'Request URL copied to your clipboard.');
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Field Selection"
        description="Ask for only the attributes you need. A sparse request returns a smaller payload, pulls less PII, and costs less — pay for what you pull."
        icon={<ListFilter />}
        actions={<StatusBadge tone="neutral">{environment}</StatusBadge>}
      />

      {/* Controls */}
      <GlassCard className="p-5 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Choose an endpoint</div>
        <div className="flex flex-wrap gap-2">
          {DEMO_ENDPOINTS.map((e) => {
            const active = e.id === endpointId;
            return (
              <button
                key={e.id}
                onClick={() => pickEndpoint(e.id)}
                className={`text-left px-3 py-2 rounded-xl border transition-colors ${active ? 'border-teal/40 bg-teal/10' : 'border-border bg-surface-2 hover:border-border-strong'}`}
              >
                <div className={`text-sm font-bold ${active ? 'text-teal' : 'text-fg'}`}>{e.label}</div>
                <div className="text-[11px] text-fg-subtle">{e.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mt-4">
          <label className="flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">{endpoint.param}</span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') analyze(); }}
              placeholder={endpoint.example}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none transition-colors"
            />
          </label>
          <Button onClick={analyze} disabled={phase === 'discovering'} className="shrink-0">
            {phase === 'discovering' ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Braces className="w-4 h-4" /> Analyze fields</>}
          </Button>
        </div>
      </GlassCard>

      {/* Error */}
      <AnimatePresence>
        {phase === 'error' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard className="p-4 mt-4 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-semantic-error shrink-0" />
              <div className="text-sm text-fg">{error}</div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle / empty */}
      {phase === 'idle' && (
        <GlassCard className="p-10 mt-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center mx-auto mb-4">
            <ListFilter className="w-7 h-7 text-teal" />
          </div>
          <div className="text-lg font-black text-fg">Trim any response to just the fields you need</div>
          <p className="text-sm text-fg-muted mt-1 max-w-md mx-auto">Analyze an endpoint to see every field it returns, then toggle off the ones you don&apos;t — and watch the payload and the bill shrink.</p>
        </GlassCard>
      )}

      {/* Discovering skeleton */}
      {phase === 'discovering' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      {/* Ready / running */}
      {(phase === 'ready' || phase === 'running') && fullData && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Fields selected" value={`${selected.size}/${available.length}`} icon={<ListFilter />} hint="Attributes returned" />
            <KpiTile label="Payload reduction" value={sparseMeta ? `${bytesPct}%` : '—'} icon={<Feather />} hint={sparseMeta ? `${bytesBefore} → ${bytesAfter} bytes` : 'Run a selection'} />
            <KpiTile label="Sparse discount" value={sparseMeta ? `${discountPct}%` : '—'} icon={<Coins />} hint={sparseMeta ? `${fullCost} → ${sparseCost} credits` : 'Fewer fields, lower cost'} lowerIsBetter={false} />
            <KpiTile label="PII fields dropped" value={sparseMeta ? String(sparseMeta.omitted) : '—'} icon={<ShieldCheck />} hint="Data-minimization" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Field picker */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Fields</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(new Set(available))} className="text-[11px] font-bold text-fg-muted hover:text-teal transition-colors">All</button>
                  <span className="text-fg-subtle">·</span>
                  <button onClick={() => setSelected(new Set())} className="text-[11px] font-bold text-fg-muted hover:text-teal transition-colors">None</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[320px] overflow-y-auto pr-1">
                {available.map((k) => {
                  const on = selected.has(k);
                  return (
                    <button
                      key={k}
                      onClick={() => toggle(k)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors ${on ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface-2 hover:border-border-strong'}`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${on ? 'bg-teal border-teal' : 'border-border'}`}>
                        {on && <Check className="w-3 h-3 text-ink" />}
                      </span>
                      <span className={`text-xs font-mono truncate ${on ? 'text-fg' : 'text-fg-subtle'}`}>{k}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button onClick={runSparse} disabled={phase === 'running' || selected.size === 0} className="flex-1">
                  {phase === 'running' ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><Play className="w-4 h-4" /> Run sparse request</>}
                </Button>
              </div>
            </GlassCard>

            {/* Response preview */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">{sparseData ? 'Sparse response' : 'Full response'}</div>
                {sparseMeta && <StatusBadge tone="success"><Zap className="w-3 h-3" /> {bytesPct}% smaller</StatusBadge>}
              </div>
              <pre className="text-[11px] leading-relaxed font-mono text-fg bg-surface-2 border border-border rounded-xl p-3 overflow-auto max-h-[320px]">
{JSON.stringify(sparseData ?? fullData, null, 2)}
              </pre>
            </GlassCard>
          </div>

          {/* Request URL */}
          <GlassCard className="p-4 mt-4">
            <div className="flex items-center justify-between gap-3">
              <code className="text-[12px] font-mono text-fg-muted truncate">{requestUrl}</code>
              <button onClick={copyUrl} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-teal hover:text-fg transition-colors">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-5 mt-4 border-teal/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><ShieldCheck className="w-4 h-4 text-teal" /></div>
              <div>
                <div className="text-sm font-bold text-fg">Sparse by design — cheaper and more compliant</div>
                <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
                  Add <code className="text-teal">?fields=</code> to any enrichment call — dotted paths like <code className="text-teal">company.domain</code> work too. The gateway projects the payload <em>after</em> masking, so you pull only the fields you asked for (data-minimization), the response is smaller, and the request is discounted. Every call is logged in <Link href="/console/logs" className="text-teal font-semibold hover:text-fg transition-colors">Logs <ArrowRight className="w-3 h-3 inline" /></Link> and metered in <Link href="/console/billing" className="text-teal font-semibold hover:text-fg transition-colors">Billing</Link>.
                </p>
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

export default function FieldSelectionPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <FieldSelectionInner />
    </RoleGuard>
  );
}
