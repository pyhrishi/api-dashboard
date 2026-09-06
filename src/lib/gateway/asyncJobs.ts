/**
 * Async job endpoints (F-060) — gateway module, single source of truth.
 *
 * Kick off a long-running enrichment as a job (POST /v1/jobs), then poll it
 * (GET /v1/jobs/{id}) instead of holding a connection open for thousands of
 * rows. Jobs live in an in-memory store keyed by id; their progress is derived
 * *deterministically from elapsed time* on every read, so a poller sees a job
 * advance queued → running → completed with no background worker and no
 * `Math.random`. Results are produced from the same resolvers the rest of the
 * product uses, so an async job and a synchronous lookup agree on every row.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { deductCredits } from '@/lib/gateway/billing';

export type AsyncJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AsyncJobKind = 'people' | 'companies';

export interface AsyncJobResultRow {
  index: number;
  input: string;
  status: 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

/** Public job view returned by the API (never exposes the raw key or full input list). */
export interface AsyncJobView {
  id: string;
  kind: AsyncJobKind;
  endpoint: string;
  status: AsyncJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  /** 0..1 completion. */
  progress: number;
  credits_charged: number;
  created_at: string;
  updated_at: string;
  estimated_completion: string;
  /** Present once the job has completed (capped for large jobs). */
  results?: AsyncJobResultRow[];
  /** Set when a large job's results are truncated in the response. */
  results_truncated?: boolean;
}

interface StoredJob {
  id: string;
  keyPrefix: string;
  kind: AsyncJobKind;
  endpoint: string;
  inputs: string[];
  createdAt: number;
  creditsCharged: number;
  cancelled: boolean;
  cancelledAt?: number;
}

// Rows processed per second — tuned so a demo-sized job visibly advances.
const ROWS_PER_SECOND = 3;
// Max inputs accepted in a single job.
const MAX_INPUTS = 10_000;
// Results are inlined up to this size; larger jobs return a capped sample.
const RESULT_INLINE_CAP = 100;

const JOBS = new Map<string, StoredJob>();
let seq = 0;

function kindFor(endpoint: string): AsyncJobKind {
  return /compan|domain|firmograph/i.test(endpoint) ? 'companies' : 'people';
}

/** How many rows are done, purely from elapsed wall-clock — deterministic per read. */
function processedCount(job: StoredJob, now: number): number {
  const elapsedSec = Math.max(0, (now - job.createdAt) / 1000);
  return Math.min(job.inputs.length, Math.floor(elapsedSec * ROWS_PER_SECOND));
}

function resolveRow(kind: AsyncJobKind, input: string, index: number): AsyncJobResultRow {
  const value = input.trim();
  if (kind === 'companies') {
    const c = resolveCompanyFromDomain(value);
    return c
      ? { index, input: value, status: 'succeeded', output: { name: c.name, domain: c.domain, industry: c.industry, employee_band: c.employee_band } }
      : { index, input: value, status: 'failed', error: 'NOT_FOUND' };
  }
  const p = resolvePersonFromEmail(value);
  return p
    ? { index, input: value, status: 'succeeded', output: { full_name: p.full_name, title: p.title, company: p.company, email: p.email } }
    : { index, input: value, status: 'failed', error: 'NOT_FOUND' };
}

