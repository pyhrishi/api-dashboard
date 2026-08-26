import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateApiKey } from './src/lib/gateway/auth';
import { checkRateLimit } from './src/lib/gateway/rateLimiter';

export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api/v1')) {
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
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.reset.toString(),
        }
      }
    );
  }

  // 3. Forward request with injected headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-api-key', authResult.apiKey!);
  requestHeaders.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
  requestHeaders.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  requestHeaders.set('X-RateLimit-Reset', rateLimitResult.reset.toString());

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: '/api/v1/:path*',
};
