'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Layers, FileUp, Rows3, Target, Coins, Sparkles, ChevronRight, ShieldAlert } from 'lucide-react';
import { useStore, type BulkJob } from '@/lib/store';
import { ENDPOINTS } from '@/data/endpoints';
import { reconcileStaleJobs } from '@/lib/bulk-runner';
import { PageHeader, KpiTile, DataTable, EmptyState, StatusBadge, Button, Skeleton, type Column } from '@/components/ui';
import { NewJobDrawer } from './NewJobDrawer';
import { STATUS_META, jobProgress, relativeTime } from './jobs-shared';
import { cn } from '@/lib/utils';

export default function BulkJobsPage() {
  const router = useRouter();
  const { bulkJobs, user, environment } = useStore();
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initialEndpointId, setInitialEndpointId] = useState<string | null>(null);
  const [initialSource, setInitialSource] = useState<'sample' | null>(null);

  const isBilling = user?.role === 'billing';
  // Jobs are environment-scoped like every sibling page (keys, webhooks, logs).
  const visibleJobs = useMemo(() => bulkJobs.filter(j => j.environment === environment), [bulkJobs, environment]);

  useEffect(() => {
    setMounted(true);
    reconcileStaleJobs();
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      setInitialEndpointId(params.get('endpoint'));
      setDrawerOpen(true);
      // Consume the deep link so refresh/back doesn't reopen the wizard.
      router.replace('/console/jobs', { scroll: false });
    }
  }, [router]);

  const stats = useMemo(() => {
    let enriched = 0, attempted = 0, credits = 0, running = 0;
    visibleJobs.forEach(j => {
      const p = jobProgress(j);
      enriched += p.succeeded;
      attempted += p.succeeded + p.failed;
      credits += j.creditsSpent;
      if (j.status === 'running') running++;
    });
    return { jobs: visibleJobs.length, enriched, matchRate: attempted ? Math.round((enriched / attempted) * 100) : null, credits, running };
  }, [visibleJobs]);

  const columns: Column<BulkJob>[] = [
    {
      key: 'name', header: 'Job',
      sortValue: j => j.name.toLowerCase(),
      render: j => {
        const ep = ENDPOINTS.find(e => e.id === j.endpointId);
        return (
          <div className="min-w-0">
            <Link
              href={`/console/jobs/${j.id}`}
              onClick={e => e.stopPropagation()}
              className="text-sm font-bold text-fg hover:text-teal transition-colors truncate max-w-[260px] block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
            >
              {j.name}
            </Link>
            <div className="text-[11px] text-fg-muted font-mono truncate">{ep ? `${ep.method} ${ep.path}` : j.endpointId}</div>
          </div>
        );
      },
    },
    {
      key: 'status', header: 'Status',
      sortValue: j => j.status,
      render: j => { const m = STATUS_META[j.status]; return <StatusBadge tone={m.tone} dot pulse={m.pulse}>{m.label}</StatusBadge>; },
    },
    {
      key: 'progress', header: 'Progress',
      sortValue: j => jobProgress(j).pct,
      render: j => {
        const p = jobProgress(j);
        return (
          <div className="min-w-[140px]">
            <div className="flex items-center justify-between text-[11px] text-fg-muted mb-1"><span>{p.done.toLocaleString()} / {p.total.toLocaleString()}</span><span>{p.pct}%</span></div>
            <div className="h-1.5 rounded-full bg-glass overflow-hidden flex">
              <div className="h-full bg-teal transition-all duration-500" style={{ width: `${p.total ? (p.succeeded / p.total) * 100 : 0}%` }} />
              <div className="h-full bg-semantic-error/70 transition-all duration-500" style={{ width: `${p.total ? (p.failed / p.total) * 100 : 0}%` }} />
              <div className="h-full bg-semantic-warning/60 transition-all duration-500" style={{ width: `${p.total ? (p.skipped / p.total) * 100 : 0}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'match', header: 'Match rate', align: 'right',
      sortValue: j => jobProgress(j).matchRate ?? -1,
      render: j => { const m = jobProgress(j).matchRate; return <span className={cn('font-mono text-sm', m === null ? 'text-fg-subtle' : m >= 0.9 ? 'text-teal' : m >= 0.7 ? 'text-fg' : 'text-semantic-warning')}>{m === null ? '—' : `${Math.round(m * 100)}%`}</span>; },
    },
    {
      key: 'credits', header: 'Credits', align: 'right',
      sortValue: j => j.creditsSpent,
      render: j => <span className="font-mono text-sm text-fg">{j.creditsSpent.toLocaleString()}<span className="text-fg-subtle"> / {j.creditEstimate.toLocaleString()}</span></span>,
    },
    {
      key: 'created', header: 'Created', align: 'right',
      sortValue: j => new Date(j.createdAt).getTime(),
      render: j => <span className="text-xs text-fg-muted whitespace-nowrap">{relativeTime(j.createdAt)}</span>,
    },
    { key: 'open', header: '', align: 'right', render: () => <ChevronRight className="w-4 h-4 text-fg-subtle" aria-hidden /> },
  ];

  const openNew = () => { setInitialEndpointId(null); setInitialSource(null); setDrawerOpen(true); };
  const openSample = () => { setInitialEndpointId(null); setInitialSource('sample'); setDrawerOpen(true); };

  return (
    <div className="max-w-7xl mx-auto pb-12 space-y-8">
      <PageHeader
        title="Bulk Jobs"
        icon={<Layers className="w-6 h-6" />}
        description="Upload a CSV, see the exact credit cost, and run every row through the gateway. Retry only what failed."
        actions={
          <Button onClick={openNew} disabled={isBilling} icon={<FileUp className="w-4 h-4" />}>
            New job
          </Button>
        }
      />

      {isBilling && (
        <div className="flex items-center gap-2 text-xs text-fg-muted bg-glass border border-border rounded-xl px-4 py-3"><ShieldAlert className="w-4 h-4" /> Your role (billing) can review jobs, costs, and results. Creating and running jobs needs an admin or developer.</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Jobs" value={stats.jobs.toLocaleString()} icon={<Layers className="w-4 h-4" />} hint={stats.running ? `${stats.running} running now` : 'across this workspace'} loading={!mounted} />
        <KpiTile label="Rows enriched" value={stats.enriched.toLocaleString()} icon={<Rows3 className="w-4 h-4" />} hint="successful responses" loading={!mounted} />
        <KpiTile label="Match rate" value={stats.matchRate === null ? '—' : `${stats.matchRate}%`} icon={<Target className="w-4 h-4" />} hint="succeeded ÷ attempted" loading={!mounted} />
        <KpiTile label="Credits spent" value={stats.credits.toLocaleString()} icon={<Coins className="w-4 h-4" />} hint="billed on success only" loading={!mounted} />
      </div>

      {!mounted ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : visibleJobs.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <EmptyState
            icon={<Layers className="w-8 h-8" />}
            title={bulkJobs.length > 0 ? `No ${environment} jobs yet` : 'No bulk jobs yet'}
            description={`Enrich hundreds of records in one go: drop a CSV, map the columns, see the credit cost before you run. You're in ${environment} — ${environment === 'live' ? 'results will be PII-masked' : 'results are full synthetic data'}.${bulkJobs.length > 0 ? ` Switch environment to see your other ${bulkJobs.length} job${bulkJobs.length === 1 ? '' : 's'}.` : ''}`}
            action={
              <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
                <Button onClick={openNew} disabled={isBilling} icon={<FileUp className="w-4 h-4" />}>Upload a CSV</Button>
                <Button variant="secondary" onClick={openSample} disabled={isBilling} icon={<Sparkles className="w-4 h-4" />}>Try with sample data</Button>
              </div>
            }
          />
        </motion.div>
      ) : (
        <DataTable<BulkJob>
          columns={columns}
          rows={visibleJobs}
          rowKey={j => j.id}
          pageSize={10}
          initialSort={{ key: 'created', dir: 'desc' }}
          onRowClick={j => router.push(`/console/jobs/${j.id}`)}
        />
      )}

      <NewJobDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} initialEndpointId={initialEndpointId} initialSource={initialSource} />
    </div>
  );
}
