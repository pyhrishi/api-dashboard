'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Plus, Trash2, Check, Loader2, CircleAlert, ShieldCheck, Lock, ScanLine, ArrowRight, X,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, Button, SegmentedControl,
} from '@/components/ui';

type CorsMode = 'allowlist' | 'wildcard' | 'disabled';
interface CorsPolicy {
  mode: CorsMode;
  allowedOrigins: string[];
  allowCredentials: boolean;
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAgeSeconds: number;
}
interface TestResult { allowed: boolean; reason: string; headers: Record<string, string> }

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
const ORIGIN_RE = /^https?:\/\/[a-zA-Z0-9.-]+(:\d{1,5})?$/;

function CorsInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const role = useStore((s) => s.user?.role);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';
  const readOnly = role === 'billing';

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<CorsPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [testOrigin, setTestOrigin] = useState('https://app.example.com');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/cors', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json()) as { success?: boolean; data?: { policy: CorsPolicy }; error?: { message?: string } };
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setPolicy(body.data.policy);
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the CORS policy.');
      setPhase('error');
    }
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { track('cors_viewed', {}); }, []);

  const patch = async (update: Partial<CorsPolicy>, successMsg?: string) => {
    if (readOnly) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/cors', {
        method: 'PATCH',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const body = (await res.json()) as { success?: boolean; data?: { policy: CorsPolicy }; error?: { message?: string } };
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setPolicy(body.data.policy);
      track('cors_policy_updated', { keys: Object.keys(update).join(',') });
      if (successMsg) toast.success(successMsg);
      setTestResult(null); // policy changed — the last test is stale
    } catch (e) {
      toast.error('Update failed', e instanceof Error ? e.message : 'Could not reach the gateway.');
    } finally {
      setSaving(false);
    }
  };

  const addOrigin = () => {
    const o = newOrigin.trim();
    if (!ORIGIN_RE.test(o)) { toast.error('Invalid origin', 'Use scheme://host[:port] — e.g. https://app.acme.com.'); return; }
    if (!policy) return;
    if (policy.allowedOrigins.includes(o)) { toast.error('Already listed', 'That origin is already allowed.'); return; }
    patch({ allowedOrigins: [...policy.allowedOrigins, o] }, 'Origin added');
    setNewOrigin('');
  };
  const removeOrigin = (o: string) => policy && patch({ allowedOrigins: policy.allowedOrigins.filter((x) => x !== o) }, 'Origin removed');
  const toggleMethod = (m: string) => {
    if (!policy) return;
    const has = policy.allowedMethods.includes(m);
    patch({ allowedMethods: has ? policy.allowedMethods.filter((x) => x !== m) : [...policy.allowedMethods, m] });
  };

  const runTest = async () => {
    if (!ORIGIN_RE.test(testOrigin.trim())) { toast.error('Invalid origin', 'Use scheme://host[:port].'); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/v1/cors/test', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: testOrigin.trim(), method: 'GET' }),
      });
      const body = (await res.json()) as { success?: boolean; data?: TestResult; error?: { message?: string } };
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setTestResult(body.data);
      track('cors_preflight_tested', { origin: testOrigin.trim(), allowed: body.data.allowed });
    } catch (e) {
      toast.error('Test failed', e instanceof Error ? e.message : 'Could not reach the gateway.');
    } finally {
      setTesting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="max-w-[1000px] mx-auto">
        <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[30rem] max-w-full" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-72 rounded-2xl mt-4" />
      </div>
    );
  }
  if (phase === 'error' || !policy) {
    return (
      <div className="max-w-[1000px] mx-auto">
        <PageHeader title="CORS Policy" description="Configure which browser origins may call your API." icon={<Globe />} />
        <GlassCard className="p-4 mt-6 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
          <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
          <div className="text-sm text-fg flex-1">{error || 'No policy available.'}</div>
          <Button onClick={load} variant="ghost" size="sm">Retry</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title="CORS Policy"
        description="Control which browser origins may call your API, and what the gateway sends back on a preflight. Changes apply to the live gateway immediately — test any origin below."
        icon={<Globe />}
        actions={readOnly ? <StatusBadge tone="neutral"><Lock className="w-3 h-3" /> Read-only</StatusBadge> : saving ? <StatusBadge tone="teal"><Loader2 className="w-3 h-3 animate-spin" /> Saving</StatusBadge> : <StatusBadge tone="success">Live</StatusBadge>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <KpiTile label="Mode" value={policy.mode} icon={<Globe />} hint="Origin policy" />
        <KpiTile label="Allowed origins" value={String(policy.allowedOrigins.length)} icon={<ShieldCheck />} hint={policy.mode === 'wildcard' ? 'Ignored in wildcard' : 'On the allowlist'} />
        <KpiTile label="Credentials" value={policy.allowCredentials ? 'On' : 'Off'} icon={<Lock />} hint="Allow cookies/auth" />
      </div>

      {/* Mode */}
      <GlassCard className="p-5 mt-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Policy mode</div>
        <SegmentedControl
          options={[
            { label: 'Allowlist', value: 'allowlist' },
            { label: 'Wildcard (*)', value: 'wildcard' },
            { label: 'Disabled', value: 'disabled' },
          ]}
          value={policy.mode}
          onChange={(v) => patch({ mode: v as CorsMode }, `CORS mode set to ${v}`)}
        />
        <p className="text-[12px] text-fg-muted mt-2">
          {policy.mode === 'allowlist' && 'Only origins on the list below receive Access-Control-Allow-Origin.'}
          {policy.mode === 'wildcard' && (policy.allowCredentials ? 'All origins allowed — reflected per-request because credentials are on (“*” is invalid with credentials).' : 'All origins allowed via “*”.')}
          {policy.mode === 'disabled' && 'No CORS headers are sent — browsers will block cross-origin calls.'}
        </p>
      </GlassCard>

      {/* Origins (allowlist only) */}
      {policy.mode === 'allowlist' && (
        <GlassCard className="p-5 mt-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Allowed origins</div>
          {!readOnly && (
            <div className="flex gap-2 mb-3">
              <input value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOrigin(); }}
                placeholder="https://app.acme.com" className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
              <Button onClick={addOrigin} disabled={saving} className="shrink-0"><Plus className="w-4 h-4" /> Add</Button>
            </div>
          )}
          {policy.allowedOrigins.length === 0 ? (
            <div className="text-sm text-fg-muted py-4 text-center">No origins allowed — cross-origin browser calls will be blocked.</div>
          ) : (
            <ul className="space-y-1.5">
              {policy.allowedOrigins.map((o) => (
                <li key={o} className="flex items-center gap-3 bg-surface-2 border border-border rounded-xl px-3 py-2">
                  <Globe className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                  <span className="text-sm font-mono text-fg flex-1 truncate">{o}</span>
                  {!readOnly && (
                    <button onClick={() => removeOrigin(o)} disabled={saving} className="text-semantic-error/60 hover:text-semantic-error p-1 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      )}

      {/* Options */}
      <GlassCard className="p-5 mt-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Preflight options</div>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-bold text-fg">Allow credentials</div>
            <div className="text-[12px] text-fg-muted">Send Access-Control-Allow-Credentials — required for cookies / auth headers cross-origin.</div>
          </div>
          <button
            onClick={() => patch({ allowCredentials: !policy.allowCredentials })}
            disabled={readOnly || saving}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-50 ${policy.allowCredentials ? 'bg-teal' : 'bg-surface-2 border border-border'}`}
          >
            <div className={`w-5 h-5 bg-surface rounded-full shadow transform transition-transform ${policy.allowCredentials ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        <div className="border-t border-border-subtle pt-3 mt-1">
          <div className="text-sm font-bold text-fg mb-2">Allowed methods</div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_METHODS.map((m) => {
              const on = policy.allowedMethods.includes(m);
              return (
                <button key={m} onClick={() => toggleMethod(m)} disabled={readOnly || saving}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition-colors disabled:opacity-50 ${on ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-surface-2 text-fg-subtle hover:border-border-strong'}`}>
                  {on && <Check className="w-3 h-3 inline mr-0.5" />}{m}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-border-subtle pt-3 mt-3 flex items-center justify-between">
          <div className="text-sm font-bold text-fg">Preflight max-age</div>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={86400} value={policy.maxAgeSeconds} disabled={readOnly || saving}
              onChange={(e) => setPolicy({ ...policy, maxAgeSeconds: Number(e.target.value) })}
              onBlur={(e) => patch({ maxAgeSeconds: Number(e.target.value) })}
              className="w-24 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-fg font-mono text-right focus:border-teal outline-none disabled:opacity-50" />
            <span className="text-xs text-fg-subtle">sec</span>
          </div>
        </div>
      </GlassCard>

      {/* Live preflight tester */}
      <GlassCard className="p-5 mt-4 border-teal/20">
        <div className="flex items-center gap-2 mb-3">
          <ScanLine className="w-4 h-4 text-teal" />
          <div className="text-sm font-bold text-fg">Test an origin</div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Origin</span>
            <input value={testOrigin} onChange={(e) => setTestOrigin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
          </label>
          <Button onClick={runTest} disabled={testing} className="shrink-0">
            {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</> : <><ScanLine className="w-4 h-4" /> Preflight</>}
          </Button>
        </div>
        <AnimatePresence>
          {testResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
              <div className={`flex items-center gap-2 mb-2 ${testResult.allowed ? 'text-semantic-success' : 'text-semantic-error'}`}>
                {testResult.allowed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                <span className="text-sm font-bold">{testResult.allowed ? 'Allowed' : 'Blocked'}</span>
                <span className="text-[12px] text-fg-muted">— {testResult.reason}</span>
              </div>
              {Object.keys(testResult.headers).length > 0 ? (
                <pre className="text-[11px] leading-relaxed font-mono text-fg-muted bg-surface-2 border border-border rounded-xl p-3 overflow-auto">
{Object.entries(testResult.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
                </pre>
              ) : (
                <div className="text-[12px] text-fg-subtle bg-surface-2 border border-border rounded-xl p-3">No Access-Control-* headers are sent for this origin.</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-[11px] text-fg-subtle mt-3">This runs the real policy the gateway applies. See <Link href="/console/security" className="text-teal font-semibold hover:text-fg transition-colors">Security Hub <ArrowRight className="w-3 h-3 inline" /></Link> for IP and key controls.</p>
      </GlassCard>
    </div>
  );
}

export default function CorsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <CorsInner />
    </RoleGuard>
  );
}
