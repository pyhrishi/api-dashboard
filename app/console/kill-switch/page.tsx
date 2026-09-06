'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldOff, Ban, RotateCcw, Zap, Siren, RefreshCw, KeyRound, ShieldCheck,
} from 'lucide-react';
import { useStore, type MockKey } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, type BadgeTone } from '@/components/ui';

type Reason = 'compromised' | 'leaked' | 'rotated' | 'manual';
const REASONS: { id: Reason; label: string }[] = [
  { id: 'compromised', label: 'Compromised' }, { id: 'leaked', label: 'Leaked' },
  { id: 'rotated', label: 'Rotated out' }, { id: 'manual', label: 'Manual' },
];

interface KillSnapshot {
  blockedKeys: number;
  totalBlockedAttempts: number;
  keys: { key: string; reason: Reason; blockedAt: number; by: string; blockedAttempts: number }[];
  recentEvents: { key: string; reason: Reason; by: string; at: number; action: 'killed' | 'restored' }[];
}

const KILLED = ['revoked', 'compromised'];
const isKilled = (k: MockKey) => KILLED.includes(k.status || 'active');
const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 60) return `${s}s ago`; const m = Math.round(s / 60); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };
const REASON_TONE: Record<Reason, BadgeTone> = { compromised: 'error', leaked: 'error', rotated: 'warning', manual: 'info' };

async function syncBlock(activeKey: string, targetKey: string, reason: Reason, restore = false): Promise<void> {
  try {
    await fetch('/api/v1/keys/revoke', {
      method: restore ? 'DELETE' : 'POST',
      headers: { Authorization: authHeaderValue(activeKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: targetKey, reason, by: 'kill-switch' }),
    });
  } catch { /* best-effort */ }
}

