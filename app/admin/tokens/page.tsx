'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { KeyRound, AlertTriangle, ShieldCheck } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, EmptyState } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, KeyIdentity } from '@/components/admin/shared';
import { TokensPanel } from '@/components/admin/TokensPanel';
import type { ManagedKey, Customer, KeyInsight } from '@/lib/admin/types';

export default function TokensPage() {
  const keys = useLoad<ManagedKey[]>('keys');
  const customers = useLoad<Customer[]>('customers');
  const insights = useLoad<KeyInsight[]>('insights/keys');
  const all = keys.state.status === 'ok' ? keys.state.data : [];
  const reload = () => { keys.reload(); insights.reload(); };
  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<KeyRound />} title="Token management" description="Every customer key across products: create, edit scopes, IPs and limits, suspend, regenerate, revoke or delete — each with a reason, each audit-logged, each synced to the digest-keyed gateway registries. Secrets are shown once." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile loading={keys.state.status === 'loading'} label="Keys" value={all.length} hint={`${all.filter((k) => k.environment === 'live').length} live · ${all.filter((k) => k.environment === 'sandbox').length} sandbox`} />
        <KpiTile loading={keys.state.status === 'loading'} label="Active" value={all.filter((k) => k.status === 'active').length} hint={`${all.filter((k) => k.status === 'suspended').length} suspended · ${all.filter((k) => k.status === 'revoked').length} revoked`} />
        <KpiTile loading={keys.state.status === 'loading'} label="Used this week" value={all.filter((k) => k.requests7d > 0).length} hint={`${fmt.n(all.reduce((s, k) => s + k.requests7d, 0))} requests`} />
        <KpiTile loading={insights.state.status === 'loading'} label="Expiring while in use" value={insights.state.status === 'ok' ? insights.state.data.length : ''} hint="≤ 14 days · ≥ 1 call this week" lowerIsBetter />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <GlassCard className="p-5 mt-5 border-semantic-warning/30">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-semantic-warning" /><h3 className="text-sm font-bold text-fg">Insight · keys near expiry and in use</h3></div>
          <p className="text-[12px] text-fg-muted mb-3">These keys will stop live traffic on a calendar date. Extend the expiry (edit) or tell the customer before it happens.</p>
          {insights.state.status === 'loading' ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : insights.state.status === 'error' ? <ErrorCard message={insights.state.message} onRetry={insights.reload} /> : insights.state.data.length === 0 ? <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="Nothing will expire on live traffic" description="Every key expiring within 14 days has been idle this week." /> : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">{insights.state.data.map((i) => (
              <li key={i.key.id} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1"><CustomerLink id={i.key.customerId} name={i.customerName} /><KeyIdentity name={i.key.name} prefix={i.key.prefix} last4={i.key.last4} fingerprint={i.key.fingerprint} /><div className="text-[11px] text-fg-muted">{fmt.n(i.requests7d)} calls this week · expires {fmt.date(i.key.expiresAt)}</div></div>
                <StatusBadge tone={i.severity === 'critical' ? 'error' : 'warning'}>{i.daysLeft}d left</StatusBadge>
              </li>
            ))}</ul>
          )}
        </GlassCard>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <GlassCard className="p-5 mt-5">
          <h3 className="text-sm font-bold text-fg mb-3">All keys</h3>
          {keys.state.status === 'loading' ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : keys.state.status === 'error' ? <ErrorCard message={keys.state.message} onRetry={keys.reload} /> : <TokensPanel keys={all} customers={customers.state.status === 'ok' ? customers.state.data : []} onChanged={reload} />}
          <p className="text-[11px] text-fg-muted mt-3">To create a key, <Link href="/admin/customers" className="text-teal hover:underline font-bold">open the customer</Link> and use the Tokens tab — creation is always scoped to an account.</p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
