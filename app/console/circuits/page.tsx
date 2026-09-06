'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, ShieldCheck, ShieldAlert, Activity, RefreshCw, Power, RotateCcw, AlertTriangle, Clock, ArrowRight,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, type BadgeTone,
} from '@/components/ui';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitView {
  id: string;
  name: string;
  category: 'first-party' | 'registry' | 'partner' | 'derived';
  description: string;
  state: CircuitState;
  failureRate: number;
  totalRequests: number;
  totalFailures: number;
  trippedCount: number;
  cooldownRemainingMs: number;
  forced: 'OPEN' | 'CLOSED' | null;
  powers: string[];
}
interface CircuitsResponse {
  upstreams: CircuitView[];
  healthy: number;
  degraded: number;
  availability: number;
}

const STATE_META: Record<CircuitState, { tone: BadgeTone; label: string; icon: React.ElementType }> = {
  CLOSED: { tone: 'success', label: 'Healthy', icon: ShieldCheck },
  HALF_OPEN: { tone: 'warning', label: 'Recovering', icon: Activity },
  OPEN: { tone: 'error', label: 'Tripped', icon: ShieldAlert },
};

const CATEGORY_TONE: Record<CircuitView['category'], BadgeTone> = {
  'first-party': 'teal', registry: 'success', partner: 'info', derived: 'warning',
};

function CircuitsInner() {
  const { activeKeys, environment, user } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<CircuitsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/circuits', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to load circuits');
      setData(body.data as CircuitsResponse);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [apiKey]);

  useEffect(() => {
    track('circuits_viewed', { environment });
    refresh();
  }, [refresh, environment]);

  // Live cooldown countdowns.
  useEffect(() => {
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  const force = async (upstream: string, mode: 'OPEN' | 'auto') => {
    setBusy(upstream);
    try {
      const res = await fetch('/api/v1/circuits', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to update circuit');
      track('circuit_forced', { upstream, mode, environment });
      toast.success(mode === 'OPEN' ? 'Upstream draining' : 'Circuit reset', mode === 'OPEN'
        ? `${upstream} is forced OPEN — dependent endpoints now shed load.`
        : `${upstream} is back to automatic health checks.`);
      await refresh();
    } catch (e) {
      toast.error('Could not update circuit', e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBusy(null);
    }
  };

  if (phase === 'loading') return <CircuitsSkeleton />;

  if (phase === 'error') {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader icon={<Zap />} title="Circuit Breakers" description="Per-upstream failure isolation — one flaky data source sheds load without taking down the rest." />
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load circuit state"
            description="The gateway didn’t respond. Check you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); refresh(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<Zap />}
        title="Circuit Breakers"
        description="Every endpoint depends on an upstream data provider. Each upstream has its own breaker: consecutive failures trip it OPEN so dependent endpoints shed load (503 + Retry-After), then it probes recovery. One flaky upstream never takes down the rest of the API."
        actions={<Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Upstreams" value={d.upstreams.length} icon={<Activity />} />
        <KpiTile label="Healthy" value={d.healthy} icon={<ShieldCheck />} />
        <KpiTile label="Degraded" value={d.degraded} icon={<ShieldAlert />} hint={d.degraded > 0 ? 'shedding load' : 'all clear'} />
        <KpiTile label="Availability" value={`${Math.round(d.availability * 100)}%`} icon={<Zap />} />
      </div>

      <AnimatePresence>
        {d.degraded > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
            <GlassCard className="p-4 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
              <span className="text-semantic-error shrink-0"><ShieldAlert className="w-5 h-5" /></span>
              <p className="text-sm text-fg-muted">
                <span className="font-bold text-fg">{d.degraded} upstream{d.degraded === 1 ? '' : 's'}</span> {d.degraded === 1 ? 'is' : 'are'} shedding load. Endpoints that depend on {d.degraded === 1 ? 'it' : 'them'} return 503 with a Retry-After; everything else keeps serving normally.
              </p>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {d.upstreams.map((u, i) => {
          const meta = STATE_META[u.state];
          const Icon = meta.icon;
          return (
            <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
              <GlassCard className={`p-5 h-full ${u.state === 'OPEN' ? 'border-semantic-error/30' : u.state === 'HALF_OPEN' ? 'border-semantic-warning/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${meta.tone === 'success' ? 'text-semantic-success' : meta.tone === 'warning' ? 'text-semantic-warning' : 'text-semantic-error'}`}><Icon className="w-4 h-4" /></span>
                      <h3 className="text-sm font-black text-fg truncate">{u.name}</h3>
                      <StatusBadge tone={CATEGORY_TONE[u.category]}>{u.category}</StatusBadge>
                    </div>
                    <p className="text-[12px] text-fg-muted mt-1 leading-snug">{u.description}</p>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}{u.forced ? ' · forced' : ''}</StatusBadge>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-surface-2 border border-border p-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Fail rate</div>
                    <div className="text-sm font-bold text-fg tabular-nums mt-0.5">{Math.round(u.failureRate * 100)}%</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 border border-border p-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Requests</div>
                    <div className="text-sm font-bold text-fg tabular-nums mt-0.5">{u.totalRequests}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 border border-border p-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Trips</div>
                    <div className="text-sm font-bold text-fg tabular-nums mt-0.5">{u.trippedCount}</div>
                  </div>
                </div>

                {u.state === 'OPEN' && u.cooldownRemainingMs > 0 && !u.forced && (
                  <div className="mt-3 text-[11px] text-semantic-warning flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Probes recovery in {Math.ceil(u.cooldownRemainingMs / 1000)}s
                  </div>
                )}

                <div className="mt-3 text-[11px] text-fg-subtle">
                  Powers {u.powers.length} endpoint{u.powers.length === 1 ? '' : 's'}
                  {u.powers.length > 0 && <span className="text-fg-muted">: {u.powers.slice(0, 3).join(', ')}{u.powers.length > 3 ? `, +${u.powers.length - 3}` : ''}</span>}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                    {u.forced === 'OPEN' || u.state === 'OPEN' ? (
                      <Button size="sm" variant="secondary" disabled={busy === u.id} onClick={() => force(u.id, 'auto')}>
                        <RotateCcw className="w-4 h-4" /> Reset
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy === u.id} onClick={() => force(u.id, 'OPEN')}>
                        <Power className="w-4 h-4" /> Force open (drain)
                      </Button>
                    )}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/console/infrastructure" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
          Infrastructure health <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
          503s in Logs <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function CircuitsSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function CircuitsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <CircuitsInner />
    </RoleGuard>
  );
}
