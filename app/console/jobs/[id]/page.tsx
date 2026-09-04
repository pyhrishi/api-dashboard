'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Pause, RotateCcw, XCircle, Trash2, Sparkles, Clock, Coins, Gauge, CheckCircle2, AlertTriangle, ExternalLink, Webhook, Layers, FileJson, FileSpreadsheet } from 'lucide-react';
import { useStore, type BulkJob, type BulkJobRow, type BulkJobRowStatus } from '@/lib/store';
import { ENDPOINTS } from '@/data/endpoints';
import { startBulkJob, pauseBulkJob, cancelBulkJob, reconcileStaleJobs, isJobRunning } from '@/lib/bulk-runner';
import { summarizeBulkJob } from '@/lib/insight-engine';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { JsonViewer } from '@/components/JsonViewer';
import { GlassCard, StatusBadge, Button, ConfirmAction, SegmentedControl, DataTable, EmptyState, Drawer, Skeleton, type Column } from '@/components/ui';
import { STATUS_META, jobProgress, formatDuration, estimateDurationMs, downloadText, jobToCsv, jobExportRows, safeFileName, relativeTime } from '../jobs-shared';
import { cn } from '@/lib/utils';

type RowFilter = 'all' | 'succeeded' | 'failed' | 'skipped' | 'pending';

const ROW_TONE: Record<BulkJobRowStatus, { tone: 'success' | 'error' | 'warning' | 'neutral' | 'teal'; label: string; pulse?: boolean }> = {
  succeeded: { tone: 'success', label: 'Succeeded' },
  failed: { tone: 'error', label: 'Failed' },
  skipped: { tone: 'warning', label: 'Skipped' },
  processing: { tone: 'teal', label: 'Processing', pulse: true },
  pending: { tone: 'neutral', label: 'Pending' },
};

function firstOutputField(output: unknown): string {
  if (!output || typeof output !== 'object') return output === undefined ? '' : String(output);
  const o = output as Record<string, unknown>;
  const preferred = ['phone', 'email', 'full_name', 'name', 'company', 'linkedin_url', 'domain', 'confidence'];
  const key = preferred.find(k => o[k] !== undefined && o[k] !== null && typeof o[k] !== 'object') ?? Object.keys(o).find(k => typeof o[k] !== 'object');
  return key ? `${key}: ${String(o[key])}` : `${Object.keys(o).length} fields`;
}

