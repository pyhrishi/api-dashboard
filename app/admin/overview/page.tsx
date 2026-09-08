'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Activity, Wallet, KeyRound, Inbox, Handshake, Eye, ArrowRight, AlertTriangle, LayoutDashboard, Siren } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, KpiTile, GlassCard, Skeleton, StatusBadge, EmptyState, Button } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, KeyIdentity } from '@/components/admin/shared';
import { STAGE_LABEL, type FunnelSummary, type WalletSnapshot, type KeyInsight } from '@/lib/admin/types';

interface Overview {
  customers: number; activeTrials: number; paying: number; walletsBelowTenPct: number; walletsAtZero: number; keysNearExpiryInUse: number;
  openAccessRequests: number; newHandoffs: number; calls24h: number; credits24h: number; funnel: FunnelSummary; firingAlerts: number; criticalAlerts: number;
  walletFlags: (WalletSnapshot & { customerName: string })[]; keyInsights: KeyInsight[]; activeSessions: number; previewCustomers: { id: string; name: string }[];
}
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

export default function OverviewPage() {
  const router = useRouter();
  const { state, reload } = useLoad<Overview>('overview');
  const loading = state.status === 'loading';
  const d = state.status === 'ok' ? state.data : null;
  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<LayoutDashboard />} title="Operator home" description="Everything that needs a human today across every B2B2B customer: wallets running dry, keys about to expire while in use, open access requests and fresh sales handoffs." />
      {d && d.firingAlerts > 0 && (
        <motion.div {...SECTION} className="mt-6">
          <Link href="/admin/alerts" className="block rounded-xl border border-semantic-error/30 bg-semantic-error/5 px-4 py-3 hover:border-semantic-error/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
            <div className="flex items-center gap-3 flex-wrap">
              <Siren className="w-5 h-5 text-semantic-error shrink-0" />
              <span className="text-sm text-fg"><span className="font-bold">{d.firingAlerts} operational alert{d.firingAlerts === 1 ? '' : 's'} firing</span>{d.criticalAlerts > 0 ? ` · ${d.criticalAlerts} critical` : ''} — routed to ops, finance and sales.</span>
              <span className="ml-auto text-[11px] font-bold text-teal inline-flex items-center gap-1">Open alerts <ArrowRight className="w-3 h-3" /></span>
            </div>
          </Link>
        </motion.div>
      )}
      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={loading} label="Customers" value={d ? d.customers : ''} icon={<Building2 />} hint={d ? `${d.paying} paying · ${d.activeTrials} active trials` : ''} />
            <KpiTile loading={loading} label="Calls (24h)" value={d ? fmt.n(d.calls24h) : ''} icon={<Activity />} hint={d ? `${fmt.n(d.credits24h)} credits consumed` : ''} />
            <KpiTile loading={loading} label="Wallets flagged" value={d ? d.walletsBelowTenPct + d.walletsAtZero : ''} icon={<Wallet />} hint={d ? `${d.walletsAtZero} at zero · ${d.walletsBelowTenPct} below 10%` : ''} lowerIsBetter />
            <KpiTile loading={loading} label="Keys expiring in use" value={d ? d.keysNearExpiryInUse : ''} icon={<KeyRound />} hint="≤ 14 days, used this week" lowerIsBetter />
          </motion.div>
          <motion.div {...SECTION} transition={{ delay: 0.04 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <KpiTile loading={loading} label="Open access requests" value={d ? d.openAccessRequests : ''} icon={<Inbox />} hint="awaiting a decision" />
            <KpiTile loading={loading} label="New sales handoffs" value={d ? d.newHandoffs : ''} icon={<Handshake />} hint="triggers fired, not yet contacted" />
            <KpiTile loading={loading} label="Active previews" value={d ? d.activeSessions : ''} icon={<Eye />} hint={d && d.previewCustomers.length ? `viewing as ${d.previewCustomers.map((p) => p.name).join(', ')}` : 'operators viewing as a customer'} />
            <KpiTile loading={loading} label="Activated ≤ 10 min" value={d ? fmt.pct(d.funnel.timeToActivateMinutes.underTenMinPct) : ''} icon={<Activity />} hint={d ? `median ${d.funnel.timeToActivateMinutes.median ?? '—'} min · n=${d.funnel.timeToActivateMinutes.sample}` : ''} />
          </motion.div>

          <motion.div {...SECTION} transition={{ delay: 0.08 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
            <GlassCard className="p-5 lg:col-span-1">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-fg">Funnel · all customers</h3><Link href="/admin/funnel" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Details <ArrowRight className="w-3 h-3" /></Link></div>
              {!d ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 rounded-lg" />)}</div> : (
                <ul className="space-y-2">{d.funnel.stages.map((s) => (
                  <li key={s.stage}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5"><span className="text-fg font-bold">{STAGE_LABEL[s.stage]} <span className="text-fg-subtle font-normal">· {s.band}</span></span><span className="text-fg-muted">{s.count}{s.dropOffPct !== null ? ` · −${s.dropOffPct}%` : ''}</span></div>
                    <div className="h-2 rounded-full bg-glass overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${d.funnel.total ? (s.count / d.funnel.total) * 100 : 0}%` }} transition={{ duration: 0.5 }} className="h-full rounded-full bg-teal" /></div>
                  </li>
                ))}</ul>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-fg">Wallet insights</h3><Link href="/admin/wallets" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">All wallets <ArrowRight className="w-3 h-3" /></Link></div>
              {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : d.walletFlags.length === 0 ? <EmptyState icon={<Wallet className="w-8 h-8" />} title="No wallets flagged" description="Nothing below 10% of its last top-up and nothing at zero." /> : (
                <ul className="space-y-2">{d.walletFlags.map((w) => (
                  <li key={w.customerId} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1"><CustomerLink id={w.customerId} name={w.customerName} /><div className="text-[11px] text-fg-muted">{fmt.n(w.balance)} left{w.lastTopUpAmount ? ` of ${fmt.n(w.lastTopUpAmount)}` : ''} · {w.dailyBurn ? `${fmt.n(w.dailyBurn)}/day` : 'no burn'}</div></div>
                    <StatusBadge tone={w.atZero ? 'error' : 'warning'}>{w.atZero ? `at 0 · ${w.hoursAtZero ?? 0}h` : 'below 10%'}</StatusBadge>
                  </li>
                ))}</ul>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-fg">Keys near expiry &amp; in use</h3><Link href="/admin/tokens" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Tokens <ArrowRight className="w-3 h-3" /></Link></div>
              {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : d.keyInsights.length === 0 ? <EmptyState icon={<KeyRound className="w-8 h-8" />} title="No key will expire on live traffic" description="Every key expiring within 14 days has been idle this week." /> : (
                <ul className="space-y-2">{d.keyInsights.map((k) => (
                  <li key={k.key.id} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1"><CustomerLink id={k.key.customerId} name={k.customerName} /><KeyIdentity prefix={k.key.prefix} last4={k.key.last4} fingerprint={k.key.fingerprint} /><div className="text-[11px] text-fg-muted">{fmt.n(k.requests7d)} calls this week</div></div>
                    <StatusBadge tone={k.severity === 'critical' ? 'error' : 'warning'}><AlertTriangle className="w-3 h-3" /> {k.daysLeft}d left</StatusBadge>
                  </li>
                ))}</ul>
              )}
            </GlassCard>
          </motion.div>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => router.push('/admin/access-requests')} icon={<Inbox className="w-4 h-4" />}>Review access requests</Button>
            <Button size="sm" variant="ghost" onClick={() => router.push('/admin/customers')} icon={<Building2 className="w-4 h-4" />}>Browse customers</Button>
            {d && d.previewCustomers.map((p) => <Link key={p.id} href={`/admin/customers/${p.id}`} className="text-[11px] font-bold text-teal hover:underline inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Preview open: {p.name}</Link>)}
          </div>
        </>
      )}
    </div>
  );
}
