'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, ScrollText, ShieldCheck, Filter } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { track } from '@/lib/admin/telemetry';
import { Button, DataTable, EmptyState, GlassCard, KpiTile, SegmentedControl, Select, Skeleton, StatusBadge, type Column, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import type { LedgerEntry, LedgerSummary, Timeframe, Customer, ManagedKey } from '@/lib/admin/types';
import type { TimeframeKey } from '@/lib/admin/insights';
import { ENDPOINTS } from '@/lib/admin/seed';

interface LedgerResponse { frame: Timeframe; summary: LedgerSummary; entries: LedgerEntry[]; nextCursor: number | null; total: number }
type StatusFilter = 'all' | '2xx' | '4xx' | '5xx';
const FRAMES: { value: TimeframeKey; label: string }[] = [{ value: '1h', label: '1h' }, { value: '24h', label: '24h' }, { value: '7d', label: '7d' }, { value: '30d', label: '30d' }];
const statusTone = (s: number): BadgeTone => (s < 300 ? 'success' : s === 402 ? 'warning' : s === 429 ? 'warning' : s < 500 ? 'neutral' : 'error');

interface Props { customers: Customer[]; keys: ManagedKey[]; customerId?: string; showCustomerPicker?: boolean }

/** Metadata-only ledger: time frame, status breakdown, consumption & cost, request list. Never a body. */
export function LedgerPanel({ customers, keys, customerId: fixedCustomer, showCustomerPicker }: Props) {
  const [customerId, setCustomerId] = useState<string>(fixedCustomer ?? 'all');
  const [frame, setFrame] = useState<TimeframeKey>('7d');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [endpoint, setEndpoint] = useState<string>('all');
  const [cursor, setCursor] = useState(0);
  const qs = new URLSearchParams({ frame, cursor: String(cursor), limit: '25' });
  if (customerId !== 'all') qs.set('customer', customerId);
  if (status !== 'all') qs.set('status', status);
  if (endpoint !== 'all') qs.set('endpoint', endpoint);
  const path = fixedCustomer ? `customers/${fixedCustomer}/ledger?${qs}` : `ledger?${qs}`;
  const { state, reload } = useLoad<LedgerResponse>(path);
  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const keyById = useMemo(() => new Map(keys.map((k) => [k.id, k])), [keys]);

  const change = <T,>(setter: (v: T) => void, field: string) => (v: T) => { setter(v); setCursor(0); track('ledger_filtered', { field }); };

  const columns: Column<LedgerEntry>[] = [
    { key: 'ts', header: 'Time', render: (e) => <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap">{fmt.dateTime(e.ts)}</span> },
    ...(fixedCustomer ? [] : [{ key: 'customer', header: 'Customer', render: (e: LedgerEntry) => <CustomerLink id={e.customerId} name={names.get(e.customerId) ?? e.customerId} /> } as Column<LedgerEntry>]),
    { key: 'endpoint', header: 'Endpoint', render: (e) => <span className="font-mono text-[11px] text-fg"><span className="text-fg-muted">{e.method}</span> {e.endpoint}</span> },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge tone={statusTone(e.status)}>{e.status}</StatusBadge> },
    { key: 'latency', header: 'Latency', align: 'right', className: 'hidden md:table-cell', sortValue: (e) => e.latencyMs, render: (e) => <span className="font-mono text-[11px] text-fg-muted">{e.latencyMs} ms</span> },
    { key: 'credits', header: 'Credits', align: 'right', sortValue: (e) => e.credits, render: (e) => <span className="font-mono text-[11px] text-fg">{e.credits}</span> },
    { key: 'key', header: 'Key', className: 'hidden lg:table-cell', render: (e) => <span className="font-mono text-[10px] text-fg-muted">{keyById.get(e.keyId)?.fingerprint ?? e.keyId}</span> },
    { key: 'meta', header: 'Meta', className: 'hidden xl:table-cell', render: (e) => <span className="text-[10px] text-fg-muted">{e.region}{e.cache ? ` · cache ${e.cache}` : ''}{e.idempotent ? ' · idempotent' : ''} · <span className="font-mono">{e.requestId}</span></span> },
  ];

  const endpoints = ENDPOINTS.map((e) => e.path);
  const csvHref = `/api/admin/ledger?format=csv&frame=${frame}${customerId !== 'all' ? `&customer=${customerId}` : ''}${status !== 'all' ? `&status=${status}` : ''}${endpoint !== 'all' ? `&endpoint=${encodeURIComponent(endpoint)}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {showCustomerPicker && !fixedCustomer && (
          <Select aria-label="Customer" value={customerId} onChange={(e) => change(setCustomerId, 'customer')(e.target.value)} className="text-[12px] w-56"><option value="all">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        )}
        <SegmentedControl layoutId="ledger-frame" size="sm" value={frame} onChange={change(setFrame, 'frame')} options={FRAMES} />
        <SegmentedControl layoutId="ledger-status" size="sm" value={status} onChange={change(setStatus, 'status')} options={[{ value: 'all', label: 'All' }, { value: '2xx', label: '2xx' }, { value: '4xx', label: '4xx' }, { value: '5xx', label: '5xx' }]} />
        <Select aria-label="Endpoint" value={endpoint} onChange={(e) => change(setEndpoint, 'endpoint')(e.target.value)} className="text-[12px] w-56"><option value="all">All endpoints</option>{endpoints.map((ep) => <option key={ep} value={ep}>{ep}</option>)}</Select>
        <StatusBadge tone="success"><ShieldCheck className="w-3 h-3" /> metadata only — no bodies</StatusBadge>
        <Button className="ml-auto" size="sm" variant="secondary" onClick={() => { track('ledger_exported', { frame, status, endpoint }); window.location.assign(csvHref); }} icon={<Download className="w-4 h-4" />} title="Downloads the current frame and filters — metadata only">Export CSV</Button>
      </div>

      {state.status === 'loading' ? (
        <div className="space-y-4" aria-busy="true"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <KpiTile key={i} loading label="" value="" />)}</div><Skeleton variant="block" className="h-[200px]" /><Skeleton variant="block" className="h-[320px]" /></div>
      ) : state.status === 'error' ? <ErrorCard message={state.message} onRetry={reload} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile label="Calls" value={fmt.n(state.data.summary.calls)} hint={state.data.frame.label} />
            <KpiTile label="Credits consumed" value={fmt.n(state.data.summary.credits)} hint={state.data.summary.costPerSuccess !== null ? `${state.data.summary.costPerSuccess} cr per successful call` : 'no successful calls'} />
            <KpiTile label="Error rate" value={`${state.data.summary.errorRate}%`} hint={`${state.data.summary.byClass['4xx']} × 4xx · ${state.data.summary.byClass['5xx']} × 5xx`} lowerIsBetter />
            <KpiTile label="Latency p50 / p95" value={`${state.data.summary.p50LatencyMs} / ${state.data.summary.p95LatencyMs} ms`} hint="gateway-measured" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <div className="text-[12px] font-bold text-fg mb-2 inline-flex items-center gap-1.5"><Filter className="w-3.5 h-3.5 text-teal" /> Status-code breakdown</div>
              {state.data.summary.byStatus.length === 0 ? <p className="text-[11px] text-fg-muted">No calls in this frame.</p> : (
                <ul className="space-y-1.5">{state.data.summary.byStatus.map((s) => (
                  <li key={s.code} className="flex items-center gap-2">
                    <StatusBadge tone={statusTone(s.code)}>{s.code}</StatusBadge>
                    <div className="flex-1 h-2 rounded-full bg-glass overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${s.share}%` }} transition={{ duration: 0.4 }} className={`h-full rounded-full ${s.code < 300 ? 'bg-semantic-success' : s.code < 500 ? 'bg-semantic-warning' : 'bg-semantic-error'}`} /></div>
                    <span className="font-mono text-[11px] text-fg w-24 text-right">{fmt.n(s.count)} · {s.share}%</span>
                  </li>
                ))}</ul>
              )}
            </GlassCard>
            <GlassCard className="p-4">
              <div className="text-[12px] font-bold text-fg mb-2">Consumption &amp; cost by endpoint</div>
              {state.data.summary.byEndpoint.length === 0 ? <p className="text-[11px] text-fg-muted">No calls in this frame.</p> : (
                <ul className="space-y-1">{state.data.summary.byEndpoint.slice(0, 8).map((e) => (
                  <li key={e.endpoint} className="flex items-center justify-between gap-2 text-[11px]"><span className="font-mono text-fg truncate">{e.endpoint}</span><span className="text-fg-muted whitespace-nowrap">{fmt.n(e.calls)} calls · <span className="text-fg font-bold">{fmt.n(e.credits)} cr</span>{e.errors ? ` · ${e.errors} err` : ''}</span></li>
                ))}</ul>
              )}
              {state.data.summary.byKey.length > 0 && <div className="mt-3 pt-3 border-t border-border text-[11px] text-fg-muted">By key: {state.data.summary.byKey.slice(0, 4).map((k) => `${k.keyName} ${fmt.n(k.credits)} cr`).join(' · ')}</div>}
            </GlassCard>
          </div>
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2"><div className="text-[12px] font-bold text-fg inline-flex items-center gap-1.5"><ScrollText className="w-3.5 h-3.5 text-teal" /> Requests · {fmt.n(state.data.total)} in frame</div><span className="text-[11px] text-fg-muted">time · endpoint · status · latency · credits · key fingerprint · region · request id</span></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${frame}-${status}-${endpoint}-${cursor}-${customerId}`} initial={{ opacity: 0 }} animate={{ opacity: state.refreshing ? 0.6 : 1 }} exit={{ opacity: 0 }}>
                {state.data.entries.length === 0 ? <EmptyState icon={<ScrollText className="w-8 h-8" />} title="No requests in this frame" description="Widen the time frame or clear the status / endpoint filter." /> : <DataTable columns={columns} rows={state.data.entries} rowKey={(e) => e.requestId} />}
              </motion.div>
            </AnimatePresence>
            {(cursor > 0 || state.data.nextCursor !== null) && (
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button size="sm" variant="ghost" disabled={cursor === 0} onClick={() => setCursor(Math.max(0, cursor - 25))}>Newer</Button>
                <Button size="sm" variant="ghost" disabled={state.data.nextCursor === null} onClick={() => setCursor(state.data.nextCursor ?? cursor)}>Older</Button>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