export default function BulkJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { bulkJobs, user, creditBalance, retryBulkJobFailures, deleteBulkJob } = useStore();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [selectedRow, setSelectedRow] = useState<BulkJobRow | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const job = useMemo(() => bulkJobs.find(j => j.id === params?.id), [bulkJobs, params?.id]);
  const endpoint = useMemo(() => job ? ENDPOINTS.find(e => e.id === job.endpointId) : undefined, [job]);
  const progress = useMemo(() => job ? jobProgress(job) : null, [job]);
  const summary = useMemo(() => job ? summarizeBulkJob(job.rows) : null, [job]);
  const isBilling = user?.role === 'billing';

  useEffect(() => { setMounted(true); reconcileStaleJobs(); }, []);

  // Tick while running so elapsed/ETA stay live.
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job?.status]);

  // Celebrate the first completion once per job (state-driven, no randomness).
  const prevStatus = useRef<BulkJob['status'] | undefined>(undefined);
  useEffect(() => {
    if (!job) return;
    if (prevStatus.current === 'running' && (job.status === 'completed' || job.status === 'completed_with_errors')) {
      const p = jobProgress(job);
      if (job.status === 'completed') toast.success('Job complete', `${p.succeeded.toLocaleString()} rows enriched for ${job.creditsSpent.toLocaleString()} credits.`);
      else toast.warning('Job finished with errors', `${p.succeeded.toLocaleString()} succeeded · ${p.failed.toLocaleString()} failed — retry only the failures.`);
    }
    prevStatus.current = job.status;
  }, [job, toast]);

  if (!mounted) {
    return <div className="max-w-7xl mx-auto space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  if (!job || !endpoint || !progress || !summary) {
    return (
      <div className="max-w-3xl mx-auto pt-12">
        <EmptyState tone="error" icon={<Layers className="w-8 h-8" />} title="Job not found" description="It may belong to another organization, or it was deleted." action={<Button variant="secondary" onClick={() => router.push('/console/jobs')} icon={<ArrowLeft className="w-4 h-4" />}>Back to Bulk Jobs</Button>} />
      </div>
    );
  }

  const meta = STATUS_META[job.status];
  const running = job.status === 'running' || isJobRunning(job.id);
  const canRun = !isBilling && (job.status === 'draft' || job.status === 'queued' || job.status === 'paused');
  const elapsedMs = job.startedAt ? ((job.completedAt ? new Date(job.completedAt).getTime() : now) - new Date(job.startedAt).getTime()) : 0;
  const etaMs = running ? estimateDurationMs(progress.pending + progress.processing, job.concurrency, progress.avgLatencyMs || 450) : 0;
  const throughput = elapsedMs > 0 && progress.done > 0 ? Math.round((progress.succeeded + progress.failed) / (elapsedMs / 60000)) : 0;
  const creditsShort = job.lastErrorCode === 'insufficient_credits' && creditBalance < endpoint.creditCost;

  const handleRun = async () => {
    try { await startBulkJob(job.id); } catch (err: unknown) { toast.error('Could not start', err instanceof Error ? err.message : 'Please try again.'); }
  };
  const handleRetry = () => {
    try {
      retryBulkJobFailures(job.id);
      track('bulk_job_retried', { job: job.id, failed: progress.failed });
      startBulkJob(job.id).catch((err: unknown) => toast.error('Could not start', err instanceof Error ? err.message : 'Please try again.'));
    } catch (err: unknown) { toast.error('Could not retry', err instanceof Error ? err.message : 'Please try again.'); }
  };
  const handleDownload = (format: 'csv' | 'json') => {
    const base = safeFileName(job.name);
    if (format === 'csv') downloadText(`${base}.csv`, jobToCsv(job), 'text/csv;charset=utf-8');
    else downloadText(`${base}.json`, JSON.stringify({ job: { id: job.id, name: job.name, endpoint: endpoint.path, environment: job.environment, createdAt: job.createdAt, completedAt: job.completedAt }, rows: jobExportRows(job).rows }, null, 2), 'application/json');
    track('export_downloaded', { source: 'bulk_job', format, rows: job.rows.length, succeeded: progress.succeeded });
    toast.success('Download started', `${progress.succeeded.toLocaleString()} enriched rows${progress.failed || progress.skipped ? ' plus failure reasons' : ''} as ${format.toUpperCase()}.`);
  };
  const handleDelete = () => {
    try {
      deleteBulkJob(job.id);
      toast.success('Job deleted', `${job.name} was removed.`);
      router.push('/console/jobs');
    } catch (err: unknown) { toast.error('Could not delete', err instanceof Error ? err.message : 'Please try again.'); }
  };

  const filteredRows = filter === 'all' ? job.rows : job.rows.filter(r => filter === 'pending' ? (r.status === 'pending' || r.status === 'processing') : r.status === filter);
  const inputKeys = endpoint.parameters.map(p => p.name);

  const columns: Column<BulkJobRow>[] = [
    { key: 'index', header: '#', sortValue: r => r.index, render: r => <span className="font-mono text-xs text-fg-subtle">{r.index + 1}</span> },
    { key: 'input', header: 'Input', sortValue: r => r.input[inputKeys[0]] ?? '', render: r => <span className="font-mono text-xs text-fg truncate block max-w-[260px]">{inputKeys.map(k => r.input[k]).filter(Boolean).join(' · ') || <span className="text-fg-subtle">—</span>}</span> },
    { key: 'status', header: 'Status', sortValue: r => r.status, render: r => { const t = ROW_TONE[r.status]; return <StatusBadge tone={t.tone} dot pulse={t.pulse}>{t.label}</StatusBadge>; } },
    { key: 'http', header: 'HTTP', align: 'right', sortValue: r => r.httpStatus ?? -1, render: r => <span className={cn('font-mono text-xs', r.httpStatus && r.httpStatus >= 400 ? 'text-semantic-error' : 'text-fg-muted')}>{r.httpStatus || '—'}</span> },
    { key: 'latency', header: 'Latency', align: 'right', sortValue: r => r.durationMs ?? -1, render: r => <span className="font-mono text-xs text-fg-muted">{r.durationMs ? `${r.durationMs}ms` : '—'}</span> },
    { key: 'result', header: 'Result', render: r => <span className={cn('text-xs truncate block max-w-[320px]', r.status === 'succeeded' ? 'text-fg' : r.error ? 'text-semantic-error/90' : 'text-fg-subtle')}>{r.status === 'succeeded' ? firstOutputField(r.output) : r.error ?? (r.status === 'processing' ? 'In flight…' : 'Waiting')}</span> },
  ];

  const filterOptions: { value: RowFilter; label: string }[] = [
    { value: 'all', label: `All ${progress.total}` },
    { value: 'succeeded', label: `Succeeded ${progress.succeeded}` },
    { value: 'failed', label: `Failed ${progress.failed}` },
    { value: 'skipped', label: `Skipped ${progress.skipped}` },
    { value: 'pending', label: `Pending ${progress.pending + progress.processing}` },
  ];

  return (
    <div className="max-w-7xl mx-auto pb-12 space-y-6">
      {/* Header */}
      <div>
        <Link href="/console/jobs" className="inline-flex items-center gap-1 text-xs font-bold text-fg-muted hover:text-fg transition-colors mb-3"><ArrowLeft className="w-3.5 h-3.5" /> Bulk Jobs</Link>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-fg tracking-tight flex items-center gap-3 min-w-0">
              <span className="truncate min-w-0">{job.name}</span>
              <span className="shrink-0"><StatusBadge tone={meta.tone} dot pulse={meta.pulse}>{meta.label}</StatusBadge></span>
            </h1>
            <p className="text-sm text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-fg">{endpoint.method} {endpoint.path}</span>
              <span className="capitalize">{job.environment}</span>
              <span>{job.source.fileName ?? (job.source.kind === 'sample' ? 'sample dataset' : 'pasted list')} · {job.source.rowCount.toLocaleString()} rows</span>
              <span>created {relativeTime(job.createdAt)} by {job.createdBy}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRun && <Button onClick={handleRun} icon={<Play className="w-4 h-4" />}>{job.status === 'paused' ? 'Resume' : 'Run'}</Button>}
            {running && <Button variant="secondary" onClick={() => pauseBulkJob(job.id)} icon={<Pause className="w-4 h-4" />}>Pause</Button>}
            {running && <ConfirmAction variant="danger" onConfirm={() => cancelBulkJob(job.id)} confirmLabel="Confirm cancel">Cancel</ConfirmAction>}
            {!running && !isBilling && progress.failed > 0 && <Button variant="secondary" onClick={handleRetry} icon={<RotateCcw className="w-4 h-4" />}>Retry {progress.failed} failed</Button>}
            <Button variant="secondary" onClick={() => handleDownload('csv')} disabled={progress.done === 0} icon={<FileSpreadsheet className="w-4 h-4" />}>CSV</Button>
            <Button variant="secondary" onClick={() => handleDownload('json')} disabled={progress.done === 0} icon={<FileJson className="w-4 h-4" />}>JSON</Button>
            {!running && !isBilling && <ConfirmAction variant="ghost" onConfirm={handleDelete} confirmLabel="Delete forever?" icon={<Trash2 className="w-4 h-4" />}>Delete</ConfirmAction>}
          </div>
        </div>
      </div>

      {/* Stop reason */}
      {job.lastError && !running && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-semantic-warning/30 bg-semantic-warning/5 p-4">
          <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-semantic-warning mt-0.5 flex-shrink-0" /><div className="text-sm text-fg">{job.lastError}</div></div>
          {creditsShort && <Link href="/console/billing" onClick={() => track('upgrade_prompt_clicked', { surface: 'bulk-credits', job: job.id })} className="text-xs font-bold px-3 py-2 rounded-lg bg-teal/15 text-teal border border-teal/30 hover:bg-teal/25 transition-colors whitespace-nowrap">Recharge credits</Link>}
        </motion.div>
      )}

      {/* Progress + insight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-black text-fg-muted uppercase tracking-widest">Progress</div>
            <div className="text-xs text-fg-muted" aria-live="polite">{running ? `${progress.processing} in flight · ETA ${formatDuration(etaMs)}` : job.completedAt ? `Finished in ${formatDuration(elapsedMs)}` : job.status === 'paused' ? 'Paused — completed rows are kept' : 'Not started'}</div>
          </div>
          <div className="h-3 rounded-full bg-glass overflow-hidden flex" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-label="Rows processed">
            <motion.div className="h-full bg-teal" animate={{ width: `${progress.total ? (progress.succeeded / progress.total) * 100 : 0}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
            <motion.div className="h-full bg-semantic-error/80" animate={{ width: `${progress.total ? (progress.failed / progress.total) * 100 : 0}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
            <motion.div className="h-full bg-semantic-warning/70" animate={{ width: `${progress.total ? (progress.skipped / progress.total) * 100 : 0}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Stat icon={<CheckCircle2 className="w-3.5 h-3.5 text-teal" />} label="Succeeded" value={progress.succeeded.toLocaleString()} sub={progress.matchRate !== null ? `${Math.round(progress.matchRate * 100)}% match` : '—'} />
            <Stat icon={<XCircle className="w-3.5 h-3.5 text-semantic-error" />} label="Failed" value={progress.failed.toLocaleString()} sub={progress.failed ? 'retryable' : 'none'} />
            <Stat icon={<AlertTriangle className="w-3.5 h-3.5 text-semantic-warning" />} label="Skipped" value={progress.skipped.toLocaleString()} sub="invalid input · unbilled" />
            <Stat icon={<Clock className="w-3.5 h-3.5 text-fg-muted" />} label="Pending" value={(progress.pending + progress.processing).toLocaleString()} sub={running ? `${throughput} rows/min` : 'idle'} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-subtle">
            <Stat icon={<Coins className="w-3.5 h-3.5 text-fg-muted" />} label="Credits" value={job.creditsSpent.toLocaleString()} sub={`of ~${job.creditEstimate.toLocaleString()} estimated`} />
            <Stat icon={<Gauge className="w-3.5 h-3.5 text-fg-muted" />} label="Avg latency" value={progress.avgLatencyMs ? `${progress.avgLatencyMs}ms` : '—'} sub={`${job.concurrency}× concurrency`} />
            <Stat icon={<Clock className="w-3.5 h-3.5 text-fg-muted" />} label="Elapsed" value={formatDuration(elapsedMs)} sub={job.startedAt ? `started ${relativeTime(job.startedAt)}` : 'not started'} />
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col">
          <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-teal" /><div className="text-xs font-black text-fg-muted uppercase tracking-widest">Insight</div></div>
          <div className="text-sm font-bold text-fg leading-snug">{summary.headline}</div>
          <p className="text-xs text-fg-muted mt-2 leading-relaxed flex-1">{summary.detail}</p>
          <div className="mt-3 text-xs text-teal font-bold">→ {summary.action}</div>
          <div className="mt-4 pt-4 border-t border-border-subtle flex flex-wrap gap-2">
            <Link href={`/console/logs?endpoint=${encodeURIComponent(endpoint.path)}`} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-glass border border-border text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> View in Logs</Link>
            <Link href="/console/billing" className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-glass border border-border text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1"><Coins className="w-3 h-3" /> Billing</Link>
            {(job.status === 'completed' || job.status === 'completed_with_errors') && (
              <Link href="/console/webhooks" className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-teal/10 border border-teal/30 text-teal hover:bg-teal/20 transition-colors inline-flex items-center gap-1"><Webhook className="w-3 h-3" /> Automate with a webhook</Link>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Rows */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-black text-fg-muted uppercase tracking-widest">Rows</div>
          <div className="overflow-x-auto"><SegmentedControl<RowFilter> layoutId="job-row-filter" size="sm" value={filter} onChange={setFilter} options={filterOptions} /></div>
        </div>
        <DataTable<BulkJobRow>
          columns={columns}
          rows={filteredRows}
          rowKey={r => String(r.index)}
          pageSize={25}
          onRowClick={r => setSelectedRow(r)}
          emptyTitle={filter === 'all' ? 'No rows' : `No ${filter} rows`}
          emptyDescription={filter === 'failed' ? 'Nothing failed — nice.' : filter === 'skipped' ? 'Every row passed validation.' : 'Change the filter to see other rows.'}
        />
      </div>

      {/* Row detail */}
      <Drawer open={!!selectedRow} onClose={() => setSelectedRow(null)} title={selectedRow ? `Row ${selectedRow.index + 1}` : ''} description={selectedRow ? `${ROW_TONE[selectedRow.status].label}${selectedRow.httpStatus ? ` · HTTP ${selectedRow.httpStatus}` : ''}${selectedRow.durationMs ? ` · ${selectedRow.durationMs}ms` : ''}${selectedRow.attempts > 1 ? ` · ${selectedRow.attempts} attempts` : ''}` : undefined} widthClass="max-w-xl">
        {selectedRow && (
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-black text-fg-muted uppercase tracking-widest mb-2">Input</div>
              <JsonViewer data={selectedRow.input} />
            </div>
            {selectedRow.status === 'succeeded' && (
              <div>
                <div className="text-[11px] font-black text-fg-muted uppercase tracking-widest mb-2">Response{job.environment === 'live' ? ' · PII masked' : ''}</div>
                <JsonViewer data={selectedRow.output ?? null} />
              </div>
            )}
            {selectedRow.error && (
              <div role="alert" className="text-sm text-semantic-error bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-3 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{selectedRow.error}</div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-fg-muted font-bold">{icon}{label}</div>
      <div className="text-xl font-black text-fg mt-1 leading-none">{value}</div>
      <div className="text-[11px] text-fg-muted mt-1">{sub}</div>
    </div>
  );
}
