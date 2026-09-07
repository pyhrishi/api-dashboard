import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateApiKey } from './src/lib/gateway/auth';
import { checkRateLimit } from './src/lib/gateway/rateLimiter';
import { buildRateLimitHeaders, buildRateLimitedHeaders } from './src/lib/gateway/rateLimitHeaders';
import {
  buildCspHeader, cspHeaderName, reportToHeader, hardeningHeaders, generateNonce,
  CSP_MODE_COOKIE, type CspMode,
} from './lib/csp';

/**
 * Attach the console Content-Security-Policy (F-315) to a page navigation. Defaults
 * to report-only (never blocks); an admin opts into enforce via the CSP_MODE_COOKIE,
 * which this Edge middleware reads so the toggle actually changes the served header.
 * A per-request nonce is exposed as `x-nonce` for the dynamic-hardening path. Fully
 * defensive — any failure falls back to an un-decorated response, never a 500.
 */
function applyConsoleCsp(request: NextRequest): NextResponse {
  try {
    const nonce = generateNonce();
    const mode: CspMode = request.cookies.get(CSP_MODE_COOKIE)?.value === 'enforce' ? 'enforce' : 'report-only';
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Prerendered pages carry inline scripts without a nonce, so the shipped policy
    // relies on 'unsafe-inline' — don't pin the nonce into the enforced script-src.
    response.headers.set(cspHeaderName(mode), buildCspHeader());
    response.headers.set('Report-To', reportToHeader());
    Object.entries(hardeningHeaders()).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  } catch {
    return NextResponse.next();
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Non-API routes are page navigations — attach the console CSP (F-315). Other
  // /api/* routes (the CSP report collector, docs, graphql, grpc) pass through.
  if (!pathname.startsWith('/api/v1')) {
    if (pathname.startsWith('/api')) {
      return NextResponse.next();
    }
    return applyConsoleCsp(request);
  }

  // CORS preflight (F-082): a browser preflight (OPTIONS) carries no Authorization
  // header, so it must bypass the auth gate. Forward it to the route handler, which
  // evaluates the CORS policy and answers with the Access-Control-* headers.
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  // 1. Authenticate
  const authHeader = request.headers.get('authorization');
  const authResult = validateApiKey(authHeader);

  if (!authResult.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: authResult.errorCode,
          message: authResult.error,
        },
        metadata: {
          requestId,
          timestamp,
        },
      },
      { status: 401 }
    );
  }

  // 2. Rate Limit
  const rateLimitResult = checkRateLimit(authResult.apiKey!);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
        },
        metadata: {
          requestId,
          timestamp,
        },
      },
      {
        status: 429,
        // Standard IETF RateLimit-* + RateLimit-Policy + Retry-After (and legacy X-).
        headers: { ...buildRateLimitedHeaders(rateLimitResult), 'X-RateLimit-Tier': rateLimitResult.tier },
      }
    );
  }

  // 3. Forward request with injected headers (route handler reads these), and set the
  //    standard rate-limit headers on the RESPONSE so every /api/v1 success carries them.
  const rateHeaders = { ...buildRateLimitHeaders(rateLimitResult), 'X-RateLimit-Tier': rateLimitResult.tier };
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-api-key', authResult.apiKey!);
  Object.entries(rateHeaders).forEach(([k, v]) => requestHeaders.set(k, v));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  Object.entries(rateHeaders).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export const config = {
  matcher: [
    '/api/v1/:path*',
    // Page routes only — exclude /api, Next internals, and any static file (has a dot).
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
