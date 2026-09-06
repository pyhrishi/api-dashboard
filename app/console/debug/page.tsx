'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, Search, Play, Loader2, CircleAlert, ArrowRight, RotateCw,
  ShieldCheck, MapPin, KeyRound, Coins, ScanLine,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import type { ApiLog } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, StatusBadge, Button, EmptyState,
  type BadgeTone,
} from '@/components/ui';

interface DemoEndpoint { id: string; label: string; path: string; param: string; example: string; }
const DEMO_ENDPOINTS: DemoEndpoint[] = [
  { id: 'email-to-phone', label: 'GET /v1/people/phone', path: '/v1/people/phone', param: 'email', example: 'ceo@example.com' },
  { id: 'company-firmographics', label: 'GET /v1/companies/firmographics', path: '/v1/companies/firmographics', param: 'domain', example: 'acme.com' },
  { id: 'people-search', label: 'GET /v1/people', path: '/v1/people', param: 'email', example: 'john.doe@acme.com' },
];

interface DebugEcho {
  received: { method: string; path: string; params: Record<string, unknown>; headers: Record<string, string>; body_present: boolean };
  interpreted: {
    endpoint: { id: string; name: string; matched: boolean } | null;
    region: string; node: string; environment: string;
    auth: { scheme: string; key_prefix: string; key_type: string };
    privacy: { framework: string; country_code: string; masking_applies: boolean };
    rate_limit?: { limit: number; remaining: number };
  };
  billing: { base_cost: number; would_charge: number; note: string };
  policies: { name: string; status: 'ok' | 'skipped' | 'applied' | 'blocked'; detail: string }[];
  note: string;
}

const POLICY_TONE: Record<string, BadgeTone> = { ok: 'success', applied: 'teal', skipped: 'neutral', blocked: 'error' };

function DebugInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const environment = useStore((s) => s.environment);
  const apiLogs = useStore((s) => s.apiLogs);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';

  const [endpointId, setEndpointId] = useState(DEMO_ENDPOINTS[0].id);
  const endpoint = useMemo(() => DEMO_ENDPOINTS.find((e) => e.id === endpointId)!, [endpointId]);
  const [identifier, setIdentifier] = useState(DEMO_ENDPOINTS[0].example);
  const [busy, setBusy] = useState<'idle' | 'echo' | 'run'>('idle');
  const [echo, setEcho] = useState<DebugEcho | null>(null);
  const [runResult, setRunResult] = useState<{ status: number; body: unknown } | null>(null);
  const [error, setError] = useState('');
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayDiff, setReplayDiff] = useState<Record<string, { was: number; now: number; changed: boolean }>>({});

  const pick = (id: string) => {
    const ep = DEMO_ENDPOINTS.find((e) => e.id === id)!;
    setEndpointId(id); setIdentifier(ep.example); setEcho(null); setRunResult(null); setError('');
  };

  useEffect(() => { track('debug_inspector_viewed', {}); }, []);

  const fire = useCallback(async (mode: 'echo' | 'run') => {
    if (!apiKey) { toast.error('No API key', 'Generate a key first.'); return; }
    setBusy(mode); setError(''); setEcho(null); setRunResult(null);
    try {
      const url = `/api${endpoint.path}?${endpoint.param}=${encodeURIComponent(identifier)}`;
      const headers: Record<string, string> = { Authorization: authHeaderValue(apiKey) };
      if (mode === 'echo') headers['X-Debug-Echo'] = 'true';
      const res = await fetch(url, { headers });
      const body = (await res.json()) as { success?: boolean; data?: unknown; error?: { message?: string } };
      if (mode === 'echo') {
        const data = body.data as DebugEcho | undefined;
        if (!data || !data.received) throw new Error('Debug echo is not enabled on this gateway yet.');
        setEcho(data);
        track('debug_echo_run', { endpoint: endpoint.id, matched: data.interpreted.endpoint?.matched ?? false, would_charge: data.billing.would_charge });
      } else {
        setRunResult({ status: res.status, body });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
    } finally {
      setBusy('idle');
    }
  }, [apiKey, endpoint, identifier, toast]);

  const replay = async (log: ApiLog) => {
    setReplayingId(log.id);
    try {
      const params = log.request?.parameters ?? {};
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
      const url = `/api${log.path}${qs.toString() ? `?${qs}` : ''}`;
      const started = performance.now();
      const res = await fetch(url, {
        method: log.method,
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        ...(log.method === 'GET' ? {} : { body: JSON.stringify(params) }),
      });
      const duration = Math.round(performance.now() - started);
      const body = await res.json();
      // Log the REAL replay so it flows into Logs / Analytics.
      useStore.getState().logApiRequest({
        id: `log_${Date.now().toString(36)}_replay`,
        timestamp: new Date().toISOString(),
        environment: log.environment,
        method: log.method,
        path: log.path,
        status: res.status,
        duration,
        ip: log.ip,
        request: log.request,
        response: body,
      });
      setReplayDiff((prev) => ({ ...prev, [log.id]: { was: log.status, now: res.status, changed: res.status !== log.status } }));
      track('request_replayed', { path: log.path, was: log.status, now: res.status, changed: res.status !== log.status });
      toast.success('Replayed', `Re-fired ${log.method} ${log.path} → ${res.status} in ${duration}ms.`);
    } catch (e) {
      toast.error('Replay failed', e instanceof Error ? e.message : 'Could not reach the gateway.');
    } finally {
      setReplayingId(null);
    }
  };

  const recentLogs = useMemo(() => apiLogs.slice(0, 8), [apiLogs]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Request Inspector"
        description="See exactly how the gateway reads your request — parsed params, region, policies, and cost — before you spend a call. Then replay any past request to reproduce a bug for real."
        icon={<Bug />}
        actions={<StatusBadge tone="neutral">{environment}</StatusBadge>}
      />

      {/* Composer */}
      <GlassCard className="p-5 mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Request</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {DEMO_ENDPOINTS.map((e) => (
            <button key={e.id} onClick={() => pick(e.id)}
              className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold transition-colors ${e.id === endpointId ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong'}`}>
              {e.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">{endpoint.param}</span>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
          </label>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => fire('echo')} disabled={busy !== 'idle'}>
              {busy === 'echo' ? <><Loader2 className="w-4 h-4 animate-spin" /> Inspecting…</> : <><ScanLine className="w-4 h-4" /> Inspect</>}
            </Button>
            <Button onClick={() => fire('run')} disabled={busy !== 'idle'} variant="ghost">
              {busy === 'run' ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><Play className="w-4 h-4" /> Run live</>}
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-fg-subtle mt-2">Inspect sends <code className="text-fg-muted">X-Debug-Echo: true</code> — the gateway returns its read of the request at zero credits, without executing it.</p>
      </GlassCard>

      {error && (
        <GlassCard className="p-4 mt-4 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
          <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
          <div className="text-sm text-fg">{error}</div>
        </GlassCard>
      )}

      {/* Echo panel */}
      <AnimatePresence>
        {echo && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <GlassCard className="p-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Gateway interpretation</div>
                <dl className="space-y-2.5">
                  <Row icon={<Search className="w-3.5 h-3.5" />} k="Endpoint" v={echo.interpreted.endpoint ? `${echo.interpreted.endpoint.name} (${echo.interpreted.endpoint.id})` : 'No match'} bad={!echo.interpreted.endpoint} />
                  <Row icon={<MapPin className="w-3.5 h-3.5" />} k="Region · node" v={`${echo.interpreted.region} · ${echo.interpreted.node}`} />
                  <Row icon={<KeyRound className="w-3.5 h-3.5" />} k="Auth" v={`${echo.interpreted.auth.key_type} key ${echo.interpreted.auth.key_prefix}•••• · ${echo.interpreted.environment}`} />
                  <Row icon={<ShieldCheck className="w-3.5 h-3.5" />} k="Privacy" v={`${echo.interpreted.privacy.framework} · masking ${echo.interpreted.privacy.masking_applies ? 'on' : 'off'}`} />
                  <Row icon={<Coins className="w-3.5 h-3.5" />} k="Would charge" v={`${echo.billing.would_charge} credit(s)`} />
                </dl>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Policies</div>
                <ul className="space-y-2">
                  {echo.policies.map((p) => (
                    <li key={p.name} className="flex items-center gap-2">
                      <StatusBadge tone={POLICY_TONE[p.status] ?? 'neutral'}>{p.status}</StatusBadge>
                      <span className="text-sm font-bold text-fg">{p.name}</span>
                      <span className="text-[11px] text-fg-subtle truncate">— {p.detail}</span>
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <GlassCard className="p-5 lg:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Received (redacted)</div>
                <pre className="text-[11px] leading-relaxed font-mono text-fg-muted bg-surface-2 border border-border rounded-xl p-3 overflow-auto max-h-64">
{JSON.stringify(echo.received, null, 2)}
                </pre>
              </GlassCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live run result */}
      {runResult && (
        <GlassCard className="p-5 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Live response</div>
            <StatusBadge tone={runResult.status < 400 ? 'success' : 'error'}>{runResult.status}</StatusBadge>
          </div>
          <pre className="text-[11px] leading-relaxed font-mono text-fg-muted bg-surface-2 border border-border rounded-xl p-3 overflow-auto max-h-64">
{JSON.stringify(runResult.body, null, 2)}
          </pre>
        </GlassCard>
      )}

      {/* Replay from logs */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <RotateCw className="w-4 h-4 text-teal" />
          <div className="text-sm font-bold text-fg">Replay a past request</div>
        </div>
        {recentLogs.length === 0 ? (
          <EmptyState icon={<RotateCw className="w-7 h-7" />} title="No requests logged yet" description="Run a call from the Explorer or above, then replay it here." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {recentLogs.map((log) => {
              const diff = replayDiff[log.id];
              return (
                <li key={log.id} className="py-2.5 flex items-center gap-3">
                  <StatusBadge tone={log.status < 400 ? 'success' : 'error'}>{log.status}</StatusBadge>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono font-bold text-fg truncate">{log.method} {log.path}</div>
                    <div className="text-[10px] text-fg-subtle">{new Date(log.timestamp).toLocaleTimeString()} · {log.duration}ms</div>
                  </div>
                  {diff && (
                    <StatusBadge tone={diff.changed ? 'warning' : 'success'}>
                      {diff.changed ? `${diff.was} → ${diff.now}` : 'same'}
                    </StatusBadge>
                  )}
                  <Button onClick={() => replay(log)} disabled={replayingId === log.id} variant="ghost" size="sm">
                    {replayingId === log.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> …</> : <><RotateCw className="w-3.5 h-3.5" /> Replay</>}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-fg-subtle mt-3">Replays re-fire the request against the live gateway and log the real response — see them in <Link href="/console/logs" className="text-teal font-semibold hover:text-fg transition-colors">Logs <ArrowRight className="w-3 h-3 inline" /></Link>.</p>
      </GlassCard>
    </div>
  );
}

function Row({ icon, k, v, bad }: { icon: React.ReactNode; k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-subtle shrink-0">{icon}</span>
      <span className="text-[11px] font-black uppercase tracking-wider text-fg-subtle w-28 shrink-0">{k}</span>
      <span className={`text-sm font-mono ${bad ? 'text-semantic-error' : 'text-fg'}`}>{v}</span>
    </div>
  );
}

export default function DebugPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <DebugInner />
    </RoleGuard>
  );
}
