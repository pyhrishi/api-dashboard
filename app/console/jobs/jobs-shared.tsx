/**
 * Shared presentation helpers for Bulk Enrichment Jobs (list + detail + wizard).
 */
import type { BulkJob, BulkJobStatus, MockKey } from '@/lib/store';
import type { BadgeTone } from '@/components/ui';
import { ScopeEndpointMap, type ApiScope } from '@/types/auth';
import { flattenObject, toCsv } from '@/lib/csv';

export const STATUS_META: Record<BulkJobStatus, { label: string; tone: BadgeTone; pulse?: boolean }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'teal', pulse: true },
  paused: { label: 'Paused', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  completed_with_errors: { label: 'Completed with errors', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export interface JobProgress {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  pending: number;
  processing: number;
  done: number;
  pct: number;
  matchRate: number | null;
  avgLatencyMs: number;
}

export function jobProgress(job: BulkJob): JobProgress {
  const total = job.rows.length;
  let succeeded = 0, failed = 0, skipped = 0, pending = 0, processing = 0, latencySum = 0, latencyN = 0;
  job.rows.forEach(r => {
    if (r.status === 'succeeded') succeeded++;
    else if (r.status === 'failed') failed++;
    else if (r.status === 'skipped') skipped++;
    else if (r.status === 'processing') processing++;
    else pending++;
    if (r.durationMs && (r.status === 'succeeded' || r.status === 'failed')) { latencySum += r.durationMs; latencyN++; }
  });
  const done = succeeded + failed + skipped;
  const attempted = succeeded + failed;
  return {
    total, succeeded, failed, skipped, pending, processing, done,
    pct: total ? Math.round((done / total) * 100) : 0,
    matchRate: attempted ? succeeded / attempted : null,
    avgLatencyMs: latencyN ? Math.round(latencySum / latencyN) : 0,
  };
}

export function keyHasScope(key: MockKey, path: string): boolean {
  // Seeded keys use the legacy 'all' wildcard; the gateway treats '*' and 'all' alike.
  if (key.scopes.includes('*') || key.scopes.includes('all')) return true;
  return key.scopes.some(s => (ScopeEndpointMap[s as ApiScope] ?? []).includes(path));
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Rough wall-clock estimate: rows / concurrency × observed (or assumed) latency. */
export function estimateDurationMs(rows: number, concurrency: number, avgLatencyMs = 450): number {
  if (rows <= 0) return 0;
  return Math.ceil(rows / Math.max(1, concurrency)) * avgLatencyMs;
}

export { relativeTime } from '@/lib/utils';

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Merge each row's input with its flattened output (or error) into export rows with a stable column order. */
export function jobExportRows(job: BulkJob): { columns: string[]; rows: Record<string, unknown>[] } {
  const inputCols = Object.keys(job.rows[0]?.input ?? {});
  const outputCols = new Set<string>();
  const rows = job.rows.map(r => {
    const base: Record<string, unknown> = { row: r.index + 1, ...r.input, status: r.status, http_status: r.httpStatus ?? '', error: r.error ?? '', latency_ms: r.durationMs ?? '' };
    if (r.status === 'succeeded') {
      const flat = flattenObject(r.output);
      Object.entries(flat).forEach(([k, v]) => { const col = `result.${k}`; outputCols.add(col); base[col] = v; });
    }
    return base;
  });
  const columns = ['row', ...inputCols, 'status', 'http_status', 'error', 'latency_ms', ...Array.from(outputCols).sort()];
  return { columns, rows };
}

export function jobToCsv(job: BulkJob): string {
  const { columns, rows } = jobExportRows(job);
  return toCsv(rows, columns);
}

export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bulk-job';
}
