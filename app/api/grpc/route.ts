/**
 * gRPC high-throughput channel — the real endpoint (gRPC-JSON transcoding).
 *
 * Browsers can't speak raw gRPC (HTTP/2 trailers), so — exactly as Envoy/Connect do
 * in production — the channel is exposed via gRPC-JSON transcoding over POST /api/grpc,
 * executing against the SAME resolvers, auth, billing, and live-key PII masking as the
 * REST + GraphQL gateways. GET /api/grpc serves the `.proto` for introspection.
 *
 * Body shapes:
 *   { service, method, message }            → unary call
 *   { service, method, messages: [ … ] }    → a streamed batch (bidi methods)
 *   { service, method, benchmark: N }        → run an N-message throughput benchmark
 *
 * Middleware only covers /api/v1, so this route does its own (format-only) auth and
 * billing, matching the REST gateway (billing lazily provisions well-formed keys).
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderProto, GRPC_SERVICE, METHODS } from '@/lib/grpc/schema';
import { invoke, invokeBatch, benchmark } from '@/lib/grpc/transcoder';
import { deductCredits } from '@/lib/gateway/billing';
import { detectPrivacyFramework, applyPrivacyMasking, enforceOptOutPropagation } from '@/lib/gateway/privacy';
import { isKeyBlocked, getBlock } from '@/lib/gateway/keyBlock';

function rid(): string {
  return `grpc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function apiKeyFrom(request: NextRequest): string {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-api-key') || '';
}

export async function GET() {
  return new NextResponse(renderProto(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-gRPC-Proto': `${GRPC_SERVICE}-v1`, 'X-gRPC-Transcoding': 'json' },
  });
}

export async function POST(request: NextRequest) {
  const id = rid();
  const H = { 'X-Request-Id': id, 'X-gRPC-Service': GRPC_SERVICE };

  const apiKey = apiKeyFrom(request);
  if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Provide a Zinbit key (sk_test_* or sk_live_*) as a Bearer token.' }, requestId: id }, { status: 401, headers: H });
  }
  // Compromised-key kill switch (F-119) — a revoked key is dead on the gRPC channel too.
  if (isKeyBlocked(apiKey)) {
    const block = getBlock(apiKey);
    return NextResponse.json({ error: { code: 'KEY_REVOKED', message: `This API key has been revoked${block ? ` (${block.reason})` : ''}.`, reason: block?.reason ?? 'compromised' }, requestId: id }, { status: 401, headers: { ...H, 'X-Key-Revoked': block?.reason ?? 'compromised' } });
  }

  let body: { service?: unknown; method?: unknown; message?: unknown; messages?: unknown; benchmark?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: { code: 'INVALID_ARGUMENT', message: 'Body must be JSON: { service, method, message | messages | benchmark }.' }, requestId: id }, { status: 400, headers: H });
  }

  const method = typeof body.method === 'string' ? body.method : '';
  if (!METHODS[method]) {
    return NextResponse.json({ error: { code: 'UNIMPLEMENTED', message: `Unknown method "${method}" on ${GRPC_SERVICE}. See GET /api/grpc for the .proto.` }, requestId: id }, { status: 404, headers: H });
  }

  const isLive = apiKey.startsWith('sk_live_');
  // Mirror the REST/GraphQL live-key governance: derive the framework from the key's
  // deterministic home region (middleware doesn't run here).
  const REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1'];
  const keyHash = Array.from(apiKey).reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 0);
  const homeRegion = REGIONS[Math.abs(keyHash) % REGIONS.length];
  const simulatedCountry = homeRegion === 'eu-west-1' ? 'DE' : homeRegion === 'ap-south-1' ? 'IN' : 'US';
  const framework = detectPrivacyFramework(request.headers.get('x-country-code') || simulatedCountry);
  const maskLive = (obj: Record<string, unknown> | null): Record<string, unknown> | null => {
    if (!isLive || !obj) return obj;
    const sanitized = enforceOptOutPropagation(obj).sanitizedData as Record<string, unknown> | null;
    return sanitized ? (applyPrivacyMasking(sanitized, framework) as Record<string, unknown>) : sanitized;
  };
  const masked = isLive && framework !== 'NONE';

  // ── Benchmark: run N deterministic messages, measure real elapsed → rps. ──
  if (body.benchmark != null) {
    const { result, error } = benchmark(method, Number(body.benchmark));
    if (!result) return NextResponse.json({ error: { code: 'INVALID_ARGUMENT', message: error ?? 'Benchmark failed.' }, requestId: id }, { status: 400, headers: H });
    const billing = deductCredits(apiKey, result.cost);
    if (!billing.success) return NextResponse.json({ error: { code: 'RESOURCE_EXHAUSTED', message: billing.error || 'Insufficient credits.' }, cost: result.cost, requestId: id }, { status: 402, headers: H });
    const start = performance.now();
    // Re-run to measure wall elapsed of the actual resolver work (deterministic result already computed).
    benchmark(method, result.count);
    const elapsedMs = Math.max(0.1, Math.round((performance.now() - start) * 100) / 100);
    const rps = Math.round(result.count / (elapsedMs / 1000));
    return NextResponse.json(
      { benchmark: { ...result, elapsedMs, rps }, extensions: { cost: result.cost, remaining: billing.remaining, multiplexed: true, environment: isLive ? 'live' : 'sandbox', requestId: id } },
      { status: 200, headers: { ...H, 'X-gRPC-Rps': String(rps), 'X-gRPC-Cost': String(result.cost) } },
    );
  }

  // ── Streamed batch. ──
  if (Array.isArray(body.messages)) {
    const messages = (body.messages as unknown[]).map((m) => (typeof m === 'object' && m !== null ? m as Record<string, unknown> : {}));
    const { result, error } = invokeBatch(method, messages);
    if (!result) return NextResponse.json({ error: { code: 'INVALID_ARGUMENT', message: error ?? 'Batch failed.' }, requestId: id }, { status: 400, headers: H });
    const billing = deductCredits(apiKey, result.cost);
    if (!billing.success) return NextResponse.json({ error: { code: 'RESOURCE_EXHAUSTED', message: billing.error || 'Insufficient credits.' }, cost: result.cost, requestId: id }, { status: 402, headers: H });
    const records = result.records.map((r) => ({ ...r, response: maskLive(r.response) }));
    return NextResponse.json(
      { records, matched: result.matched, missed: result.missed, extensions: { cost: result.cost, remaining: billing.remaining, masked, framework, multiplexed: true, environment: isLive ? 'live' : 'sandbox', requestId: id } },
      { status: 200, headers: { ...H, 'X-gRPC-Cost': String(result.cost) } },
    );
  }

  // ── Unary. ──
  const message = (typeof body.message === 'object' && body.message !== null) ? body.message as Record<string, unknown> : {};
  const r = invoke(method, message);
  if (r.error) return NextResponse.json({ error: { code: 'INVALID_ARGUMENT', message: r.error }, requestId: id }, { status: 400, headers: H });
  if (r.cost > 0) {
    const billing = deductCredits(apiKey, r.cost);
    if (!billing.success) return NextResponse.json({ error: { code: 'RESOURCE_EXHAUSTED', message: billing.error || 'Insufficient credits.' }, cost: r.cost, requestId: id }, { status: 402, headers: H });
    return NextResponse.json(
      { response: maskLive(r.response), matched: r.matched, extensions: { cost: r.cost, remaining: billing.remaining, masked, framework, environment: isLive ? 'live' : 'sandbox', requestId: id } },
      { status: 200, headers: { ...H, 'X-gRPC-Cost': String(r.cost) } },
    );
  }
  // A miss (no match) — 200 with null, no charge.
  return NextResponse.json(
    { response: null, matched: false, extensions: { cost: 0, environment: isLive ? 'live' : 'sandbox', requestId: id } },
    { status: 200, headers: { ...H, 'X-gRPC-Cost': '0' } },
  );
}
