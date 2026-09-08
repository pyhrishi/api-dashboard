'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, GlassCard, KpiTile, DataTable, SegmentedControl, StatusBadge, Skeleton, EmptyState, type Column } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, REQUEST_TONE, TYPE_LABEL } from '@/components/admin/shared';
import type { AccessRequest, Customer, AccessRequestStatus } from '@/lib/admin/types';

type Filter = 'open' | 'all' | 'approved' | 'denied';

export default function AccessRequestsPage() {
  const router = useRouter();
  const reqs = useLoad<AccessRequest[]>('access-requests');
  const customers = useLoad<Customer[]>('customers');
  const names = useMemo(() => new Map((customers.state.status === 'ok' ? customers.state.data : []).map((c) => [c.id, c.name])), [customers.state]);
  const [filter, setFilter] = useState<Filter>('open');
  const all = reqs.state.status === 'ok' ? reqs.state.data : [];
  const rows = all.filter((r) => filter === 'all' ? true : filter === 'open' ? r.status === 'open' || r.status === 'needs_info' : r.status === filter);

  const columns: Column<AccessRequest>[] = [
    { key: 'type', header: 'Request', render: (r) => <div><div className="text-[12px] font-bold text-fg">{TYPE_LABEL[r.type]}</div><div className="text-[11px] text-fg-muted truncate max-w-[360px]">{r.justification}</div></div> },
    { key: 'customer', header: 'Account', render: (r) => <div><CustomerLink id={r.customerId} name={names.get(r.customerId) ?? r.customerId} /><div className="text-[11px] text-fg-muted">{r.requesterEmail}</div></div> },
    { key: 'risk', header: 'Risk context', className: 'hidden lg:table-cell', render: (r) => <div className="flex flex-wrap gap-1">{r.riskContext.tripped.length ? r.riskContext.tripped.map((t) => <span key={t} className="font-mono text-[10px] rounded border border-semantic-warning/30 text-semantic-warning px-1">{t}</span>) : <span className="text-[10px] text-fg-muted">clean</span>}<span className="text-[10px] text-fg-muted">· wallet {fmt.n(r.riskContext.walletBalance)} · {fmt.n(r.riskContext.calls7d)} calls/7d</span></div> },
    { key: 'age', header: 'Age', align: 'right', className: 'hidden md:table-cell', sortValue: (r) => Date.parse(r.createdAt), render: (r) => <span className="text-[11px] text-fg-muted">{fmt.ago(r.createdAt)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge tone={REQUEST_TONE[r.status as AccessRequestStatus]}>{r.status.replace('_', ' ')}</StatusBadge> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<Inbox />} title="Access requests" description="Live keys, limit increases, data regions, enterprise features and trial-gate overrides — each a one-pager with the requester, the exact ask, the risk context, the decision and its full log." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile loading={reqs.state.status === 'loading'} label="Open" value={all.filter((r) => r.status === 'open').length} hint="awaiting a decision" />
        <KpiTile loading={reqs.state.status === 'loading'} label="Needs info" value={all.filter((r) => r.status === 'needs_info').length} hint="waiting on the requester" />
        <KpiTile loading={reqs.state.status === 'loading'} label="Approved (all time)" value={all.filter((r) => r.status === 'approved').length} />
        <KpiTile loading={reqs.state.status === 'loading'} label="Denied (all time)" value={all.filter((r) => r.status === 'denied').length} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <GlassCard className="p-5 mt-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap"><h3 className="text-sm font-bold text-fg">Queue</h3><SegmentedControl layoutId="areq-filter" size="sm" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }, { value: 'all', label: 'All' }]} /></div>
          {reqs.state.status === 'loading' ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : reqs.state.status === 'error' ? <ErrorCard message={reqs.state.message} onRetry={reqs.reload} /> : rows.length === 0 ? <EmptyState icon={<Inbox className="w-8 h-8" />} title={filter === 'open' ? 'Queue is clear' : 'Nothing here'} description={filter === 'open' ? 'No request is waiting on a decision.' : 'Switch the filter to see other states.'} /> : <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={10} onRowClick={(r) => router.push(`/access-requests/${r.id}`)} />}
        </GlassCard>
      </motion.div>
    </div>
  );
}
