'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Search } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, GlassCard, DataTable, Input, Select, StatusBadge, Skeleton, EmptyState, Button, type Column } from '@/components/admin/ui';
import { ErrorCard, StageBadge, PLAN_TONE, WALLET_TONE, WALLET_LABEL } from '@/components/admin/shared';
import type { Customer, WalletSnapshot, ManagedKey, FunnelStage, Plan, Region } from '@/lib/admin/types';

export default function CustomersPage() {
  const router = useRouter();
  const customers = useLoad<Customer[]>('customers');
  const wallets = useLoad<(WalletSnapshot & { customerName: string })[]>('insights/wallets');
  const keys = useLoad<ManagedKey[]>('keys');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<FunnelStage | 'all'>('all');
  const [plan, setPlan] = useState<Plan | 'all'>('all');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const walletBy = useMemo(() => new Map((wallets.state.status === 'ok' ? wallets.state.data : []).map((w) => [w.customerId, w])), [wallets.state]);
  const keyCount = useMemo(() => { const m = new Map<string, number>(); (keys.state.status === 'ok' ? keys.state.data : []).forEach((k) => { if (k.status === 'active') m.set(k.customerId, (m.get(k.customerId) ?? 0) + 1); }); return m; }, [keys.state]);

  const rows = useMemo(() => (customers.state.status === 'ok' ? customers.state.data : []).filter((c) =>
    (stage === 'all' || c.stage === stage) && (plan === 'all' || c.plan === plan) && (region === 'all' || c.region === region) &&
    (!q.trim() || `${c.name} ${c.domain} ${c.owner} ${c.contactEmail}`.toLowerCase().includes(q.toLowerCase())),
  ), [customers.state, stage, plan, region, q]);

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Customer', render: (c) => <div className="min-w-0"><div className="text-[12px] font-bold text-fg">{c.name}</div><div className="text-[11px] text-fg-muted">{c.domain} · {c.productIds.join(', ')}</div></div> },
    { key: 'plan', header: 'Plan', render: (c) => <StatusBadge tone={PLAN_TONE[c.plan]}>{c.plan}</StatusBadge> },
    { key: 'stage', header: 'Stage', render: (c) => <StageBadge stage={c.stage} /> },
    { key: 'region', header: 'Region', className: 'hidden md:table-cell', render: (c) => <span className="text-[11px] text-fg">{c.region}</span> },
    { key: 'owner', header: 'Owner', className: 'hidden lg:table-cell', render: (c) => <span className="text-[11px] text-fg-muted">{c.owner}</span> },
    { key: 'keys', header: 'Active keys', align: 'right', className: 'hidden md:table-cell', render: (c) => <span className="font-mono text-[11px] text-fg">{keyCount.get(c.id) ?? 0}</span> },
    { key: 'wallet', header: 'Wallet', align: 'right', sortValue: (c) => walletBy.get(c.id)?.balance ?? 0, render: (c) => { const w = walletBy.get(c.id); return w ? <div className="text-right"><div className="font-mono text-[11px] text-fg">{fmt.n(w.balance)}</div><StatusBadge tone={WALLET_TONE[w.label]}>{WALLET_LABEL[w.label]}</StatusBadge></div> : wallets.state.status === 'error' ? <span className="text-[11px] text-fg-muted">—</span> : <Skeleton className="h-4 w-16 ml-auto" />; } },
    { key: 'since', header: 'Since', align: 'right', className: 'hidden lg:table-cell', sortValue: (c) => Date.parse(c.createdAt), render: (c) => <span className="text-[11px] text-fg-muted">{fmt.date(c.createdAt)}</span> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<Building2 />} title="Customers" description="Every B2B2B account across Zintlr products. Open one for tokens, ledger, wallet, access requests, audit — and to preview the console as that customer." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-5 mt-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative"><Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2" /><Input aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, domain, owner, contact" className="text-[12px] w-72 pl-8" /></div>
            <Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as FunnelStage | 'all')} className="text-[12px] w-40"><option value="all">All stages</option><option value="signed_up">Signed up</option><option value="activated">Activated</option><option value="integrated">Integrated</option><option value="paying">Paying</option><option value="expanding">Expanding</option><option value="churned">Churned</option></Select>
            <Select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan | 'all')} className="text-[12px] w-36"><option value="all">All plans</option><option>Trial</option><option>Starter</option><option>Growth</option><option>Enterprise</option></Select>
            <Select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value as Region | 'all')} className="text-[12px] w-32"><option value="all">All regions</option><option>IN</option><option>US</option><option>EU</option></Select>
            <span className="text-[11px] text-fg-muted ml-auto">{rows.length} account{rows.length === 1 ? '' : 's'}</span>
          </div>
          {customers.state.status === 'loading' ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            : customers.state.status === 'error' ? <ErrorCard message={customers.state.message} onRetry={customers.reload} />
              : rows.length === 0 ? <EmptyState icon={<Building2 className="w-8 h-8" />} title="No customers match" description="Clear the search or widen the filters." action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setStage('all'); setPlan('all'); setRegion('all'); }}>Clear filters</Button>} />
                : <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} pageSize={12} onRowClick={(c) => router.push(`/customers/${c.id}`)} />}
        </GlassCard>
      </motion.div>
    </div>
  );
}
