/**
 * gRPC high-throughput channel — server transcoder.
 *
 * Executes a gRPC method against the SAME deterministic resolvers the REST +
 * GraphQL gateways use, so all three protocols agree. `invoke` handles one unary
 * call; `invokeBatch` runs a stream of messages (the bidi/high-throughput methods);
 * `benchmark` generates N deterministic messages and runs them so the console can
 * show real channel throughput. Responses are projected to exactly the proto
 * message's fields, so a gRPC record decodes to the declared shape.
 *
 * Imported only by the route + jest (server) — never the client bundle. The
 * per-call latency model is deterministic (FNV jitter, no Math.random); the route
 * measures real wall-clock elapsed for the rps figure.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromIp } from '@/lib/ip-resolver';
import { METHODS, MESSAGES, inputKeyFor, type RpcMethod } from '@/lib/grpc/schema';

type GrpcResolver = (input: string) => Record<string, unknown> | null;

const RESOLVERS: Record<string, GrpcResolver> = {
  company: (domain) => (resolveCompanyFromDomain(domain) as unknown as Record<string, unknown>) ?? null,
  person: (email) => (resolvePersonFromEmail(email) as unknown as Record<string, unknown>) ?? null,
  companyByIp: (ip) => {
    const intel = resolveCompanyFromIp(ip);
    return (intel?.company as unknown as Record<string, unknown>) ?? null;
  },
};

export interface InvokeResult {
  response: Record<string, unknown> | null;
  matched: boolean;
  cost: number;
  error: string | null;
}

/** Project a resolver's output to exactly the response message's declared fields. */
function projectMessage(raw: Record<string, unknown>, responseType: string): Record<string, unknown> {
  const msg = MESSAGES[responseType];
  if (!msg) return raw;
  const out: Record<string, unknown> = {};
  msg.fields.forEach((f) => { if (f.name in raw) out[f.name] = raw[f.name]; });
  return out;
}

/** Execute one unary call. A miss (no match) is not an error and costs nothing. */
export function invoke(methodName: string, message: Record<string, unknown>): InvokeResult {
  const method = METHODS[methodName];
  if (!method) return { response: null, matched: false, cost: 0, error: `Unknown method "${methodName}" on ${'EnrichmentService'}.` };
  const resolver = RESOLVERS[method.resolverKey];
  if (!resolver) return { response: null, matched: false, cost: 0, error: `No resolver for "${methodName}".` };
  const key = inputKeyFor(method);
  const input = String(message?.[key] ?? '').trim();
  if (!input) return { response: null, matched: false, cost: 0, error: `Missing required field "${key}".` };
  const raw = resolver(input);
  if (!raw) return { response: null, matched: false, cost: 0, error: null };
  return { response: projectMessage(raw, method.responseType), matched: true, cost: method.creditCost, error: null };
}

export interface StreamRecord {
  input: string;
  matched: boolean;
  response: Record<string, unknown> | null;
}
export interface BatchResult {
  method: string;
  records: StreamRecord[];
  matched: number;
  missed: number;
  cost: number;
}

/** Execute a stream of messages (the bidi/high-throughput methods). */
export function invokeBatch(methodName: string, messages: Record<string, unknown>[]): { result: BatchResult | null; error: string | null } {
  const method = METHODS[methodName];
  if (!method) return { result: null, error: `Unknown method "${methodName}".` };
  const key = inputKeyFor(method);
  const records: StreamRecord[] = [];
  let matched = 0, missed = 0, cost = 0;
  for (let i = 0; i < messages.length; i++) {
    const r = invoke(methodName, messages[i]);
    const input = String(messages[i]?.[key] ?? '');
    records.push({ input, matched: r.matched, response: r.response });
    if (r.matched) { matched += 1; cost += r.cost; } else { missed += 1; }
  }
  return { result: { method: methodName, records, matched, missed, cost }, error: null };
}

// ── Throughput benchmark ─────────────────────────────────────────────────────

const MAX_BENCH = 5000;

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic per-call channel latency (ms) — base + FNV jitter. No Math.random. */
export function syntheticLatencyMs(input: string): number {
  const jitter = (fnv(input) % 1200) / 1000; // 0..1.2ms
  return Math.round((0.6 + jitter) * 1000) / 1000;
}

/** Generate a deterministic input message for benchmark index `i`. */
function benchInput(method: RpcMethod, i: number): Record<string, unknown> {
  const key = inputKeyFor(method);
  if (key === 'email') return { email: `user${i}@company${i % 250}.com` };
  if (key === 'ip') return { ip: `52.${(i >> 8) % 256}.${i % 256}.${(i * 7) % 256}` };
  return { domain: `acme-${i}.com` };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface BenchmarkResult {
  method: string;
  rpcType: string;
  count: number;
  matched: number;
  cost: number;
  /** Modeled per-call latency percentiles (ms). */
  p50: number;
  p95: number;
  p99: number;
  meanLatencyMs: number;
  /** Sum of modeled per-call latencies — the serial equivalent (ms). */
  serialMs: number;
  /** Concurrent streams the channel multiplexes over one connection. */
  multiplexedStreams: number;
}

/**
 * Run a throughput benchmark of `count` messages through `methodName`. Pure/
 * deterministic result (the route adds the measured wall elapsed → rps). Models a
 * multiplexed HTTP/2 channel: many concurrent streams over one connection.
 */
export function benchmark(methodName: string, count: number): { result: BenchmarkResult | null; error: string | null } {
  const method = METHODS[methodName];
  if (!method) return { result: null, error: `Unknown method "${methodName}".` };
  const n = Math.max(1, Math.min(MAX_BENCH, Math.floor(count) || 1));
  const messages = Array.from({ length: n }, (_, i) => benchInput(method, i));
  const batch = invokeBatch(methodName, messages).result!;
  const latencies = batch.records.map((r) => syntheticLatencyMs(r.input)).sort((a, b) => a - b);
  const serialMs = Math.round(latencies.reduce((s, x) => s + x, 0) * 1000) / 1000;
  const mean = latencies.length ? Math.round((serialMs / latencies.length) * 1000) / 1000 : 0;
  // A multiplexed HTTP/2 channel fans requests over many concurrent streams.
  const multiplexedStreams = Math.min(256, Math.max(8, Math.ceil(n / 16)));
  return {
    result: {
      method: methodName,
      rpcType: method.rpcType,
      count: n,
      matched: batch.matched,
      cost: batch.cost,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      meanLatencyMs: mean,
      serialMs,
      multiplexedStreams,
    },
    error: null,
  };
}