/** Derive the public view of a job at time `now`. */
function viewOf(job: StoredJob, now: number): AsyncJobView {
  const total = job.inputs.length;
  const processed = job.cancelled ? processedCount(job, job.cancelledAt ?? now) : processedCount(job, now);

  let status: AsyncJobStatus;
  if (job.cancelled) status = 'cancelled';
  else if (processed >= total) status = 'completed';
  else if (processed > 0) status = 'running';
  else status = 'queued';

  // Resolve the processed rows deterministically to tally succeeded/failed.
  const rows: AsyncJobResultRow[] = [];
  let succeeded = 0, failed = 0;
  for (let i = 0; i < processed; i++) {
    const row = resolveRow(job.kind, job.inputs[i], i);
    if (row.status === 'succeeded') succeeded++; else failed++;
    if (rows.length < RESULT_INLINE_CAP) rows.push(row);
  }

  const updatedAt = job.cancelled ? (job.cancelledAt ?? now) : job.createdAt + (processed / ROWS_PER_SECOND) * 1000;
  const remainingSec = Math.max(0, (total - processed) / ROWS_PER_SECOND);

  const view: AsyncJobView = {
    id: job.id,
    kind: job.kind,
    endpoint: job.endpoint,
    status,
    total,
    processed,
    succeeded,
    failed,
    progress: total > 0 ? Math.round((processed / total) * 100) / 100 : 1,
    credits_charged: job.creditsCharged,
    created_at: new Date(job.createdAt).toISOString(),
    updated_at: new Date(updatedAt).toISOString(),
    estimated_completion: new Date(now + remainingSec * 1000).toISOString(),
  };

  if (status === 'completed' || status === 'cancelled') {
    view.results = rows;
    view.results_truncated = total > RESULT_INLINE_CAP;
  }
  return view;
}

export interface CreateJobInput {
  apiKey: string;
  endpoint: string;
  inputs: unknown;
  perRowCost?: number;
}
export type CreateJobResult =
  | { success: true; job: AsyncJobView }
  | { success: false; code: string; message: string };

/** Create a job: validate, charge credits for the batch, and queue it. */
export function createAsyncJob({ apiKey, endpoint, inputs, perRowCost = 1 }: CreateJobInput): CreateJobResult {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { success: false, code: 'INVALID_PARAMETERS', message: 'Provide a non-empty "inputs" array of identifiers to enrich.' };
  }
  if (inputs.length > MAX_INPUTS) {
    return { success: false, code: 'JOB_TOO_LARGE', message: `A job accepts at most ${MAX_INPUTS.toLocaleString()} inputs; split larger batches.` };
  }
  const clean = inputs.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (clean.length === 0) {
    return { success: false, code: 'INVALID_PARAMETERS', message: 'Every input was empty after trimming.' };
  }

  const cost = clean.length * Math.max(1, Math.round(perRowCost));
  const charge = deductCredits(apiKey, cost);
  if (!charge.success) {
    return { success: false, code: 'PAYMENT_REQUIRED', message: charge.error ?? 'Insufficient credits for this job.' };
  }

  const id = `job_${Date.now().toString(36)}${(seq++).toString(36)}`;
  const job: StoredJob = {
    id,
    keyPrefix: apiKey.slice(0, 12),
    kind: kindFor(endpoint),
    endpoint,
    inputs: clean,
    createdAt: Date.now(),
    creditsCharged: cost,
    cancelled: false,
  };
  JOBS.set(id, job);
  return { success: true, job: viewOf(job, Date.now()) };
}

/** Poll a single job. */
export function getAsyncJob(id: string): AsyncJobView | null {
  const job = JOBS.get(id);
  return job ? viewOf(job, Date.now()) : null;
}

/** List recent jobs for a key, newest first. */
export function listAsyncJobs(apiKey: string, limit = 20): AsyncJobView[] {
  const prefix = apiKey.slice(0, 12);
  const now = Date.now();
  return Array.from(JOBS.values())
    .filter((j) => j.keyPrefix === prefix)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((j) => viewOf(j, now));
}

export type CancelJobResult =
  | { success: true; job: AsyncJobView }
  | { success: false; code: string; message: string };

/** Cancel a job if it has not already finished. */
export function cancelAsyncJob(id: string): CancelJobResult {
  const job = JOBS.get(id);
  if (!job) return { success: false, code: 'NOT_FOUND', message: `No job with id ${id}.` };
  const now = Date.now();
  const current = viewOf(job, now);
  if (current.status === 'completed') {
    return { success: false, code: 'JOB_ALREADY_COMPLETED', message: 'This job has already completed and cannot be cancelled.' };
  }
  if (current.status === 'cancelled') {
    return { success: true, job: current };
  }
  job.cancelled = true;
  job.cancelledAt = now;
  return { success: true, job: viewOf(job, now) };
}
