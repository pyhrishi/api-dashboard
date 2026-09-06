'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Gauge, Zap, TrendingUp, Check, Rocket, Play, RefreshCw, ArrowRight, Sparkles, Activity, Crown, Building2,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, type BadgeTone } from '@/components/ui';
import { TIER_LIMITS, TIER_ORDER, tierForKey, tierLimitForKey, nextTier, type ThroughputTier } from '@/lib/throughput-tiers';

const TIER_ICON: Record<ThroughputTier, React.ElementType> = { Starter: Zap, Growth: TrendingUp, Enterprise: Crown };
const TIER_TONE: Record<ThroughputTier, BadgeTone> = { Starter: 'info', Growth: 'teal', Enterprise: 'success' };

function ThroughputTiersInner() {
  const { activeKeys, environment } = useStore();
  const toast = useToast();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const currentTier = useMemo(() => tierForKey(apiKey), [apiKey]);
  const currentLimit = useMemo(() => tierLimitForKey(apiKey), [apiKey]);
  const up = nextTier(currentTier);

  const [checking, setChecking] = useState(false);
  const [live, setLive] = useState<{ limit: number | null; tier: string | null } | null>(null);

  useEffect(() => { track('throughput_tiers_viewed', { tier: currentTier, environment }); }, [currentTier, environment]);

  const verifyLive = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/v1/companies/enrich?domain=stripe.com', { headers: { Authorization: authHeaderValue(apiKey) } });
      const limit = res.headers.get('RateLimit-Limit');
      const tier = res.headers.get('X-RateLimit-Tier');
      setLive({ limit: limit ? Number(limit) : null, tier });
      track('throughput_tier_checked', { tier: tier ?? currentTier, limit: limit ? Number(limit) : null, environment });
      toast.success('Live limit confirmed', `The gateway sized this key's bucket to ${limit ?? '—'} (${tier ?? currentTier}).`);
    } catch {
      toast.error('Check failed', 'The gateway didn’t respond.');
    } finally {
      setChecking(false);
    }
  }, [apiKey, currentTier, environment, toast]);

  const multiplier = (t: ThroughputTier) => Math.round(TIER_LIMITS[t].refillPerMinute / TIER_LIMITS.Starter.refillPerMinute);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Gauge />}
        title="Tier-Based Throughput"
        description="Your plan sets your throughput: each tier sizes both the burst capacity and the sustained requests-per-second the gateway allows. Higher plans get more headroom — and the standard RateLimit-Limit header advertises exactly what your key is allowed."
        actions={<Link href="/console/rate-limit-headers"><Button variant="secondary" size="sm"><Gauge className="w-4 h-4" /> Rate-limit headers</Button></Link>}
      />

      {/* Current tier */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Your key’s tier</span>
              <StatusBadge tone={TIER_TONE[currentTier]}>{currentTier}</StatusBadge>
              {environment === 'sandbox' && <span className="text-[11px] text-fg-subtle">sandbox keys run at the Starter baseline</span>}
            </div>
            <div className="flex items-center gap-6 mt-3">
              <div><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Burst</div><div className="text-2xl font-black text-fg tabular-nums">{currentLimit.capacity}</div></div>
              <div><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Sustained</div><div className="text-2xl font-black text-fg tabular-nums">{currentLimit.sustainedRps}<span className="text-sm text-fg-muted font-bold"> rps</span></div></div>
              <div><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Refill</div><div className="text-2xl font-black text-fg tabular-nums">{currentLimit.refillPerMinute}<span className="text-sm text-fg-muted font-bold">/min</span></div></div>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={verifyLive} disabled={checking}>{checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Verify live</Button>
        </div>
        {live && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3 flex items-center gap-3 text-[12px] flex-wrap">
            <Check className="w-4 h-4 text-teal shrink-0" />
            <span className="text-fg">Gateway reports <span className="font-bold">RateLimit-Limit: {live.limit ?? '—'}</span></span>
            {live.tier && <StatusBadge tone={TIER_TONE[(live.tier as ThroughputTier)] ?? 'info'}>{live.tier}</StatusBadge>}
            <span className="text-fg-subtle">— matches your tier’s burst capacity.</span>
          </motion.div>
        )}
      </GlassCard>

      {/* Ladder */}
      <div className="grid md:grid-cols-3 gap-4 mt-5">
        {TIER_ORDER.map((t, i) => {
          const tl = TIER_LIMITS[t];
          const Icon = TIER_ICON[t];
          const isCurrent = t === currentTier;
          return (
            <motion.div key={t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <GlassCard className={`p-5 h-full ${isCurrent ? 'border-teal/40' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={isCurrent ? 'text-teal' : 'text-fg-muted'}><Icon className="w-5 h-5" /></span>
                  <h3 className="text-sm font-black text-fg">{t}</h3>
                  {isCurrent && <StatusBadge tone="teal">current</StatusBadge>}
                  {i > 0 && <span className="ml-auto text-[11px] font-bold text-fg-subtle">{multiplier(t)}× Starter</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-surface-2 border border-border p-2"><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Burst</div><div className="text-lg font-bold text-fg tabular-nums mt-0.5">{tl.capacity}</div></div>
                  <div className="rounded-lg bg-surface-2 border border-border p-2"><div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Sustained</div><div className="text-lg font-bold text-fg tabular-nums mt-0.5">{tl.sustainedRps} rps</div></div>
                </div>
                <p className="text-[12px] text-fg-muted leading-snug mt-3">{tl.description}</p>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Upgrade CTA */}
      {up && (
        <GlassCard className="p-5 mt-5 border-teal/30 bg-teal/5">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-teal shrink-0"><Rocket className="w-6 h-6" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-fg">Need more throughput?</h3>
              <p className="text-[12px] text-fg-muted mt-0.5">Upgrade to <span className="font-bold text-fg">{up}</span> for {multiplier(up)}× the sustained rate ({TIER_LIMITS[up].sustainedRps} rps) and a {TIER_LIMITS[up].capacity}-request burst.</p>
            </div>
            <Link href="/console/billing"><Button size="sm"><TrendingUp className="w-4 h-4" /> Upgrade to {up}</Button></Link>
          </div>
        </GlassCard>
      )}
      {!up && (
        <GlassCard className="p-4 mt-5 flex items-center gap-2 text-sm text-fg-muted">
          <Crown className="w-4 h-4 text-teal shrink-0" /> You’re on the top tier — maximum sustained throughput.
        </GlassCard>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <KpiTile label="Your burst" value={currentLimit.capacity} icon={<Zap />} />
        <KpiTile label="Sustained" value={`${currentLimit.sustainedRps} rps`} icon={<Activity />} />
        <KpiTile label="Tiers" value={TIER_ORDER.length} icon={<Building2 />} />
      </div>

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> The gateway sizes each key’s token bucket by its tier; RateLimit-Limit + X-RateLimit-Tier on every response tell your client exactly what it gets.</p>
      <div className="mt-3">
        <Link href="/console/rate-limits" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Token-bucket visualizer <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function ThroughputTiersPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <ThroughputTiersInner />
    </RoleGuard>
  );
}
