/**
 * GraphQL gateway — the real endpoint.
 *
 * POST /api/graphql executes a GraphQL query against the same enrichment
 * resolvers, auth, billing, and live-key PII masking as the REST gateway — the
 * GraphQL surface is a first-class citizen, not a mock. Middleware only covers
 * /api/v1, so this route does its own auth (format-only, any well-formed
 * sk_test_/sk_live_ key, billing lazily provisions) and its own billing.
 *
 * GET /api/graphql serves the SDL, so the Explorer (and any client) can
 * introspect the schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/graphql/executor';
import { buildSDL } from '@/lib/graphql/schema';
import { deductCredits } from '@/lib/gateway/billing';
import { detectPrivacyFramework, applyPrivacyMasking } from '@/lib/gateway/privacy';

function requestId(): string {
  return `gql_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function apiKeyFrom(request: NextRequest): string {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-api-key') || '';
}

export async function GET() {
  // Serve the schema as SDL for introspection / the Explorer.
  return new NextResponse(buildSDL(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-GraphQL-Schema': 'zinbit-v1' },
  });
}

export async function POST(request: NextRequest) {
  const rid = requestId();

  // 1. Auth — format-only, matching the REST gateway (billing lazily provisions).
  const apiKey = apiKeyFrom(request);
  if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
    return NextResponse.json(
      { data: null, errors: [{ message: 'Unauthorized. Provide a Zinbit key (sk_test_* or sk_live_*) as a Bearer token.' }], extensions: { code: 'UNAUTHORIZED', requestId: rid } },
      { status: 401, headers: { 'X-Request-Id': rid } },
    );
  }

  // 2. Parse the request body.
  let body: { query?: unknown; variables?: unknown; operationName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, errors: [{ message: 'Request body must be JSON: { "query": "…", "variables": { … } }.' }], extensions: { code: 'BAD_REQUEST', requestId: rid } },
      { status: 400, headers: { 'X-Request-Id': rid } },
    );
  }
  const query = typeof body.query === 'string' ? body.query : '';
  const variables = (body.variables && typeof body.variables === 'object') ? body.variables as Record<string, unknown> : {};
  if (!query.trim()) {
    return NextResponse.json(
      { data: null, errors: [{ message: 'No GraphQL query provided.' }], extensions: { code: 'BAD_REQUEST', requestId: rid } },
      { status: 400, headers: { 'X-Request-Id': rid } },
    );
  }

  // 3. Execute.
  const result = execute(query, variables);

  // 4. Bill for the executed queries (a syntax error costs nothing).
  let remaining = -1;
  if (result.cost > 0) {
    const billing = deductCredits(apiKey, result.cost);
    if (!billing.success) {
      return NextResponse.json(
        { data: null, errors: [{ message: billing.error || 'Insufficient credits.' }], extensions: { code: 'PAYMENT_REQUIRED', cost: result.cost, requestId: rid } },
        { status: 402, headers: { 'X-Request-Id': rid } },
      );
    }
    remaining = billing.remaining;
  }

  // 5. Live-key PII masking (sandbox keys return full synthetic data).
  const isLive = apiKey.startsWith('sk_live_');
  let data = result.data;
  if (isLive && data) {
    const framework = detectPrivacyFramework(request.headers.get('x-country-code'));
    data = applyPrivacyMasking(data, framework) as Record<string, unknown> | null;
  }

  return NextResponse.json(
    {
      data,
      errors: result.errors.length ? result.errors : undefined,
      extensions: { cost: result.cost, remaining, masked: isLive, environment: isLive ? 'live' : 'sandbox', requestId: rid },
    },
    { status: 200, headers: { 'X-Request-Id': rid, 'X-GraphQL-Cost': String(result.cost) } },
  );
}
