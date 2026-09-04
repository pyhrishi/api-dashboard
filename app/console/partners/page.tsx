'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import { authHeaderValue } from '@/lib/api-config';
import type { PartnerRecord, PartnerDashboard, PartnerTier } from '@/lib/gateway/partnerRevenue';
import { Users, TrendingUp, Coins, Award, CheckCircle2, Clock, ArrowUpRight, Zap, Building2, AlertTriangle } from 'lucide-react';
import { PageHeader, KpiTile, GlassCard, EmptyState, StatusBadge, Button, Skeleton, type BadgeTone } from '@/components/ui';

const TIER: Record<PartnerTier, { label: string; tone: BadgeTone }> = {
  affiliate: { label: 'Affiliate', tone: 'neutral' },
  silver:    { label: 'Silver',    tone: 'neutral' },
  gold:      { label: 'Gold',      tone: 'warning' },
  platinum:  { label: 'Platinum',  tone: 'teal' },
  oem:       { label: 'OEM',       tone: 'info' },
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const relativeJoin = (ts: number) => {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days < 31) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
};

export default function PartnersPage() {
  const { activeKeys } = useStore();
  const apiKey = activeKeys[0]?.key || 'sk_live_partner_console';

  const [partners, setPartners] = useState<PartnerRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [payoutBanner, setPayoutBanner] = useState<string | null>(null);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, { ...init, headers: { Authorization: authHeaderValue(apiKey), ...(init?.headers || {}) } }),
    [apiKey]
  );

  const loadPartners = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/partner/list');
      const json = await res.json();
      if (json.success) {
        const list: PartnerRecord[] = json.data.partners;
        setPartners(list);
        setSelectedId(prev => prev ?? list[0]?.partnerId ?? null);
      } else {
        setListError(json.error?.message || 'Failed to load partners.');
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Network error reaching the partner API.');
    }
  }, [authFetch]);

  useEffect(() => { loadPartners(); }, [loadPartners]);

  useEffect(() => {
    if (!selectedId) { setDashboard(null); return; }
    let cancelled = false;
    setDashLoading(true);
    authFetch(`/api/v1/partner/dashboard?id=${selectedId}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setDashboard(j.success ? j.data : null); })
      .catch(() => { if (!cancelled) setDashboard(null); })
      .finally(() => { if (!cancelled) setDashLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, authFetch]);

  const handleProcessPayouts = async () => {
    setProcessing(true);
    setPayoutBanner(null);
    try {
      const res = await authFetch('/api/v1/partner/payout/process', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const total = json.data.payouts.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
        setPayoutBanner(`Processed ${json.data.payouts_processed} payout${json.data.payouts_processed === 1 ? '' : 's'} for ${usd(total)}.`);
        await loadPartners();
        if (selectedId) {
          const d = await authFetch(`/api/v1/partner/dashboard?id=${selectedId}`).then(r => r.json());
          if (d.success) setDashboard(d.data);
        }
      }
    } finally {
      setProcessing(false);
    }
  };

  const totalRevenue = partners?.reduce((s, p) => s + p.cumulativeRevenue, 0) ?? 0;
  const totalPending = partners?.reduce((s, p) => s + p.pendingPayout, 0) ?? 0;

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-8 animate-fade-in pb-12">
        <PageHeader
          icon={<Users />}
          title="Partner Program"
          description="Revenue-share economics for your B2B2B resellers and integration partners — tiers, commissions, referral attribution, and payouts."
          actions={
            <Button variant="secondary" icon={<Coins />} loading={processing} disabled={!partners} onClick={handleProcessPayouts}>
              {processing ? 'Processing…' : 'Process Month-End Payouts'}
            </Button>
          }
        />

        {payoutBanner && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-semantic-success/10 border border-semantic-success/20 text-semantic-success rounded-xl px-4 py-3 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" /> {payoutBanner}
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiTile label="Active Partners" value={partners ? partners.length : '—'} icon={<Building2 />} loading={!partners && !listError} />
          <KpiTile label="Lifetime Revenue Attributed" value={partners ? usd(totalRevenue) : '—'} icon={<TrendingUp />} loading={!partners && !listError} />
          <KpiTile label="Pending Payouts" value={partners ? usd(totalPending) : '—'} icon={<Coins />} loading={!partners && !listError} />
        </div>

        {listError && (
          <EmptyState tone="error" icon={<AlertTriangle />} title="Couldn't load partners" description={listError}
            action={<Button variant="secondary" onClick={() => { setListError(null); loadPartners(); }}>Retry</Button>} />
        )}

        {!listError && !partners && (
          <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-6">
            <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} variant="block" className="h-24" />)}</div>
            <Skeleton variant="block" className="h-96" />
          </div>
        )}

        {!listError && partners && partners.length === 0 && (
          <EmptyState icon={<Users />} title="No partners yet" description="Invite resellers and integration partners to start attributing referral revenue." />
        )}

        {!listError && partners && partners.length > 0 && (
          <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-6 items-start">
            <div className="space-y-3">
              {partners.map(p => {
                const tier = TIER[p.tier];
                const isSelected = p.partnerId === selectedId;
                return (
                  <GlassCard
                    key={p.partnerId}
                    padding="sm"
                    interactive
                    selected={isSelected}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(p.partnerId)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(p.partnerId); } }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-fg text-sm truncate pr-2">{p.name}</span>
                      <StatusBadge tone={tier.tone}>{tier.label}</StatusBadge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-fg-subtle">{p.referralCode}</span>
                      <span className="text-fg-muted">{usd(p.cumulativeRevenue)} <span className="text-fg-subtle">rev</span></span>
                    </div>
                    {p.pendingPayout > 0 && (
                      <div className="mt-2 text-[11px] font-bold text-amber-400 flex items-center gap-1">
                        <Coins className="w-3 h-3" /> {usd(p.pendingPayout)} pending
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>

            <GlassCard className="min-h-[24rem]">
              {dashLoading && (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-1/2" />
                  <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <Skeleton key={i} variant="block" className="h-16" />)}</div>
                  <Skeleton className="h-2 w-full" />
                  <Skeleton variant="block" className="h-32" />
                </div>
              )}
              {!dashLoading && dashboard && <PartnerDetail dashboard={dashboard} />}
              {!dashLoading && !dashboard && (
                <div className="flex flex-col items-center justify-center h-80 text-center text-fg-muted">
                  <Users className="w-10 h-10 text-fg-subtle mb-3" />
                  Select a partner to view their revenue dashboard.
                </div>
              )}
            </GlassCard>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

function PartnerDetail({ dashboard }: { dashboard: PartnerDashboard }) {
  const { partner, thisMonthRevenue, thisMonthEarnings, projectedPayout, recentEvents, pendingPayouts, acceleratorUnlocked, nextTierAt } = dashboard;
  const tier = TIER[partner.tier];
  const cfg = partner.commissionConfig;

  const tierProgress = nextTierAt && nextTierAt > 0
    ? Math.min(100, Math.round((partner.cumulativeRevenue / nextTierAt) * 100))
    : 100;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-extrabold text-fg">{partner.name}</h3>
            <StatusBadge tone={tier.tone}>{tier.label}</StatusBadge>
            {acceleratorUnlocked && <StatusBadge tone="teal"><Zap className="w-3 h-3" /> Accelerator</StatusBadge>}
          </div>
          <p className="text-xs text-fg-muted mt-1 font-mono">{partner.referralCode} · joined {relativeJoin(partner.joinedAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Commission</div>
          <div className="text-sm font-bold text-fg">
            {cfg.type === 'flat_per_call'
              ? `${usd(cfg.flatRatePerCredit || 0)}/credit`
              : `${Math.round(cfg.rate * 100)}%${acceleratorUnlocked && cfg.acceleratorBonus ? ` +${Math.round(cfg.acceleratorBonus * 100)}%` : ''}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'MTD Revenue', value: usd(thisMonthRevenue) },
          { label: 'MTD Earnings', value: usd(thisMonthEarnings) },
          { label: 'Projected Payout', value: usd(projectedPayout) },
        ].map(k => (
          <div key={k.label} className="bg-glass border border-border-subtle rounded-xl p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">{k.label}</div>
            <div className="text-lg font-extrabold text-fg tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      {nextTierAt && nextTierAt > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-fg-muted flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-teal" /> Progress to next tier</span>
            <span className="text-fg font-semibold">{usd(partner.cumulativeRevenue)} / {usd(nextTierAt)}</span>
          </div>
          <div className="h-2 rounded-full bg-overlay overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${tierProgress}%` }} className="h-full rounded-full bg-gradient-to-r from-teal to-teal-ice" />
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-3">Recent Revenue Events</h4>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-fg-subtle">No revenue events recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentEvents.slice(0, 6).map(ev => (
              <div key={ev.eventId} className="flex items-center justify-between bg-glass border border-border-subtle rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-fg font-medium capitalize">{ev.eventType.replace(/_/g, ' ')}</div>
                  <div className="text-[11px] text-fg-subtle font-mono truncate">{ev.referredApiKey}</div>
                </div>
                <div className="text-right shrink-0 pl-3">
                  <div className="text-sm font-bold text-fg">{usd(ev.grossRevenue)}</div>
                  <div className="text-[11px] text-teal flex items-center gap-1 justify-end"><ArrowUpRight className="w-3 h-3" /> {usd(ev.commissionEarned)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-3">Pending Payouts</h4>
        {pendingPayouts.length === 0 ? (
          <p className="text-sm text-fg-subtle">No payouts awaiting processing.</p>
        ) : (
          <div className="space-y-2">
            {pendingPayouts.map(po => (
              <div key={po.payoutId} className="flex items-center justify-between bg-glass border border-border-subtle rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-fg-muted">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-mono text-xs">{po.payoutId}</span>
                  <StatusBadge tone="warning">{po.status}</StatusBadge>
                </div>
                <div className="text-sm font-bold text-fg">{usd(po.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
