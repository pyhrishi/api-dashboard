/**
 * Bulk Enrichment Jobs — the client-side execution engine.
 *
 * A job is a list of rows; each row becomes ONE real request through the production
 * gateway (`/api/v1/...`) using the job's key, exactly like the Explorer. Every round
 * trip is logged into `apiLogs` (so it flows into Logs / Analytics / Security), credits
 * and key usage are deducted on success, and 429s back off and retry automatically.
 *
 * The runner is a module-level singleton so a job keeps running while the user moves
 * around the console. A full page reload cannot survive — running jobs are marked
 * `paused` on hydration and can be resumed (completed rows are kept).
 */
import { useStore, type BulkJob, type BulkJobRow } from '@/lib/store';
import { ENDPOINTS, type Endpoint } from '@/data/endpoints';
import { validateAllParameters, hasValidationErrors, getFirstError } from '@/lib/validation';
import { track } from '@/lib/telemetry';
import { authHeaderValue, consoleApiUrl } from '@/lib/api-config';

/** The console's simulated client IP — matches the Explorer's default so IP allowlists behave identically. */
export const RUNNER_CLIENT_IP = '192.168.1.1';

interface Control { cancelled: boolean; paused: boolean }
const controls = new Map<string, Control>();

const MAX_ATTEMPTS = 3;
const FLUSH_MS = 120;

export function isJobRunning(id: string): boolean {
  return controls.has(id);
}

/** Jobs left in `running` by a reload can't actually be running — make that honest. */
export function reconcileStaleJobs(): void {
  const s = useStore.getState();
  s.bulkJobs.forEach(j => {
    if (j.status === 'running' && !controls.has(j.id)) {
      s.updateBulkJobRows(j.id, j.rows.filter(r => r.status === 'processing').map(r => ({ index: r.index, patch: { status: 'pending' as const } })), { status: 'paused', lastError: 'Interrupted by a page reload — resume to continue.', lastErrorCode: 'reload' });
    }
  });
}

export function pauseBulkJob(id: string): void {
  const c = controls.get(id);
  if (c) c.paused = true;
  else useStore.getState().updateBulkJob(id, { status: 'paused' });
}

export function cancelBulkJob(id: string): void {
  const c = controls.get(id);
  if (c) c.cancelled = true;
  const job = useStore.getState().bulkJobs.find(j => j.id === id);
  if (job && !c) finalize(job.id, 'cancelled');
  track('bulk_job_cancelled', { job: id, processed: job ? job.rows.filter(r => r.status !== 'pending').length : 0 });
}

function finalize(id: string, status: BulkJob['status'], lastError?: string, lastErrorCode?: BulkJob['lastErrorCode']) {
  const s = useStore.getState();
  const job = s.bulkJobs.find(j => j.id === id);
  if (!job) return;
  const stillProcessing = job.rows.filter(r => r.status === 'processing').map(r => ({ index: r.index, patch: { status: 'pending' as const } }));
  s.updateBulkJobRows(id, stillProcessing, {
    status,
    completedAt: status === 'completed' || status === 'completed_with_errors' || status === 'cancelled' ? new Date().toISOString() : undefined,
    lastError,
    lastErrorCode: lastError ? (lastErrorCode ?? job.lastErrorCode) : undefined,
  });
}

