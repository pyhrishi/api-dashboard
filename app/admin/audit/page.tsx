'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Search } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { recentEvents } from '@/lib/admin/telemetry';
import { PageHeader, GlassCard, DataTable, Input, Select, Skeleton, EmptyState, StatusBadge, type Column } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import type { AuditEntry, Customer } from '@/lib/admin/types';

export default function AuditPage() {
  const audit = useLoad<AuditEntry[]>('audit');
  const customers = useLoad<Customer[]>('customers');
  const names = useMemo(() => new Map((customers.state.status === 'ok' ? customers.state.data : []).map((c) => [c.id, c.name])), [customers.state]);
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('all');
  const all = audit.state.status === 'ok' ? audit.state.data : [];
  const actors = Array.from(new Set(all.map((a) => a.actor)));
  const rows = all.filter((a) => (actor === 'all' || a.actor === actor) && (!q.trim() || `${a.action} ${a.target} ${a.reason} ${names.get(a.customerId ?? '') ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 3000); return () => clearInterval(t); }, []);
  const events = recentEvents(30);

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'When', sortValue: (a) => Date.parse(a.at), render: (a) => <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap">{fmt.dateTime(a.at)}</span> },
    { key: 'actor', header: 'Actor', render: (a) => <div><div className="text-[12px] text-fg">{a.actor}</div><StatusBadge tone={a.actorRole === 'superadmin' ? 'teal' : 'neutral'}>{a.actorRole}</StatusBadge></div> },
    { key: 'action', header: 'Action', render: (a) => <div><div className="font-mono text-[11px] text-fg">{a.action}</div>{a.customerId && <CustomerLink id={a.customerId} name={names.get(a.customerId) ?? a.customerId} />}<div className="font-mono text-[10px] text-fg-subtle">{a.target}</div></div> },
    { key: 'change', header: 'Before → after', className: 'hidden lg:table-cell', render: (a) => <span className="font-mono text-[10px] text-fg-muted break-all">{a.before ? JSON.stringify(a.before) : '∅'} → {a.after ? JSON.stringify(a.after) : '∅'}</span> },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-[11px] text-fg">{a.reason}</span> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<History />} title="Audit log" description="Every operator mutation across the admin panel: who, what, before and after, and why. Exportable per customer in production." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-5 mt-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative"><Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2" /><Input aria-label="Search audit" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Action, target, reason, customer" className="text-[12px] w-72 pl-8" /></div>
            <Select aria-label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} className="text-[12px] w-64"><option value="all">All actors</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
            <span className="text-[11px] text-fg-muted ml-auto">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
          </div>
          {audit.state.status === 'loading' ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : audit.state.status === 'error' ? <ErrorCard message={audit.state.message} onRetry={audit.reload} /> : rows.length === 0 ? <EmptyState icon={<History className="w-8 h-8" />} title="No audit entries match" description="Every mutation lands here — try clearing the filters." /> : <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} pageSize={15} />}
        </GlassCard>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <GlassCard className="p-5 mt-5">
          <h3 className="text-sm font-bold text-fg mb-1">Operator telemetry (this session)</h3>
          <p className="text-[12px] text-fg-muted mb-3">Typed events the admin app emits — page views, previews, key actions, decisions. Production forwards them to the internal analytics pipeline.</p>
          {events.length === 0 ? <p className="text-[11px] text-fg-muted">No events yet.</p> : <ul className="space-y-1 max-h-[260px] overflow-auto">{events.map((e) => <li key={e.id} className="text-[11px] flex items-start gap-2"><span className="font-mono text-fg-subtle whitespace-nowrap">{fmt.ago(e.at)}</span><span className="font-mono text-fg">{e.name}</span><span className="text-fg-muted break-all">{Object.entries(e.props).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${String(v)}`).join(' ')}</span></li>)}</ul>}
        </GlassCard>
      </motion.div>
    </div>
  );
}
