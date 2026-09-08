/**
 * Cross-customer anomaly & abuse detection (deep feature 2) — pure, deterministic.
 *
 * Alerts (feature 1) cover threshold conditions; this covers *behavioural* abuse that
 * a single threshold misses, across every customer and key:
 *   - credential sharing: one key used from several regions at once;
 *   - impossible travel: the same key in two regions minutes apart;
 *   - call burst: a spike of requests in a tiny window (scraping / a runaway loop);
 *   - enumeration: a run of 404s on a lookup endpoint (probing for records).
 * Signals roll up into a per-customer risk score. No I/O, no randomness — the same
 * ledger metadata always yields the same signals.
 */

import type { Customer, ManagedKey, LedgerEntry } from './types';

const DAY = 86_400_000;
const MIN = 60_000;

export type AbuseSignalType = 'credential_sharing' | 'impossible_travel' | 'call_burst' | 'enumeration';
export type AbuseSeverity = 'critical' | 'high' | 'medium';

export const ABUSE_LABEL: Record<AbuseSignalType, string> = {
  credential_sharing: 'Credential sharing', impossible_travel: 'Impossible travel', call_burst: 'Call burst', enumeration: 'Record enumeration',
};
export const ABUSE_DESCRIPTION: Record<AbuseSignalType, string> = {
  credential_sharing: 'One key is serving requests from several regions at once — the secret is likely shared beyond one deployment.',
  impossible_travel: 'The same key made requests from two regions minutes apart — geographically impossible for one caller.',
  call_burst: 'A burst of requests landed in a tiny window — scraping, a retry storm, or a runaway loop.',
  enumeration: 'A run of 404s on a lookup endpoint — the key is probing for records that do not exist.',
};
export const SEVERITY_RANK: Record<AbuseSeverity, number> = { critical: 0, high: 1, medium: 2 };

// Thresholds (editable in the real service; fixed here).
export const CREDENTIAL_MIN_REGIONS = 3;
export const IMPOSSIBLE_TRAVEL_MINUTES = 30;
export const BURST_WINDOW_MIN = 5;
export const BURST_MIN_CALLS = 40;
export const ENUM_MIN_404 = 15;
export const ENUM_MIN_SHARE = 0.4;
const WINDOW_HOURS = 24;

export interface AbuseSignal {
  /** Stable id — `${type}:${keyId}` — so a dismissal sticks across re-detection. */
  id: string;
  type: AbuseSignalType;
  severity: AbuseSeverity;
  customerId: string;
  customerName: string;
  keyId: string;
  keyName: string;
  keyFingerprint: string;
  keyPrefix: string;
  keyLast4: string;
  title: string;
  evidence: string;
  /** Magnitude that tripped the detector (regions, minutes, calls, 404s). */
  value: number;
  detectedAt: string;
  windowHours: number;
}

export interface RiskScore {
  customerId: string;
  customerName: string;
  score: number;
  level: 'high' | 'elevated' | 'low';
  signals: number;
  types: AbuseSignalType[];
}

function distinct<T>(xs: T[]): T[] { return Array.from(new Set(xs)); }

/** Max requests by one key inside any BURST_WINDOW_MIN window (two-pointer over sorted ts). */
function maxBurst(tsAsc: number[]): { count: number; at: number } {
  let best = 0; let bestAt = tsAsc[0] ?? 0; let lo = 0;
  const w = BURST_WINDOW_MIN * MIN;
  for (let hi = 0; hi < tsAsc.length; hi++) {
    while (tsAsc[hi] - tsAsc[lo] > w) lo++;
    if (hi - lo + 1 > best) { best = hi - lo + 1; bestAt = tsAsc[lo]; }
  }
  return { count: best, at: bestAt };
}

