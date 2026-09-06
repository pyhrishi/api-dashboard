import { NextResponse } from 'next/server';
import { getHealthSnapshot } from '@/lib/health';

/**
 * Programmatic health & status endpoint (F-073) — public and unauthenticated,
 * outside the billed /v1 catalog. Returns component-level status, degraded-mode,
 * latency, and 60-day uptime from the same source as the public /status page.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = getHealthSnapshot();
  const httpStatus = snapshot.status === 'down' ? 503 : 200;
  return NextResponse.json(
    { ...snapshot, checked_at: new Date().toISOString() },
    { status: httpStatus, headers: { 'Cache-Control': 'no-store' } },
  );
}
