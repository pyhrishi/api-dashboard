'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet, Gauge, TrendingDown, Flame, AlertTriangle, RefreshCw, ArrowRight, Sparkles, CreditCard } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, SegmentedControl, Skeleton, type BadgeTone } from '@/components/ui';
import { generateCohort, type BurnBucket, type CohortAccount } from '@/lib/funnel';
import { useWallet, BUCKET_ACTION, isLowBalance, RELOAD_AMOUNTS } from '@/lib/wallet';

const COHORT_SEED = 'zinbit-funnel-2026';
const BUCKET_TONE: Record<BurnBucket, BadgeTone> = { balanced: 'success', slow: 'info', fast: 'warning' };
const BUCKETS: BurnBucket[] = ['balanced', 'slow', 'fast'];

function WalletHealthInner() {
  const { activeKeys } = useStore();
  const toast = useToast();
  const liveKey = useMemo(() => activeKeys.find((k) => k.key.startsWith('sk_live_'))?.key ?? 'sk_live_trial_demo', [activeKeys]);
  const wallet = useWallet();

  const [now] = useState(() => Date.now());
  const [paid, setPaid] = useState<number | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    track('wallet_health_viewed', {});
    fetch('/api/v1/credits', { headers: { Authorization: authHeaderValue(liveKey) }, cache: 'no-store' })
      .then((r) => r.json()).then((b) => { setPaid(b?.data?.paid ?? 0); setPhase('ready'); })
      .catch(() => { setPaid(0); setPhase('ready'); });
  }, [liveKey]);

  const cohort = useMemo(() => generateCohort(COHORT_SEED, 240, now), [now]);
  const paidCohort = useMemo(() => cohort.filter((a) => a.paid && a.burnBucket), [cohort]);
  const byBucket = useMemo(() => {
    const m: Record<BurnBucket, CohortAccount[]> = { balanced: [], slow: [], fast: [] };
    paidCohort.forEach((a) => { if (a.burnBucket) m[a.burnBucket].push(a); });
    return m;
  }, [paidCohort]);

  const lowBalance = paid !== null && isLowBalance(paid, wallet.threshold);

  const configureReload = (on: boolean) => {
    wallet.setAutoReloadEnabled(on);
    track('auto_reload_configured', { enabled: on, threshold: wallet.threshold, amount: wallet.amount });
    toast.success(on ? 'Auto-reload on' : 'Auto-reload off', on ? `We’ll add ${wallet.amount.toLocaleString()} credits when you hit ${wallet.threshold.toLocaleString()}.` : 'Balance will not auto-reload.');
  };
  const nudgeFeature = useCallback((a: CohortAccount) => { track('feature_discovery_nudged', { account: a.id }); toast.success('Feature nudge sent', `${a.name} — suggested endpoints they haven’t tried.`); }, [toast]);
  const alertLow = useCallback((a: CohortAccount) => { track('low_balance_alert_actioned', { account: a.id }); toast.success('Low-balance alert + auto-reload offer sent', `${a.name}`); }, [toast]);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Wallet />}
        title="Wallet Health"
        description="Once accounts are paying, we watch how their balance burns against time — balanced, slow, or fast — and act: auto-reload for heavy users, feature-discovery for slow burners, and low-balance alerts before anyone depletes mid-production."
        actions={<Link href="/console/lifecycle"><StatusBadge tone="info"><Sparkles className="w-3.5 h-3.5" /> Lifecycle</StatusBadge></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Paid accounts" value={paidCohort.length} icon={<CreditCard />} />
        <KpiTile label="Balanced" value={byBucket.balanced.length} icon={<Gauge />} hint="healthy" />
        <KpiTile label="Slow burn" value={byBucket.slow.length} icon={<TrendingDown />} hint="feature nudge" />
        <KpiTile label="Fast burn" value={byBucket.fast.length} icon={<Flame />} hint="auto-reload" />
      </div>

      {/* Your wallet + auto-reload */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-3"><Wallet className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Your wallet</h3>{lowBalance && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> Low balance</StatusBadge>}</div>
        {phase === 'loading' ? <Skeleton className="h-16 rounded-xl" /> : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Paid balance</div>
              <div className="text-2xl font-bold text-fg mt-1">{(paid ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-fg-subtle mt-1">credits</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-teal" /><span className="text-[13px] font-bold text-fg">Auto-reload</span></div>
                <SegmentedControl options={[{ label: 'Off', value: 'off' }, { label: 'On', value: 'on' }]} value={wallet.autoReloadEnabled ? 'on' : 'off'} onChange={(v) => configureReload(v === 'on')} />
              </div>
              <div className="flex items-center gap-3 flex-wrap text-[12px] text-fg-muted">
                <label className="flex items-center gap-1.5">When balance ≤
                  <input type="number" value={wallet.threshold} onChange={(e) => wallet.setThreshold(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-fg outline-none focus:border-teal/50" />
                </label>
                <label className="flex items-center gap-1.5">add
                  <select value={wallet.amount} onChange={(e) => wallet.setAmount(Number(e.target.value))} className="rounded-lg border border-border bg-surface px-2 py-1 text-fg outline-none cursor-pointer">
                    {RELOAD_AMOUNTS.map((a) => <option key={a} value={a}>{a.toLocaleString()}</option>)}
                  </select>
                  credits
                </label>
              </div>
              {lowBalance && <p className="text-[11px] text-semantic-error mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Balance at/under your threshold{wallet.autoReloadEnabled ? ' — auto-reload will top up.' : ' — enable auto-reload to avoid depletion.'}</p>}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Burn distribution */}
      <h3 className="text-sm font-bold text-fg flex items-center gap-2 mt-6 mb-3"><Gauge className="w-4 h-4" /> Burn distribution</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {BUCKETS.map((b) => {
          const meta = BUCKET_ACTION[b];
          return (
            <GlassCard key={b} className="p-4">
              <div className="flex items-center justify-between mb-1"><StatusBadge tone={BUCKET_TONE[b]}>{meta.label}</StatusBadge><span className="text-[15px] font-bold text-fg">{byBucket[b].length}</span></div>
              <p className="text-[11px] text-fg-muted mb-2">{meta.action}</p>
              <div className="space-y-1">
                {byBucket[b].slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-[11px] text-fg-muted">
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-fg-subtle">{a.runwayDays !== null ? `${a.runwayDays}d` : '—'}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Fast-burn watchlist */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Flame className="w-4 h-4" /> Fast burn — low-balance risk</h3>
        <StatusBadge tone="warning">{byBucket.fast.length} heavy users</StatusBadge>
      </div>
      <GlassCard className="p-3">
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {byBucket.fast.slice(0, 20).map((a) => (
            <div key={a.id} className="rounded-xl border border-semantic-warning/25 bg-semantic-warning/5 px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{a.name}</span>
              <span className="text-[11px] text-fg-subtle">{a.walletBalance.toLocaleString()} cr · {a.runwayDays ?? '—'}d runway</span>
              <Button size="sm" variant="ghost" onClick={() => alertLow(a)}><RefreshCw className="w-3.5 h-3.5" /> Alert + offer auto-reload</Button>
            </div>
          ))}
          {byBucket.fast.length === 0 && <p className="text-[12px] text-fg-subtle p-3">No fast-burn accounts right now.</p>}
        </div>
      </GlassCard>

      {/* Slow-burn watchlist */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Slow burn — feature discovery</h3>
        <StatusBadge tone="info">{byBucket.slow.length} to nudge</StatusBadge>
      </div>
      <GlassCard className="p-3">
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {byBucket.slow.slice(0, 20).map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{a.name}</span>
              <span className="text-[11px] text-fg-subtle">{a.runwayDays ?? '—'}d runway · low volume</span>
              <Button size="sm" variant="ghost" onClick={() => nudgeFeature(a)}><Sparkles className="w-3.5 h-3.5" /> Send feature nudge</Button>
            </div>
          ))}
          {byBucket.slow.length === 0 && <p className="text-[12px] text-fg-subtle p-3">No slow-burn accounts right now.</p>}
        </div>
      </GlassCard>

      <div className="mt-4 flex items-center gap-4">
        <Link href="/console/lifecycle" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Lifecycle <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/billing" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Billing <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function WalletHealthPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <WalletHealthInner />
    </RoleGuard>
  );
}
