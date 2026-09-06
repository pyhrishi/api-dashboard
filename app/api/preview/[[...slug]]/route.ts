/**
 * Dark-launch preview endpoints (F-081) — the gated route.
 *
 * GET /api/preview            → the preview program listing (public).
 * GET /api/preview/<id>?param → a gated preview call: it requires the caller to
 *   have opted in (header `x-preview-optin: <id>` or `true`); without it the
 *   endpoint returns 403 PREVIEW_ACCESS_REQUIRED with the enrollment hint, so a
 *   tester who hasn't opted in gets a clear, actionable error instead of a
 *   silent 404. Preview calls are FREE during the dark launch (0 credits) and
 *   carry X-Preview-Stage / X-Preview-GA headers.
 *
 * Middleware only covers /api/v1, so this route does its own auth (format-only,
 * any well-formed sk_test_/sk_live_ key — same rule as the rest of the gateway).
 */

import { NextRequest, NextResponse } from 'next/server';
import { PREVIEW_ENDPOINTS, previewById } from '@/lib/preview-program';
import { PREVIEW_RESOLVERS } from '@/lib/preview-resolvers';

function rid(): string {
  return `pv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function apiKeyFrom(request: NextRequest): string {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-api-key') || '';
}

export async function GET(request: NextRequest, { params }: { params: { slug?: string[] } }) {
  const requestId = rid();
  const slug = params.slug ?? [];

  // Program listing — public, no auth needed (it advertises the dark launch).
  if (slug.length === 0) {
    return NextResponse.json(
      { previews: PREVIEW_ENDPOINTS },
      { status: 200, headers: { 'X-Request-Id': requestId } },
    );
  }

  const id = slug[0];
  const preview = previewById(id);
  if (!preview) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: `No preview endpoint "${id}". See GET /api/preview for the program.` }, metadata: { requestId } },
      { status: 404, headers: { 'X-Request-Id': requestId } },
    );
  }

  // Auth — format-only, matching the rest of the gateway.
  const apiKey = apiKeyFrom(request);
  if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Provide a Zinbit key (sk_test_* or sk_live_*) as a Bearer token.' }, metadata: { requestId } },
      { status: 401, headers: { 'X-Request-Id': requestId } },
    );
  }

  // The dark-launch gate — the opt-in must name this preview (or be a blanket 'true').
  const optIn = request.headers.get('x-preview-optin') || '';
  const optedIn = optIn === 'true' || optIn.split(',').map((s) => s.trim()).includes(id);
  if (!optedIn) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PREVIEW_ACCESS_REQUIRED',
          message: `"${preview.name}" is in ${preview.stage} preview. Opt in from the console (Preview Program) or send header "x-preview-optin: ${id}".`,
        },
        preview: { id, stage: preview.stage, targetGA: preview.targetGA },
        metadata: { requestId },
      },
      { status: 403, headers: { 'X-Request-Id': requestId, 'X-Preview-Stage': preview.stage } },
    );
  }

  // Resolve the preview response from the SSOT resolver.
  const arg = new URL(request.url).searchParams.get(preview.param.name) || '';
  if (!arg) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_PARAMETERS', message: `Missing required parameter "${preview.param.name}".` }, metadata: { requestId } },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }
  const data = PREVIEW_RESOLVERS[preview.resolverKey]?.(arg) ?? null;
  if (!data) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: `No preview result for that ${preview.param.name}.` }, metadata: { requestId } },
      { status: 404, headers: { 'X-Request-Id': requestId, 'X-Preview-Stage': preview.stage } },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data,
      preview: { id, name: preview.name, stage: preview.stage, targetGA: preview.targetGA, billed: false },
      metadata: { requestId, cost: 0, note: 'Preview endpoints are free during the dark launch.' },
    },
    {
      status: 200,
      headers: { 'X-Request-Id': requestId, 'X-Preview-Stage': preview.stage, 'X-Preview-GA': preview.targetGA, 'X-Preview-Cost': '0' },
    },
  );
}