function KillSwitchInner() {
  const { activeKeys, updateKey, user } = useStore();
  const environment = useStore((s) => s.environment);
  const toast = useToast();
  const opKey = useMemo(() => activeKeys.find(k => !isKilled(k))?.key ?? activeKeys[0]?.key ?? 'sk_test_ops', [activeKeys]);

  const [snapshot, setSnapshot] = useState<KillSnapshot | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reason, setReason] = useState<Reason>('compromised');
  const [busy, setBusy] = useState<string | null>(null);
  const [drillKeyId, setDrillKeyId] = useState<string>('');
  const [drillResult, setDrillResult] = useState<{ before: number | null; after: number | null } | null>(null);
  const [drilling, setDrilling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/keys/revoke', { headers: { Authorization: authHeaderValue(opKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error('Failed to load kill switch registry');
      setSnapshot(body.data as KillSnapshot);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [opKey]);

  useEffect(() => { track('kill_switch_viewed', { environment }); refresh(); }, [refresh, environment]);

  const kill = async (k: MockKey) => {
    setBusy(k.id);
    updateKey(k.id, { status: reason === 'compromised' || reason === 'leaked' ? 'compromised' : 'revoked' });
    await syncBlock(opKey, k.key, reason);
    track('key_killed', { reason, environment: k.environment });
    await refresh();
    setBusy(null);
    toast.success('Key killed', `${k.name} is revoked everywhere (${reason}). Any call now returns 401.`);
  };

  const restore = async (k: MockKey) => {
    setBusy(k.id);
    updateKey(k.id, { status: 'active' });
    await syncBlock(opKey, k.key, 'manual', true);
    track('key_restored', { environment: k.environment });
    await refresh();
    setBusy(null);
    toast.success('Key restored', `${k.name} is active again.`);
  };

  const runDrill = async () => {
    const target = activeKeys.find(k => k.id === drillKeyId) ?? activeKeys.find(k => !isKilled(k));
    if (!target) return;
    setDrilling(true); setDrillResult(null);
    try {
      const probe = () => fetch('/api/v1/companies/enrich?domain=stripe.com', { headers: { Authorization: authHeaderValue(target.key) } }).then(r => r.status);
      const before = await probe();
      updateKey(target.id, { status: 'compromised' });
      await syncBlock(opKey, target.key, 'leaked');
      const after = await probe();
      setDrillResult({ before, after });
      track('leak_drill_run', { before, after, environment });
      await refresh();
      toast.success('Leak drill complete', `Before kill: ${before}. After kill: ${after} (KEY_REVOKED).`);
    } catch {
      toast.error('Drill failed', 'The gateway didn’t respond.');
    } finally {
      setDrilling(false);
    }
  };

  const liveKeys = useMemo(() => activeKeys.filter(k => !isKilled(k)), [activeKeys]);
  const killedKeys = useMemo(() => activeKeys.filter(isKilled), [activeKeys]);

  if (phase === 'loading') {
    return <div className="max-w-[1100px] mx-auto"><div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[40rem] max-w-full" /></div><div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div></div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Siren />}
        title="Compromised-Key Kill Switch"
        description="Instantly revoke a leaked or compromised key everywhere — the gateway blocks it across REST, GraphQL, and gRPC in the same moment, returning 401 KEY_REVOKED on every call. Kill with a reason, verify the block live, and restore a false alarm."
        actions={<Link href="/console/keys"><Button variant="secondary" size="sm"><KeyRound className="w-4 h-4" /> API Keys</Button></Link>}
      />

      {phase === 'error' ? (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<ShieldAlert className="w-8 h-8" />} title="Couldn’t load the kill switch" description="The gateway didn’t respond. Check you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            <KpiTile label="Live keys" value={liveKeys.length} icon={<ShieldCheck />} />
            <KpiTile label="Killed keys" value={snapshot?.blockedKeys ?? killedKeys.length} icon={<ShieldOff />} hint="revoked everywhere" />
            <KpiTile label="Blocked attempts" value={snapshot?.totalBlockedAttempts ?? 0} icon={<Ban />} hint="calls rejected 401" />
          </div>

          {/* Leak drill */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Zap className="w-4 h-4 text-teal" /> Simulate a leak</h3>
                <p className="text-[12px] text-fg-muted mt-1 leading-snug">Fire a live call, kill the key, then fire again — watch the same key go from 200 to 401 KEY_REVOKED.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={drillKeyId} onChange={(e) => setDrillKeyId(e.target.value)} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1.5 focus:border-teal/50 outline-none">
                  <option value="">(first live key)</option>
                  {liveKeys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <Button onClick={runDrill} disabled={drilling || liveKeys.length === 0}>{drilling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Run drill</Button>
              </div>
            </div>
            <AnimatePresence>
              {drillResult && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                  <div className="rounded-xl border border-teal/30 bg-teal/5 p-4 flex items-center gap-4 flex-wrap text-2xl font-black tabular-nums">
                    <span className="text-semantic-success">{drillResult.before}</span>
                    <span className="text-fg-subtle text-base">before kill →</span>
                    <span className="text-semantic-error">{drillResult.after}</span>
                    <StatusBadge tone="error">KEY_REVOKED</StatusBadge>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Kill controls */}
          <div className="flex items-center justify-between mt-6 mb-3">
            <h3 className="text-sm font-bold text-fg">Keys</h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-fg-subtle">Kill reason:</span>
              <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1 focus:border-teal/50 outline-none">
                {REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {activeKeys.map((k) => {
              const killed = isKilled(k);
              return (
                <div key={k.id} className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${killed ? 'border-semantic-error/30 bg-semantic-error/5' : 'border-border bg-surface-2'}`}>
                  <span className={killed ? 'text-semantic-error' : 'text-semantic-success'}>{killed ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-fg flex items-center gap-2">{k.name} <StatusBadge tone={k.environment === 'live' ? 'teal' : 'warning'}>{k.environment}</StatusBadge></div>
                    <div className="font-mono text-[11px] text-fg-subtle mt-0.5">{k.prefix}••••</div>
                  </div>
                  {killed
                    ? <><StatusBadge tone="error">{k.status}</StatusBadge>{user?.role === 'admin' && <Button size="sm" variant="secondary" disabled={busy === k.id} onClick={() => restore(k)}><RotateCcw className="w-4 h-4" /> Restore</Button>}</>
                    : <RoleGuard allowedRoles={['admin']}><Button size="sm" variant="ghost" disabled={busy === k.id} onClick={() => kill(k)} className="text-semantic-error">{busy === k.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} Kill</Button></RoleGuard>}
                </div>
              );
            })}
          </div>

          {/* Recent kill events */}
          {snapshot && snapshot.recentEvents.length > 0 && (
            <div className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Recent kill events</div>
              <div className="space-y-2">
                {snapshot.recentEvents.slice(0, 10).map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-3.5 py-2 text-[12px]">
                    <span className={e.action === 'killed' ? 'text-semantic-error' : 'text-semantic-success'}>{e.action === 'killed' ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}</span>
                    <span className="font-mono text-fg-muted min-w-0 flex-1 truncate">{e.key}</span>
                    <StatusBadge tone={e.action === 'killed' ? REASON_TONE[e.reason] : 'success'}>{e.action === 'killed' ? e.reason : 'restored'}</StatusBadge>
                    <span className="text-fg-subtle">{e.by}</span>
                    <span className="text-fg-subtle tabular-nums w-16 text-right">{ago(e.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KillSwitchPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <KillSwitchInner />
    </RoleGuard>
  );
}
