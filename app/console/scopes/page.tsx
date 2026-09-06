'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, Key, Lock, Play, RefreshCw, Check, X, Search, Sparkles, KeyRound,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, type BadgeTone } from '@/components/ui';
import { SCOPE_CATALOG, scopeForEndpoint, keyHasScope, isUnrestricted, scopeLabel, type ScopeCategory } from '@/lib/scopes';
import { ENDPOINTS } from '@/data/endpoints';

interface RegistrySnapshot {
  registeredKeys: number;
  restrictedKeys: number;
  checksPerformed: number;
  denials: number;
  keys: { key: string; scopes: string[]; restricted: boolean; registeredAt: number }[];
}

// Live probes — real GET calls that prove enforcement (200 in-scope, 403 out-of-scope).
const PROBES = [
  { label: 'Company enrich', scope: 'corporate:read', qs: '/v1/companies/enrich?domain=stripe.com' },
  { label: 'Person phone', scope: 'identity:read', qs: '/v1/people/phone?email=jane.doe@acme.com' },
  { label: 'Reverse enrich', scope: 'search:execute', qs: '/v1/enrichment/reverse?query=stripe.com' },
  { label: 'Currency normalize', scope: 'enrich:read', qs: '/v1/currency/normalize?value=%241M' },
];

const CAT_TONE: Record<ScopeCategory, BadgeTone> = { identity: 'info', corporate: 'teal', search: 'success', enrich: 'warning', write: 'error' };

interface ProbeResult { label: string; scope: string; status: number; allowed: boolean; requiredScope: string | null; }

