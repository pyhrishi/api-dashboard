/**
 * Webhook-backed async results (F-072) — gateway module, single source of truth.
 *
 * When an async job (F-060) is submitted with a `callback_url`, the finished
 * result is *pushed* to that endpoint as a signed webhook POST instead of the
 * caller polling for it. This registry is the delivery engine: it schedules the
 * delivery for the job's completion, signs the payload, and — exactly like the
 * async-job store — derives each attempt's outcome *deterministically from
 * elapsed time*, so a delivery advances pending → retrying → delivered (or
 * exhausts to the dead-letter queue) with no background worker and no
 * `Math.random`. Failed deliveries retry with exponential backoff and can be
 * replayed on demand.
 */

import { sha256Hex } from '@/lib/sha256';

export type DeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'failed';
export type DeliveryEvent = 'job.completed' | 'job.failed';

/** Exponential backoff offsets (ms from the scheduled time) for attempts 1..N. */
const BACKOFF_MS = [0, 30_000, 120_000, 600_000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

export interface DeliveryAttempt {
  number: number;
  at: string; // ISO
  outcome: 'delivered' | 'failed';
  status_code: number;
  latency_ms: number;
  detail: string;
}

export interface DeliveryView {
  id: string;
  job_id: string;
  callback_url: string;
  event: DeliveryEvent;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string;
  next_retry_at?: string;
  delivered_at?: string;
  /** Stripe-style signature header value: `t=<unix>,v1=<sha256hex>`. */
  signature: string;
  signature_header: string;
  payload_preview: string;
  payload_size: number;
  replayed: boolean;
}

interface StoredDelivery {
  id: string;
  jobId: string;
  callbackUrl: string;
  event: DeliveryEvent;
  createdAt: number;
  /** Monotonic registration order — a stable "newest first" tiebreak. */
  ord: number;
  scheduledAt: number;
  payload: string;
  secret: string;
  replayedAt?: number;
}

const SIGNATURE_HEADER = 'X-Zinbit-Signature';
const DELIVERIES = new Map<string, StoredDelivery>();
let seq = 0;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}
const iso = (ms: number) => new Date(ms).toISOString();

/** Accept only well-formed http(s) callback URLs. */
export function isValidCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Which attempt (1-based) succeeds for this URL, or 0 to mean "never" (DLQ).
 * Deterministic per URL, with keyword overrides so a demo can force an outcome.
 */
function successAttempt(url: string): number {
  if (/fail|dlq|error|500|503/i.test(url)) return 0;
  if (/ok|success|200|deliver/i.test(url)) return 1;
  const h = hash(url) % 10;
  if (h < 6) return 1; // most deliver first try
  if (h < 9) return 2; // some need one retry
  return 0; // a few exhaust → DLQ
}

function signatureFor(secret: string, payload: string, scheduledAt: number): string {
  const t = Math.floor(scheduledAt / 1000);
  return `t=${t},v1=${sha256Hex(`${secret}.${t}.${payload}`)}`;
}

function failureDetail(url: string, attempt: number): { code: number; detail: string } {
  const modes = [
    { code: 503, detail: 'Endpoint returned 503 Service Unavailable' },
    { code: 500, detail: 'Endpoint returned 500 Internal Server Error' },
    { code: 0, detail: 'Connection timed out after 10s' },
  ];
  return modes[hash(`${url}:${attempt}`) % modes.length];
}

function attemptsUpTo(d: StoredDelivery, now: number): DeliveryAttempt[] {
  const successK = successAttempt(d.callbackUrl);
  const effectiveMax = successK > 0 ? successK : MAX_ATTEMPTS;
  const attempts: DeliveryAttempt[] = [];
  for (let k = 1; k <= effectiveMax; k++) {
    const at = d.scheduledAt + BACKOFF_MS[k - 1];
    if (at > now) break;
    const delivered = successK > 0 && k === successK;
    if (delivered) {
      attempts.push({
        number: k,
        at: iso(at),
        outcome: 'delivered',
        status_code: 200,
        latency_ms: 40 + (hash(`${d.id}:${k}:lat`) % 180),
        detail: 'Endpoint acknowledged with 200 OK',
      });
    } else {
      const f = failureDetail(d.callbackUrl, k);
      attempts.push({
        number: k,
        at: iso(at),
        outcome: 'failed',
        status_code: f.code,
        latency_ms: f.code === 0 ? 10_000 : 60 + (hash(`${d.id}:${k}:lat`) % 220),
        detail: f.detail,
      });
    }
  }
  return attempts;
}