export function detectAbuse(customers: Customer[], keys: ManagedKey[], ledger: LedgerEntry[], now: number): AbuseSignal[] {
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const from = now - WINDOW_HOURS * (DAY / 24);
  const byKey = new Map<string, LedgerEntry[]>();
  ledger.forEach((e) => { if (e.ts >= from) { const a = byKey.get(e.keyId) ?? []; a.push(e); byKey.set(e.keyId, a); } });
  const out: AbuseSignal[] = [];
  const iso = new Date(now).toISOString();

  keys.forEach((k) => {
    const rows = (byKey.get(k.id) ?? []).slice().sort((a, b) => a.ts - b.ts);
    if (!rows.length) return;
    const base = { customerId: k.customerId, customerName: names.get(k.customerId) ?? k.customerId, keyId: k.id, keyName: k.name, keyFingerprint: k.fingerprint, keyPrefix: k.prefix, keyLast4: k.last4, detectedAt: iso, windowHours: WINDOW_HOURS };

    // Credential sharing — distinct regions on one key.
    const regions = distinct(rows.map((e) => e.region));
    if (regions.length >= CREDENTIAL_MIN_REGIONS) {
      out.push({ ...base, id: `credential_sharing:${k.id}`, type: 'credential_sharing', severity: 'critical', value: regions.length, title: `Key used from ${regions.length} regions`, evidence: `${k.prefix}••••${k.last4} served ${rows.length.toLocaleString()} calls from ${regions.join(', ')} in ${WINDOW_HOURS}h — one secret, many locations.` });
    }

    // Impossible travel — a region flip within IMPOSSIBLE_TRAVEL_MINUTES.
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].region !== rows[i - 1].region) {
        const gapMin = (rows[i].ts - rows[i - 1].ts) / MIN;
        if (gapMin <= IMPOSSIBLE_TRAVEL_MINUTES) {
          out.push({ ...base, id: `impossible_travel:${k.id}`, type: 'impossible_travel', severity: 'high', value: Math.round(gapMin), title: `${rows[i - 1].region} → ${rows[i].region} in ${Math.round(gapMin)} min`, evidence: `${k.prefix}••••${k.last4} called from ${rows[i - 1].region} then ${rows[i].region} ${Math.round(gapMin)} minutes apart — impossible for one caller.` });
          break;
        }
      }
    }

    // Call burst — a spike in a tiny window.
    const burst = maxBurst(rows.map((e) => e.ts));
    if (burst.count >= BURST_MIN_CALLS) {
      const sev: AbuseSeverity = burst.count >= BURST_MIN_CALLS * 1.5 ? 'high' : 'medium';
      out.push({ ...base, id: `call_burst:${k.id}`, type: 'call_burst', severity: sev, value: burst.count, title: `${burst.count} calls in ${BURST_WINDOW_MIN} min`, evidence: `${k.prefix}••••${k.last4} sent ${burst.count.toLocaleString()} requests inside a ${BURST_WINDOW_MIN}-minute window — ${Math.round(burst.count / BURST_WINDOW_MIN)}/min, far above its normal rate.` });
    }

    // Enumeration — a run of 404s.
    const notFound = rows.filter((e) => e.status === 404).length;
    const share = notFound / rows.length;
    if (notFound >= ENUM_MIN_404 && share >= ENUM_MIN_SHARE) {
      out.push({ ...base, id: `enumeration:${k.id}`, type: 'enumeration', severity: 'high', value: notFound, title: `${notFound} not-found lookups`, evidence: `${k.prefix}••••${k.last4} got ${notFound.toLocaleString()} 404s (${Math.round(share * 100)}% of its ${WINDOW_HOURS}h traffic) — probing for records that don't exist.` });
    }
  });

  return sortSignals(out);
}

const SEV_WEIGHT: Record<AbuseSeverity, number> = { critical: 40, high: 25, medium: 12 };

export function riskScores(signals: AbuseSignal[]): RiskScore[] {
  const byCust = new Map<string, { name: string; score: number; types: Set<AbuseSignalType>; n: number }>();
  signals.forEach((sig) => {
    const cur = byCust.get(sig.customerId) ?? { name: sig.customerName, score: 0, types: new Set<AbuseSignalType>(), n: 0 };
    cur.score += SEV_WEIGHT[sig.severity]; cur.types.add(sig.type); cur.n += 1;
    byCust.set(sig.customerId, cur);
  });
  return Array.from(byCust.entries())
    .map(([customerId, v]): RiskScore => ({ customerId, customerName: v.name, score: Math.min(100, v.score), level: v.score >= 50 ? 'high' : v.score >= 20 ? 'elevated' : 'low', signals: v.n, types: Array.from(v.types) }))
    .sort((a, b) => b.score - a.score);
}

export function sortSignals(signals: AbuseSignal[]): AbuseSignal[] {
  return signals.slice().sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.value - a.value || a.customerName.localeCompare(b.customerName));
}

export interface AbuseStats { total: number; critical: number; high: number; medium: number; byType: Partial<Record<AbuseSignalType, number>>; customersAtRisk: number }
export function abuseStats(signals: AbuseSignal[]): AbuseStats {
  const byType: Partial<Record<AbuseSignalType, number>> = {};
  signals.forEach((s) => { byType[s.type] = (byType[s.type] ?? 0) + 1; });
  return {
    total: signals.length,
    critical: signals.filter((s) => s.severity === 'critical').length,
    high: signals.filter((s) => s.severity === 'high').length,
    medium: signals.filter((s) => s.severity === 'medium').length,
    byType, customersAtRisk: distinct(signals.map((s) => s.customerId)).length,
  };
}
