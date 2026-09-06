'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Boxes, Play, X, RefreshCw, CheckCircle2, Clock, Loader2, ChevronRight, AlertTriangle, Ban } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, Button, EmptyState, Skeleton, StatusBadge, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';

type JobKind = 'people' | 'companies';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface JobResultRow {
  index: number;
  input: string;
  status: 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}
interface AsyncJob {
  id: string;
  kind: JobKind;
  endpoint: string;
  status: JobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  progress: number;
  credits_charged: number;
  created_at: string;
  updated_at: string;
  estimated_completion: string;
  results?: JobResultRow[];
  results_truncated?: boolean;
}

const KIND_OPTIONS: { value: JobKind; label: string }[] = [
  { value: 'people', label: 'People (by email)' },
  { value: 'companies', label: 'Companies (by domain)' },
];
const KIND_ENDPOINT: Record<JobKind, string> = { people: 'people-search', companies: 'company-enrich' };
const SAMPLE: Record<JobKind, string> = {
  people: 'marcus@stripe.com\npriya.nair@zomato.in\nsarah@datadoghq.com\ndev@vercel.com\njordan@shopify.com',
  companies: 'stripe.com\ndatadoghq.com\nshopify.com\nzomato.in\nfigma.com',
};

function statusTone(s: JobStatus): BadgeTone {
  if (s === 'completed') return 'success';
  if (s === 'running') return 'teal';
  if (s === 'queued') return 'info';
  if (s === 'cancelled') return 'neutral';
  return 'error';
}
function barColor(s: JobStatus): string {
  if (s === 'completed') return 'bg-semantic-success';
  if (s === 'cancelled') return 'bg-fg-subtle';
  if (s === 'failed') return 'bg-semantic-error';
  return 'bg-teal';
}
const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

function AsyncJobsInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [jobs, setJobs] = useState<AsyncJob[]>([]);
  const [kind, setKind] = useState<JobKind>('people');
  const [inputText, setInputText] = useState(SAMPLE.people);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authFetch = useCallback((path: string, init?: RequestInit) =>
    fetch(path, { ...init, headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json', ...(init?.headers || {}) } }),
    [apiKey]);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/jobs');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Failed to load jobs');
      setJobs(Array.isArray(body?.data?.jobs) ? body.data.jobs : []);
      setPhase('ready');
    } catch {
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [authFetch]);

  useEffect(() => {
    track('async_jobs_viewed', { environment });
    refresh();
  }, [refresh, environment]);

  // Poll while any job is still in flight.
  const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (hasActive) pollRef.current = setInterval(refresh, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasActive, refresh]);

  async function createJob() {
    const inputs = inputText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (inputs.length === 0) { setFormError('Add at least one identifier, one per line.'); return; }
    setSubmitting(true); setFormError(null);
    try {
      const res = await authFetch('/api/v1/jobs', {
        method: 'POST',
        body: JSON.stringify({ endpoint: KIND_ENDPOINT[kind], inputs }),
      });
      const body = await res.json();
      if (!res.ok) { setFormError(body?.error?.message || 'Could not create the job.'); return; }
      track('async_job_created', { kind, size: inputs.length, environment });
      await refresh();
    } catch {
      setFormError('Network error reaching the gateway.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelJob(id: string) {
    try {
      await authFetch(`/api/v1/jobs/${id}/cancel`, { method: 'POST' });
      track('async_job_cancelled', { environment });
      await refresh();
    } catch { /* keep the list; next poll reconciles */ }
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Async Jobs"
        description="Kick off a long enrichment as a job and poll it to completion — the programmatic path for thousands of rows. Every job here runs through the real /v1/jobs API."
        icon={<Boxes />}
        actions={<Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /> Refresh</Button>}
      />

      {/* Create a job */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">New job</div>
          <SegmentedControl
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => { setKind(k); setInputText(SAMPLE[k]); setFormError(null); }}
            layoutId="async-job-kind"
            size="sm"
          />
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full mt-3 rounded-xl bg-surface-2 border border-border text-fg text-sm font-mono p-3 focus:outline-none focus:border-teal/50 transition-colors resize-y"
          placeholder={kind === 'people' ? 'one email per line' : 'one domain per line'}
        />
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <span className="text-[11px] text-fg-subtle">
            {inputText.split(/[\n,]/).map(s => s.trim()).filter(Boolean).length} input(s) · 1 credit each · billed on submit
          </span>
          <div className="flex items-center gap-2">
            {formError && <span className="text-[11px] font-semibold text-semantic-error">{formError}</span>}
            <Button variant="primary" size="sm" onClick={createJob} disabled={submitting || !apiKey}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start job
            </Button>
          </div>
        </div>
        {!apiKey && <p className="text-[11px] text-semantic-warning mt-2">No {environment} key found — create one in <Link href="/console/keys" className="underline">API Keys</Link> to run jobs.</p>}
      </GlassCard>

      {/* Job list */}
      <div className="mt-6">
        {phase === 'loading' ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : phase === 'error' ? (
          <GlassCard className="p-0">
            <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="Couldn't load jobs"
              description="The gateway didn't respond. Check your key and try again."
              action={<Button variant="secondary" onClick={refresh}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
          </GlassCard>
        ) : jobs.length === 0 ? (
          <GlassCard className="p-0">
            <EmptyState icon={<Boxes className="w-8 h-8" />} title="No jobs yet"
              description="Start a job above, or POST to /v1/jobs from your code and poll GET /v1/jobs/{id}. Jobs you create from the API show up here too." />
          </GlassCard>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {jobs.map((job) => (
                <motion.div key={job.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge tone={statusTone(job.status)} dot pulse={job.status === 'running'}>{job.status}</StatusBadge>
                      <span className="font-mono text-xs text-fg-muted">{job.id}</span>
                      <span className="text-[11px] text-fg-subtle capitalize">{job.kind}</span>
                      <span className="ml-auto text-[11px] text-fg-subtle flex items-center gap-1"><Clock className="w-3 h-3" /> {relTime(job.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 h-2 rounded-full bg-glass overflow-hidden">
                        <motion.div className={`h-full rounded-full ${barColor(job.status)}`} initial={false} animate={{ width: `${Math.round(job.progress * 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-fg-muted w-20 text-right">{job.processed}/{job.total}</span>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-[11px] text-fg-subtle flex-wrap">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-semantic-success" /> {job.succeeded} matched</span>
                      <span className="flex items-center gap-1"><X className="w-3 h-3 text-semantic-error" /> {job.failed} missed</span>
                      <span>{job.credits_charged} credits</span>
                      <div className="ml-auto flex items-center gap-2">
                        {(job.status === 'queued' || job.status === 'running') && (
                          <Button variant="ghost" size="sm" onClick={() => cancelJob(job.id)}><Ban className="w-3.5 h-3.5" /> Cancel</Button>
                        )}
                        {job.results && job.results.length > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded === job.id ? 'rotate-90' : ''}`} /> Results
                          </Button>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {expanded === job.id && job.results && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="mt-3 rounded-xl border border-border-subtle overflow-hidden">
                            {job.results.slice(0, 25).map((r) => (
                              <div key={r.index} className="flex items-center gap-3 px-3 py-2 bg-surface-2 border-b border-border-subtle last:border-0">
                                {r.status === 'succeeded'
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-semantic-success shrink-0" />
                                  : <X className="w-3.5 h-3.5 text-semantic-error shrink-0" />}
                                <span className="font-mono text-[11px] text-fg-muted truncate w-48">{r.input}</span>
                                <span className="text-[11px] text-fg truncate flex-1">
                                  {r.status === 'succeeded'
                                    ? String((r.output && (r.output.full_name || r.output.name)) ?? 'matched')
                                    : (r.error || 'no match')}
                                </span>
                              </div>
                            ))}
                            {job.results_truncated && (
                              <div className="px-3 py-2 text-[11px] text-fg-subtle bg-surface-2">Showing the first {job.results.length} of {job.total} rows. Fetch the job from the API for the full set.</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="flex items-center gap-3 pt-1 text-[11px] text-fg-subtle">
              <Link href="/console/jobs" className="hover:text-fg transition-colors">CSV bulk jobs</Link>
              <span>·</span>
              <Link href="/console/explorer" className="hover:text-fg transition-colors">Try in Explorer</Link>
              <span>·</span>
              <Link href="/console/logs" className="hover:text-fg transition-colors">View in Logs</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AsyncJobsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <AsyncJobsInner />
    </RoleGuard>
  );
}