const buildUrl = (endpoint: Endpoint, input: Record<string, string>): string => consoleApiUrl(endpoint.path, input);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Start (or resume) a job. Resolves when the job stops for any reason. */
export async function startBulkJob(id: string): Promise<void> {
  if (controls.has(id)) return;
  const store = useStore.getState();
  const job = store.bulkJobs.find(j => j.id === id);
  if (!job) return;
  if (store.user?.role === 'billing') throw new Error('Billing users cannot run jobs');
  const endpoint = ENDPOINTS.find(e => e.id === job.endpointId);
  const key = store.activeKeys.find(k => k.id === job.keyId);
  if (!endpoint) { store.updateBulkJob(id, { status: 'paused', lastError: 'Endpoint no longer exists in the catalog.', lastErrorCode: 'endpoint_missing' }); return; }
  if (!key || key.status === 'revoked' || key.status === 'expired' || key.status === 'compromised') {
    store.updateBulkJob(id, { status: 'paused', lastError: 'The selected API key is no longer usable. Pick another key and resume.', lastErrorCode: 'key_unusable' });
    return;
  }
  if (key.allowedIps && key.allowedIps.length > 0 && !key.allowedIps.includes(RUNNER_CLIENT_IP)) {
    store.updateBulkJob(id, { status: 'paused', lastError: `This key's IP allowlist doesn't include the console runner (${RUNNER_CLIENT_IP}). Add it under Security, or pick another key.`, lastErrorCode: 'key_unusable' });
    return;
  }

  const control: Control = { cancelled: false, paused: false };
  controls.set(id, control);
  const orgId = store.activeOrganizationId;
  const isResume = !!job.startedAt;
  store.updateBulkJob(id, { status: 'running', startedAt: job.startedAt ?? new Date().toISOString(), lastError: undefined, lastErrorCode: undefined });
  track('bulk_job_started', { job: id, endpoint: endpoint.id, rows: job.rows.length, resume: isResume, environment: job.environment });

  // ── batched row updates ──────────────────────────────────────────────────────
  let pendingUpdates: { index: number; patch: Partial<BulkJobRow> }[] = [];
  let spentDelta = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    if (pendingUpdates.length === 0 && spentDelta === 0) return;
    const s = useStore.getState();
    if (s.activeOrganizationId !== orgId) return; // tenant switched — never write into another org's snapshot
    const current = s.bulkJobs.find(j => j.id === id);
    const updates = pendingUpdates; pendingUpdates = [];
    const delta = spentDelta; spentDelta = 0;
    s.updateBulkJobRows(id, updates, delta ? { creditsSpent: (current?.creditsSpent ?? 0) + delta } : undefined);
  };
  const queue = (index: number, patch: Partial<BulkJobRow>, credits = 0) => {
    pendingUpdates.push({ index, patch });
    spentDelta += credits;
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  };

  // ── per-row worker ───────────────────────────────────────────────────────────
  const runRow = async (row: BulkJobRow): Promise<void> => {
    const errors = validateAllParameters(endpoint.parameters, row.input);
    if (hasValidationErrors(errors)) {
      queue(row.index, { status: 'skipped', error: getFirstError(errors) ?? 'Invalid input', attempts: row.attempts });
      return;
    }
    queue(row.index, { status: 'processing' });

    let attempts = row.attempts;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      const s = useStore.getState();
      if (s.creditBalance < endpoint.creditCost) {
        control.paused = true;
        queue(row.index, { status: 'pending', attempts: attempts - 1 });
        useStore.getState().updateBulkJob(id, { lastError: `Insufficient credits — ${endpoint.creditCost} needed per row, ${s.creditBalance} left. Recharge to resume.`, lastErrorCode: 'insufficient_credits' });
        track('upgrade_prompt_shown', { surface: 'bulk-credits', job: id, shortfall: endpoint.creditCost - s.creditBalance });
        return;
      }
      const startedAt = performance.now();
      try {
        const res = await fetch(buildUrl(endpoint, row.input), {
          method: 'GET',
          headers: { Authorization: authHeaderValue(key.key), 'Content-Type': 'application/json', 'Idempotency-Key': `${id}:${row.index}:${attempts}` },
        });
        const durationMs = Math.round(performance.now() - startedAt);
        let body: unknown;
        try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }

        useStore.getState().logApiRequest({
          id: res.headers.get('x-request-id') || `req_${id.slice(-4)}_${row.index}_${attempts}`,
          environment: job.environment,
          timestamp: new Date().toISOString(),
          method: endpoint.method,
          path: endpoint.path,
          status: res.status,
          duration: durationMs,
          ip: RUNNER_CLIENT_IP,
          request: { headers: { Authorization: authHeaderValue(key.key), 'User-Agent': `zinbit-bulk/${id}` }, parameters: row.input, keyId: key.id },
          response: body,
        });

        if (res.ok) {
          const data = body && typeof body === 'object' && 'data' in (body as Record<string, unknown>) ? (body as { data: unknown }).data : body;
          useStore.getState().deductCredits(endpoint.creditCost);
          useStore.getState().incrementKeyUsage(key.id, endpoint.creditCost);
          queue(row.index, { status: 'succeeded', output: data, httpStatus: res.status, durationMs, attempts, error: undefined }, endpoint.creditCost);
          return;
        }

        const message = extractErrorMessage(body) ?? `${res.status} ${res.statusText || 'Request failed'}`;
        if (res.status === 429 && attempts < MAX_ATTEMPTS && !control.cancelled && !control.paused) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 800 * attempts);
          continue;
        }
        queue(row.index, { status: 'failed', error: message, httpStatus: res.status, durationMs, attempts });
        return;
      } catch (err: unknown) {
        const durationMs = Math.round(performance.now() - startedAt);
        if (attempts < MAX_ATTEMPTS && !control.cancelled && !control.paused) { await sleep(600 * attempts); continue; }
        queue(row.index, { status: 'failed', error: err instanceof Error ? err.message : 'Network error reaching the gateway', httpStatus: 0, durationMs, attempts });
        return;
      }
    }
  };

  // ── pool ─────────────────────────────────────────────────────────────────────
  const pending = job.rows.filter(r => r.status === 'pending' || r.status === 'processing');
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length && !control.cancelled && !control.paused) {
      if (useStore.getState().activeOrganizationId !== orgId) { control.paused = true; break; }
      const row = pending[cursor++];
      await runRow(row);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(job.concurrency, 8)) }, worker));

  if (flushTimer) clearTimeout(flushTimer);
  flush();
  controls.delete(id);

  const final = useStore.getState().bulkJobs.find(j => j.id === id);
  if (!final) return;
  if (control.cancelled) { finalize(id, 'cancelled'); return; }
  if (control.paused) {
    const switched = useStore.getState().activeOrganizationId !== orgId;
    finalize(id, 'paused', switched ? 'Paused because you switched organizations.' : final.lastError, switched ? 'tenant_switch' : final.lastErrorCode);
    return;
  }
  const failed = final.rows.filter(r => r.status === 'failed').length;
  const succeeded = final.rows.filter(r => r.status === 'succeeded').length;
  const skipped = final.rows.filter(r => r.status === 'skipped').length;
  finalize(id, failed > 0 ? 'completed_with_errors' : 'completed');
  track('bulk_job_completed', {
    job: id, endpoint: endpoint.id, rows: final.rows.length, succeeded, failed, skipped,
    credits: final.creditsSpent, durationMs: final.startedAt ? Date.now() - new Date(final.startedAt).getTime() : 0,
  });
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as { error?: unknown; message?: unknown };
  if (typeof b.message === 'string') return b.message;
  if (b.error && typeof b.error === 'object') {
    const e = b.error as { message?: unknown; code?: unknown };
    if (typeof e.message === 'string') return e.message;
    if (typeof e.code === 'string') return e.code;
  }
  if (typeof b.error === 'string') return b.error;
  return undefined;
}
