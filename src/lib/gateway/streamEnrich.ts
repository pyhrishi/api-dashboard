/**
 * Streaming inline enrichment (F-020) — gateway helper, single source of truth.
 *
 * The low-latency path: instead of holding a request open until a whole batch
 * finishes, the /v1/enrich/stream endpoint resolves each input and flushes its
 * result immediately as one NDJSON line, so a consumer processes row 1 while
 * row N is still resolving. This module is the pure, deterministic per-row
 * resolution + input handling the streaming route builds on; the actual stream
 * (ordering, flushing, backpressure) lives in the route handler. Results reuse
 * the same resolvers as every other surface, so a streamed row equals its
 * single-call equivalent. No `Math.random`.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';

export type StreamKind = 'people' | 'companies';
export type StreamRowStatus = 'matched' | 'missed' | 'error';

/** One NDJSON data row emitted by the stream. */
export interface StreamRow {
  type: 'row';
  index: number;
  input: string;
  status: StreamRowStatus;
  output?: Record<string, unknown>;
  error?: string;
  /** Simulated per-row resolve latency, ms. */
  latency_ms: number;
}

/** The stream's opening frame. */
export interface StreamStart {
  type: 'start';
  total: number;
  credits_charged: number;
  kind: StreamKind;
}
/** The stream's closing frame with a summary. */
export interface StreamEnd {
  type: 'end';
  total: number;
  matched: number;
  missed: number;
}

/** Max inputs accepted in one streaming request. */
export const MAX_STREAM_INPUTS = 500;

/** Per-row simulated resolve latency (ms) — small so the stream is visibly progressive. */
export const STREAM_ROW_DELAY_MS = 90;

/** Classify the requested operation into what kind of identifier it resolves. */
export function kindForEndpoint(endpoint: string): StreamKind {
  return /compan|domain|firmograph/i.test(endpoint) ? 'companies' : 'people';
}

/** Accept inputs as a JSON array or a comma/newline-delimited string. */
export function normalizeStreamInputs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.replace(/^\s*\[|\]\s*$/g, '').split(/[\n,]/).map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return [];
}

/** Deterministic latency for a row (stable per input, in a plausible band). */
function rowLatency(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 35 + ((h >>> 0) % 55); // 35..89 ms
}

/** Resolve a single streamed row deterministically. */
export function resolveStreamRow(kind: StreamKind, rawInput: string, index: number): StreamRow {
  const input = String(rawInput ?? '').trim();
  const latency_ms = rowLatency(input);

  if (!input) {
    return { type: 'row', index, input, status: 'error', error: 'EMPTY_INPUT', latency_ms };
  }

  if (kind === 'companies') {
    const c = resolveCompanyFromDomain(input);
    return c
      ? { type: 'row', index, input, status: 'matched', output: { name: c.name, domain: c.domain, industry: c.industry, employee_band: c.employee_band }, latency_ms }
      : { type: 'row', index, input, status: 'missed', error: 'NOT_FOUND', latency_ms };
  }

  // people — require an email-shaped input; otherwise it's a per-row error, not a crash.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
    return { type: 'row', index, input, status: 'error', error: 'INVALID_EMAIL', latency_ms };
  }
  const p = resolvePersonFromEmail(input);
  return p
    ? { type: 'row', index, input, status: 'matched', output: { full_name: p.full_name, title: p.title, company: p.company, email: p.email }, latency_ms }
    : { type: 'row', index, input, status: 'missed', error: 'NOT_FOUND', latency_ms };
}
