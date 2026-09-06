'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Plus, X, ArrowUpDown, Play, Copy, Check, RefreshCw, AlertTriangle, Compass, ArrowRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue, API_BASE_URL } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, Button, Input, Select, EmptyState, Skeleton, StatusBadge, DataTable, type Column,
} from '@/components/ui';
import { FILTER_OPS, type FilterOp } from '@/lib/gateway/queryEngine';

interface Employee { id: string; email: string; name: string; title: string; department: string; }
interface ClauseRow { id: number; field: string; op: FilterOp; value: string; }

const OP_LABEL: Record<FilterOp, string> = {
  eq: '= equals', ne: '≠ not equals', gt: '> greater', gte: '≥ at least', lt: '< less', lte: '≤ at most',
  contains: 'contains', startsWith: 'starts with', endsWith: 'ends with', in: 'in (a|b|c)',
};

function QueryInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fields, setFields] = useState<string[]>([]);
  const [clauses, setClauses] = useState<ClauseRow[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [rows, setRows] = useState<Employee[]>([]);
  const [meta, setMeta] = useState<{ total: number; unfiltered: number; errors: string[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nextId, setNextId] = useState(1);

  const authFetch = useCallback((qs: string) =>
    fetch(`/api/v1/companies/employees?domain=acme.com${qs}`, { headers: { Authorization: authHeaderValue(apiKey) } }),
    [apiKey]);

  const filterParam = useMemo(() =>
    clauses.filter(c => c.field && c.value !== '').map(c => `${c.field}:${c.op}:${c.value}`).join(','),
    [clauses]);
  const sortParam = useMemo(() => (sortField ? `${sortDir === 'desc' ? '-' : ''}${sortField}` : ''), [sortField, sortDir]);
  const queryString = useMemo(() => {
    const parts = ['limit=25'];
    if (filterParam) parts.push(`filter=${encodeURIComponent(filterParam)}`);
    if (sortParam) parts.push(`sort=${encodeURIComponent(sortParam)}`);
    return parts.join('&');
  }, [filterParam, sortParam]);

  const fullUrl = `${API_BASE_URL}/v1/companies/employees?domain=acme.com&${queryString}`;

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const res = await authFetch(`&${queryString}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Query failed');
      const data = body.data;
      setRows(Array.isArray(data.employees) ? data.employees : []);
      setMeta({ total: data.pagination?.total ?? 0, unfiltered: data.query?.unfiltered_total ?? 0, errors: data.query?.errors ?? [] });
      if (fields.length === 0 && data.employees?.[0]) setFields(Object.keys(data.employees[0]));
      track('query_run', { filters: (data.query?.filters ?? []).length, sorts: (data.query?.sorts ?? []).length, matched: data.pagination?.total ?? 0, environment });
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    } finally {
      setRunning(false);
    }
  }, [authFetch, queryString, fields.length, environment]);

  // Initial load derives the available fields from the real dataset.
  useEffect(() => {
    track('query_viewed', { environment });
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addClause = () => { setClauses((c) => [...c, { id: nextId, field: fields[0] ?? 'department', op: 'eq', value: '' }]); setNextId((n) => n + 1); };
  const updateClause = (id: number, patch: Partial<ClauseRow>) => setClauses((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c));
  const removeClause = (id: number) => setClauses((cs) => cs.filter((c) => c.id !== id));

  const copy = () => { navigator.clipboard.writeText(fullUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const columns: Column<Employee>[] = useMemo(() => (fields.length ? fields : ['name', 'department', 'title', 'email']).map((f) => ({
    key: f, header: f,
    render: (r: Employee) => <span className={f === 'name' ? 'font-semibold text-fg' : 'text-fg-muted'}>{String((r as unknown as Record<string, unknown>)[f] ?? '')}</span>,
    sortValue: (r: Employee) => String((r as unknown as Record<string, unknown>)[f] ?? ''),
  })), [fields]);

  if (phase === 'loading') return <QuerySkeleton />;
  if (phase === 'error') {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader icon={<Filter />} title="Query Builder" description="Filter and sort list endpoints with a universal query grammar." />
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t reach the query endpoint"
            description="Check that you have an active API key, then retry."
            action={<Button variant="secondary" size="sm" onClick={() => { setPhase('loading'); run(); }}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      </div>
    );
  }

  const fieldOptions = (fields.length ? fields : ['id', 'name', 'email', 'title', 'department']);

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<Filter />}
        title="Query Builder"
        description="List endpoints accept a universal query grammar: filter=field:op:value (AND across clauses) and sort=field or -field. Build a query against GET /v1/companies/employees and run it live."
        actions={<Link href="/console/explorer?endpoint=company-employees"><Button variant="secondary" size="sm"><Compass className="w-4 h-4" /> In Explorer</Button></Link>}
      />

      <GlassCard className="p-5 mt-6">
        {/* Filters */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> Filters</span>
          <Button variant="ghost" size="sm" onClick={addClause}><Plus className="w-4 h-4" /> Add filter</Button>
        </div>
        {clauses.length === 0 ? (
          <p className="text-xs text-fg-subtle mb-4">No filters — all rows returned. Add a clause to narrow the result set.</p>
        ) : (
          <div className="space-y-2 mb-4">
            <AnimatePresence initial={false}>
              {clauses.map((c) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                  <Select value={c.field} onChange={(e) => updateClause(c.id, { field: e.target.value })} className="w-40">
                    {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                  </Select>
                  <Select value={c.op} onChange={(e) => updateClause(c.id, { op: e.target.value as FilterOp })} className="w-44">
                    {FILTER_OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                  </Select>
                  <Input value={c.value} onChange={(e) => updateClause(c.id, { value: e.target.value })} placeholder={c.op === 'in' ? 'Sales|Engineering' : 'value'} className="flex-1" />
                  <button onClick={() => removeClause(c.id)} className="text-fg-subtle hover:text-semantic-error p-1.5 rounded-md hover:bg-glass transition-colors" aria-label="Remove filter"><X className="w-4 h-4" /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle flex items-center gap-1.5 mr-1"><ArrowUpDown className="w-3.5 h-3.5" /> Sort</span>
          <Select value={sortField} onChange={(e) => setSortField(e.target.value)} className="w-40">
            <option value="">— none —</option>
            {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
          <Select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} className="w-36" disabled={!sortField}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </Select>
          <div className="flex-1" />
          <Button size="sm" onClick={run} disabled={running}>{running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run query</Button>
        </div>

        {/* Generated URL */}
        <div className="mt-4 rounded-xl border border-border bg-surface p-3 relative">
          <button onClick={copy} className="absolute top-2.5 right-2.5 text-fg-subtle hover:text-teal transition-colors p-1 rounded-md hover:bg-glass" aria-label="Copy URL">
            {copied ? <Check className="w-4 h-4 text-semantic-success" /> : <Copy className="w-4 h-4" />}
          </button>
          <pre className="text-[11px] font-mono text-fg-muted whitespace-pre-wrap break-all pr-8">{fullUrl}</pre>
        </div>
      </GlassCard>

      {/* Results */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-fg flex items-center gap-2">
            Results
            {meta && <StatusBadge tone="info">{meta.total} of {meta.unfiltered}</StatusBadge>}
          </h3>
          <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">View in Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>

        {meta && meta.errors.length > 0 && (
          <GlassCard className="p-3 mb-3 border-semantic-error/30 bg-semantic-error/5">
            <div className="text-xs text-semantic-error flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> <span>{meta.errors.join(' · ')}</span></div>
          </GlassCard>
        )}

        {rows.length === 0 ? (
          <GlassCard className="p-0 overflow-hidden">
            <EmptyState icon={<Filter className="w-8 h-8" />} title="No rows match" description="No employees match these filters. Loosen a clause or clear the filters." />
          </GlassCard>
        ) : (
          <DataTable<Employee> columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={10} />
        )}
      </div>
    </div>
  );
}

function QuerySkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <Skeleton className="h-56 rounded-2xl mt-6" />
      <Skeleton className="h-80 rounded-2xl mt-6" />
    </div>
  );
}

export default function QueryPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <QueryInner />
    </RoleGuard>
  );
}