function viewOf(d: StoredDelivery, now: number): DeliveryView {
  const successK = successAttempt(d.callbackUrl);
  const effectiveMax = successK > 0 ? successK : MAX_ATTEMPTS;
  const attempts = attemptsUpTo(d, now);

  let status: DeliveryStatus;
  let nextRetryAt: number | undefined;
  let deliveredAt: number | undefined;

  const deliveredAttempt = attempts.find((a) => a.outcome === 'delivered');
  if (attempts.length === 0) {
    status = 'pending';
    nextRetryAt = d.scheduledAt;
  } else if (deliveredAttempt) {
    status = 'delivered';
    deliveredAt = new Date(deliveredAttempt.at).getTime();
  } else if (attempts.length < effectiveMax) {
    status = 'retrying';
    nextRetryAt = d.scheduledAt + BACKOFF_MS[attempts.length]; // next attempt offset
  } else {
    status = 'failed'; // all attempts fired, none delivered → dead-letter
  }

  // A replay (manual re-drive) always succeeds and supersedes the outcome.
  if (d.replayedAt !== undefined && d.replayedAt <= now) {
    attempts.push({
      number: attempts.length + 1,
      at: iso(d.replayedAt),
      outcome: 'delivered',
      status_code: 200,
      latency_ms: 40 + (hash(`${d.id}:replay:lat`) % 120),
      detail: 'Manual replay acknowledged with 200 OK',
    });
    status = 'delivered';
    deliveredAt = d.replayedAt;
    nextRetryAt = undefined;
  }

  return {
    id: d.id,
    job_id: d.jobId,
    callback_url: d.callbackUrl,
    event: d.event,
    status,
    attempts,
    attempt_count: attempts.length,
    max_attempts: MAX_ATTEMPTS,
    created_at: iso(d.createdAt),
    scheduled_at: iso(d.scheduledAt),
    next_retry_at: nextRetryAt !== undefined ? iso(nextRetryAt) : undefined,
    delivered_at: deliveredAt !== undefined ? iso(deliveredAt) : undefined,
    signature: signatureFor(d.secret, d.payload, d.scheduledAt),
    signature_header: SIGNATURE_HEADER,
    payload_preview: d.payload.length > 220 ? `${d.payload.slice(0, 220)}…` : d.payload,
    payload_size: d.payload.length,
    replayed: d.replayedAt !== undefined,
  };
}

export interface RegisterDeliveryInput {
  jobId: string;
  callbackUrl: string;
  event?: DeliveryEvent;
  /** When the first delivery attempt fires (job completion time, ms). */
  scheduledAt: number;
  /** The result body that will be POSTed (already serialized). */
  payload: string;
}

/** Register a delivery for a job's callback. Returns the created delivery view. */
export function registerDelivery({ jobId, callbackUrl, event = 'job.completed', scheduledAt, payload }: RegisterDeliveryInput): DeliveryView {
  const ord = seq++;
  const id = `whd_${Date.now().toString(36)}${ord.toString(36)}`;
  const secret = `whsec_${sha256Hex(`${jobId}:${callbackUrl}`).slice(0, 32)}`;
  const d: StoredDelivery = { id, jobId, callbackUrl, event, createdAt: Date.now(), ord, scheduledAt, payload, secret };
  DELIVERIES.set(id, d);
  return viewOf(d, Date.now());
}

export function getDelivery(id: string): DeliveryView | null {
  const d = DELIVERIES.get(id);
  return d ? viewOf(d, Date.now()) : null;
}

export function listDeliveries(limit = 50): DeliveryView[] {
  const now = Date.now();
  return Array.from(DELIVERIES.values())
    .sort((a, b) => b.ord - a.ord)
    .slice(0, limit)
    .map((d) => viewOf(d, now));
}

export type ReplayResult = { success: true; delivery: DeliveryView } | { success: false; code: string; message: string };

/** Manually re-drive a delivery. Only a non-delivered delivery can be replayed. */
export function replayDelivery(id: string): ReplayResult {
  const d = DELIVERIES.get(id);
  if (!d) return { success: false, code: 'NOT_FOUND', message: `No delivery with id ${id}.` };
  const now = Date.now();
  const current = viewOf(d, now);
  if (current.status === 'delivered' && !d.replayedAt) {
    return { success: false, code: 'ALREADY_DELIVERED', message: 'This delivery already succeeded; nothing to replay.' };
  }
  d.replayedAt = now;
  return { success: true, delivery: viewOf(d, now) };
}

export interface DeliveryStats {
  total: number;
  delivered: number;
  retrying: number;
  failed: number;
  pending: number;
  success_rate: number; // 0..1 over terminal deliveries
  recent: DeliveryView[];
}

export function getDeliveryStats(): DeliveryStats {
  const all = listDeliveries(200);
  const by = (s: DeliveryStatus) => all.filter((d) => d.status === s).length;
  const delivered = by('delivered');
  const failed = by('failed');
  const terminal = delivered + failed;
  return {
    total: all.length,
    delivered,
    retrying: by('retrying'),
    failed,
    pending: by('pending'),
    success_rate: terminal > 0 ? delivered / terminal : 1,
    recent: all.slice(0, 20),
  };
}

/** Reset all state — test-only. */
export function __resetDeliveries(): void {
  DELIVERIES.clear();
  seq = 0;
  seeded = false;
}

// ─── Deterministic seed so the console reads as continuous ────────────────────
let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const day = 86_400_000;
  const now = Date.now();
  const seeds: { jobId: string; url: string; ago: number; rows: number }[] = [
    { jobId: 'job_seed_ok', url: 'https://hooks.acme.com/zinbit/results', ago: 2 * 3600_000, rows: 500 },
    { jobId: 'job_seed_retry', url: 'https://api.bigco.io/webhooks/enrichment', ago: 6 * 3600_000, rows: 1200 },
    { jobId: 'job_seed_dlq', url: 'https://webhook.fail.example.com/ingest', ago: 1 * day, rows: 80 },
  ];
  for (const s of seeds) {
    const scheduledAt = now - s.ago;
    const payload = JSON.stringify({ event: 'job.completed', job_id: s.jobId, total: s.rows, succeeded: s.rows, failed: 0 });
    const ord = seq++;
    const id = `whd_seed_${ord}`;
    const secret = `whsec_${sha256Hex(`${s.jobId}:${s.url}`).slice(0, 32)}`;
    DELIVERIES.set(id, { id, jobId: s.jobId, callbackUrl: s.url, event: 'job.completed', createdAt: scheduledAt - 5000, ord, scheduledAt, payload, secret });
  }
}
ensureSeed();