function ScopesInner() {
  const { activeKeys, environment } = useStore();
  const toast = useToast();

  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<ProbeResult[]>([]);
  const [filter, setFilter] = useState('');

  const selectedKey = useMemo(() => activeKeys.find(k => k.id === selectedKeyId) ?? activeKeys[0], [activeKeys, selectedKeyId]);

  const refresh = useCallback(async () => {
    try {
      const anyKey = activeKeys[0]?.key ?? '';
      const res = await fetch('/api/v1/keys/scopes', { headers: { Authorization: authHeaderValue(anyKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error('Failed to load scope registry');
      setSnapshot(body.data as RegistrySnapshot);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [activeKeys]);

  useEffect(() => { track('scopes_viewed', { environment }); refresh(); }, [refresh, environment]);

  const runProbes = async () => {
    if (!selectedKey) return;
    setProbing(true);
    setProbeResults([]);
    try {
      const results: ProbeResult[] = [];
      for (const p of PROBES) {
        const res = await fetch(`/api/v1${p.qs.replace('/v1', '')}`, { headers: { Authorization: authHeaderValue(selectedKey.key) } });
        results.push({ label: p.label, scope: p.scope, status: res.status, allowed: res.status !== 403, requiredScope: res.headers.get('X-Required-Scope') || p.scope });
      }
      setProbeResults(results);
      const denied = results.filter(r => !r.allowed).length;
      track('scope_probe_run', { keyScopes: selectedKey.scopes.join(','), probes: results.length, denied, environment });
      toast.success('Probes complete', denied === 0 ? 'All probes allowed for this key.' : `${denied} of ${results.length} probes denied by scope.`);
      await refresh();
    } catch {
      toast.error('Probe failed', 'The gateway didn’t respond.');
    } finally {
      setProbing(false);
    }
  };

  const catalog = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return ENDPOINTS
      .filter((e) => !q || e.path.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .map((e) => ({ id: e.id, name: e.name, path: e.path, method: e.method, required: scopeForEndpoint(e) }));
  }, [filter]);

  if (phase === 'loading') {
    return (
      <div className="max-w-[1150px] mx-auto">
        <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[40rem] max-w-full" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1150px] mx-auto pb-16">
      <PageHeader
        icon={<ShieldCheck />}
        title="Scoped Key Permissions"
        description="Restrict an API key to the exact scopes it needs — the gateway enforces least privilege, rejecting any call outside a key's scopes with 403 INSUFFICIENT_SCOPE. This is what the console shows and what the gateway checks, from one shared catalog. Grant scopes on a key in API Keys; test enforcement live here."
        actions={<Link href="/console/keys"><Button variant="secondary" size="sm"><Key className="w-4 h-4" /> API Keys</Button></Link>}
      />

      {phase === 'error' ? (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<ShieldAlert className="w-8 h-8" />} title="Couldn’t load the scope registry" description="The gateway didn’t respond. Check you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Registered keys" value={snapshot?.registeredKeys ?? 0} icon={<Key />} />
            <KpiTile label="Restricted keys" value={snapshot?.restrictedKeys ?? 0} icon={<Lock />} hint="least privilege" />
            <KpiTile label="Scope checks" value={snapshot?.checksPerformed ?? 0} icon={<ShieldCheck />} />
            <KpiTile label="Denials (403)" value={snapshot?.denials ?? 0} icon={<ShieldAlert />} hint={snapshot && snapshot.denials > 0 ? 'enforcement working' : 'none yet'} />
          </div>

          <div className="grid lg:grid-cols-[1fr_400px] gap-5 mt-5">
            {/* Left: scope catalog + endpoint matrix */}
            <div className="space-y-5">
              <GlassCard className="p-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Scope catalog</div>
                <div className="space-y-2">
                  {SCOPE_CATALOG.map((s) => (
                    <div key={s.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
                      <StatusBadge tone={CAT_TONE[s.category]}>{s.category}</StatusBadge>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[12px] font-bold text-fg">{s.id}</span>
                        <p className="text-[11.5px] text-fg-muted leading-snug mt-0.5">{s.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Endpoint → required scope</span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter endpoints" className="text-[11px] rounded-lg border border-border bg-surface-2 text-fg pl-7 pr-2 py-1 w-40 focus:border-teal/50 outline-none" />
                  </div>
                </div>
                <div className="max-h-[24rem] overflow-y-auto -mx-1 px-1">
                  <ul className="space-y-1">
                    {catalog.map((e) => {
                      const allowed = selectedKey ? keyHasScope(selectedKey.scopes, e.required) : true;
                      return (
                        <li key={e.id} className="flex items-center gap-2.5 text-[11.5px] py-1">
                          <span className={`shrink-0 ${selectedKey && !allowed ? 'text-semantic-error' : 'text-semantic-success'}`}>
                            {selectedKey ? (allowed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />) : <span className="w-3.5 inline-block" />}
                          </span>
                          <span className="font-mono text-fg-muted min-w-0 flex-1 truncate">{e.method} {e.path}</span>
                          {e.required ? <StatusBadge tone="neutral">{e.required}</StatusBadge> : <span className="text-[10px] text-fg-subtle">public</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {selectedKey && <p className="text-[10.5px] text-fg-subtle mt-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> ✓/✗ reflects <span className="font-mono">{selectedKey.name}</span>’s scopes against each endpoint.</p>}
              </GlassCard>
            </div>

            {/* Right: live key tester */}
            <div className="space-y-4">
              <GlassCard className="p-5">
                <h3 className="text-sm font-bold text-fg flex items-center gap-2"><KeyRound className="w-4 h-4 text-teal" /> Test a key live</h3>
                <p className="text-[12px] text-fg-muted mt-1 leading-snug">Fire real requests with a key and watch the gateway allow or deny by scope.</p>
                <select value={selectedKey?.id ?? ''} onChange={(e) => setSelectedKeyId(e.target.value)} className="w-full mt-3 text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2.5 py-2 focus:border-teal/50 outline-none">
                  {activeKeys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.environment})</option>)}
                </select>
                {selectedKey && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Scopes:</span>
                    {isUnrestricted(selectedKey.scopes)
                      ? <StatusBadge tone="warning">full access ({selectedKey.scopes.join(', ') || '—'})</StatusBadge>
                      : selectedKey.scopes.map((s) => <StatusBadge key={s} tone="info">{scopeLabel(s)}</StatusBadge>)}
                  </div>
                )}
                <Button className="w-full mt-4" onClick={runProbes} disabled={probing || !selectedKey}>{probing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run probes</Button>

                {probeResults.length > 0 && (
                  <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
                    {probeResults.map((r) => (
                      <li key={r.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px] ${r.allowed ? 'border-semantic-success/30 bg-semantic-success/5' : 'border-semantic-error/30 bg-semantic-error/5'}`}>
                        <span className={r.allowed ? 'text-semantic-success' : 'text-semantic-error'}>{r.allowed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}</span>
                        <span className="min-w-0 flex-1 truncate text-fg">{r.label}</span>
                        <StatusBadge tone="neutral">{r.scope}</StatusBadge>
                        <StatusBadge tone={r.allowed ? 'success' : 'error'}>{r.status}</StatusBadge>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </GlassCard>

              {snapshot && snapshot.keys.length > 0 && (
                <GlassCard className="p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Gateway registry</div>
                  <ul className="space-y-1.5">
                    {snapshot.keys.slice(0, 8).map((k, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-fg-muted min-w-0 flex-1 truncate">{k.key}</span>
                        {k.restricted ? <StatusBadge tone="info">{k.scopes.length} scope{k.scopes.length === 1 ? '' : 's'}</StatusBadge> : <StatusBadge tone="warning">full</StatusBadge>}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}

              <p className="text-[11px] text-fg-subtle flex items-center gap-1"><Sparkles className="w-3 h-3" /> Restrict a key in <Link href="/console/keys" className="text-teal hover:underline">API Keys</Link>, then re-run probes to watch it get 403’d.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ScopesPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <ScopesInner />
    </RoleGuard>
  );
}
