/**
 * CSP violation report collector (F-315).
 *
 * The console's Content-Security-Policy points `report-uri`/`report-to` here, so a
 * browser POSTs a report whenever a resource is blocked (or, in report-only mode,
 * *would* be blocked). We parse both the legacy `application/csp-report` and the
 * Reporting API `application/reports+json` shapes, store them in the per-isolate
 * collector, and answer 204. Also serves GET for the console feed.
 *
 * This is a standalone route — NOT the `/api/v1/[...route]` gateway pipeline — so it
 * needs no API key and is exempt from rate-limiting (browsers send these
 * unauthenticated). Read-only GET returns the aggregated stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseViolationReport } from '@/lib/csp';
import { recordViolations, getCspReportStats } from '@/lib/gateway/cspReports';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // A malformed/empty body is not an error worth surfacing to a browser reporter.
    return new NextResponse(null, { status: 204 });
  }
  const violations = parseViolationReport(body);
  if (violations.length) recordViolations(violations);
  return new NextResponse(null, { status: 204 });
}

export function GET(): NextResponse {
  return NextResponse.json({ success: true, data: getCspReportStats(), metadata: { timestamp: Date.now() } });
}
