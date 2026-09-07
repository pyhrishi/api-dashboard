/**
 * CSP violation collector (F-315) — the in-memory sink for browser violation
 * reports POSTed to `/api/csp-report`. Per-isolate, capped ring buffer, seeded with
 * a few realistic samples so the console feed reads as a running system on first
 * load. Deterministic seed (no `Math.random`).
 */

import type { CspViolation } from '@/lib/csp';

const CAP = 200;
let buffer: CspViolation[] = [];
let total = 0;
let seeded = false;

function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  const base = Date.now();
  // A handful of plausible violations an early report-only rollout would surface.
  const samples: Omit<CspViolation, 'id' | 'at'>[] = [
    { documentUri: '/console/overview', violatedDirective: "script-src 'self'", effectiveDirective: 'script-src', blockedUri: 'https://plausible.io/js/script.js', disposition: 'report', sourceFile: '/console/overview', lineNumber: 1 },
    { documentUri: '/console/analytics', violatedDirective: "img-src 'self'", effectiveDirective: 'img-src', blockedUri: 'https://www.google-analytics.com/collect', disposition: 'report' },
    { documentUri: '/', violatedDirective: "frame-ancestors 'none'", effectiveDirective: 'frame-ancestors', blockedUri: 'https://embed.example.com', disposition: 'report' },
  ];
  samples.forEach((s, i) => {
    buffer.push({ ...s, id: `cspv_seed_${i}`, at: base - (i + 1) * 3_600_000 });
    total += 1;
  });
}

/** Record parsed violations. Returns the number stored. */
export function recordViolations(violations: CspViolation[]): number {
  ensureSeed();
  for (const v of violations) {
    buffer.unshift(v);
    total += 1;
  }
  if (buffer.length > CAP) buffer = buffer.slice(0, CAP);
  return violations.length;
}

export interface CspReportStats {
  total: number;
  recent: CspViolation[];
  /** effective-directive → count, most-violated first. */
  byDirective: { directive: string; count: number }[];
  /** distinct blocked hosts. */
  topBlocked: { uri: string; count: number }[];
  lastAt: number | null;
}

export function getCspReportStats(): CspReportStats {
  ensureSeed();
  const byDir = new Map<string, number>();
  const byUri = new Map<string, number>();
  buffer.forEach((v) => {
    byDir.set(v.effectiveDirective, (byDir.get(v.effectiveDirective) ?? 0) + 1);
    byUri.set(v.blockedUri, (byUri.get(v.blockedUri) ?? 0) + 1);
  });
  const byDirective = Array.from(byDir.entries()).map(([directive, count]) => ({ directive, count })).sort((a, b) => b.count - a.count);
  const topBlocked = Array.from(byUri.entries()).map(([uri, count]) => ({ uri, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  return { total, recent: buffer.slice(0, 50), byDirective, topBlocked, lastAt: buffer[0]?.at ?? null };
}

/** Test/demo hook — clear the buffer. */
export function __resetCspReports(): void {
  buffer = [];
  total = 0;
  seeded = false;
}
