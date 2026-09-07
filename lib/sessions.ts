/**
 * Session management — the risk model & device parsing (single source of truth).
 *
 * Every signal here is DETERMINISTIC: derived from a session's real fields (location, IP,
 * created/last-active timestamps) and the active session it's compared against. Same input
 * → same verdict, on every render. No `Math.random`. The `/console/sessions` console and
 * the store's bulk actions both read these functions, so the risk a user sees is the risk
 * the "revoke all stale" action acts on.
 */

import type { ActiveSession, SessionPolicy } from '@/lib/store';

export type RiskLevel = 'normal' | 'elevated' | 'high';

export interface SessionRisk {
  level: RiskLevel;
  /** Plain-English signals behind the level (always at least one). */
  reasons: string[];
  /** Idle longer than the policy's idle timeout — should be re-authenticated. */
  isStale: boolean;
  /** Not on a private/corporate network. */
  isExternal: boolean;
  /** Milliseconds since last activity. */
  idleMs: number;
}

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'server';

export interface ParsedDevice {
  os: 'macOS' | 'iOS' | 'Windows' | 'Android' | 'Linux' | 'Unknown';
  type: DeviceType;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleTimeoutMins: 60,
  maxConcurrent: 5,
};

const MINUTE = 60_000;

/** Country code is the token after the last comma in "City, CC". */
function countryOf(location: string): string {
  const parts = location.split(',');
  return (parts[parts.length - 1] ?? '').trim().toUpperCase();
}

function cityOf(location: string): string {
  return (location.split(',')[0] ?? '').trim();
}

/** RFC-1918 / loopback ranges → a trusted (corporate/home) network. */
export function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip === '127.0.0.1' ||
    ip === '::1'
  );
}

/** Derive OS + form factor from the seeded device/browser strings, deterministically. */
export function parseDevice(session: Pick<ActiveSession, 'device' | 'browser'>): ParsedDevice {
  const d = session.device.toLowerCase();
  if (d.includes('iphone')) return { os: 'iOS', type: 'mobile' };
  if (d.includes('ipad')) return { os: 'iOS', type: 'tablet' };
  if (d.includes('android')) return { os: 'Android', type: d.includes('tab') ? 'tablet' : 'mobile' };
  if (d.includes('macbook') || d.includes('mac ') || d.includes('imac') || d.includes('mac os')) return { os: 'macOS', type: 'desktop' };
  if (d.includes('windows')) return { os: 'Windows', type: 'desktop' };
  if (d.includes('server')) return { os: 'Linux', type: 'server' };
  if (d.includes('linux') || d.includes('ubuntu')) return { os: 'Linux', type: 'desktop' };
  return { os: 'Unknown', type: 'desktop' };
}

/** Human "3h ago" / "just now" — shared by reasons + the console. */
export function relativeTime(fromIso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(fromIso));
  const mins = Math.floor(ms / MINUTE);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function humanIdle(ms: number): string {
  const mins = Math.floor(ms / MINUTE);
  if (mins < 60) return `${mins} minutes`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours`;
  return `${Math.floor(hrs / 24)} days`;
}

/**
 * Score one session's risk against the active ("current") session and the policy.
 * Deterministic and explainable — the reasons are the audit trail.
 */
export function scoreSession(
  session: ActiveSession,
  all: ActiveSession[],
  policy: SessionPolicy,
  now: number = Date.now(),
): SessionRisk {
  const idleMs = Math.max(0, now - Date.parse(session.lastActive));
  const isExternal = !isPrivateIp(session.ip);

  if (session.isCurrent) {
    return {
      level: 'normal',
      reasons: ['This is the device you’re using right now'],
      isStale: false,
      isExternal,
      idleMs,
    };
  }

  const current = all.find((s) => s.isCurrent) ?? null;
  const isStale = idleMs > policy.idleTimeoutMins * MINUTE;
  const ageMs = session.createdAt ? Math.max(0, now - Date.parse(session.createdAt)) : Number.POSITIVE_INFINITY;

  let points = 0;
  const reasons: string[] = [];

  if (current) {
    const curCountry = countryOf(current.location);
    const sessCountry = countryOf(session.location);
    if (sessCountry && curCountry && sessCountry !== curCountry) {
      points += 3;
      reasons.push(`Signed in from a different country (${session.location}) than your active session (${current.location})`);
      // A brand-new session on another continent while you're active here — impossible travel.
      if (ageMs < 2 * 60 * MINUTE) {
        points += 1;
        reasons.push('Created recently while you were active elsewhere — possible impossible-travel');
      }
    } else if (cityOf(session.location) !== cityOf(current.location)) {
      points += 1;
      reasons.push(`Different city (${session.location}) from your active session`);
    }
  }

  if (isExternal) {
    points += 1;
    reasons.push(`On an external network (${session.ip}), not your trusted corporate range`);
  }

  if (isStale) {
    points += 2;
    reasons.push(`Idle for ${humanIdle(idleMs)} — past the ${policy.idleTimeoutMins}-minute idle policy`);
  }

  const level: RiskLevel = points >= 3 ? 'high' : points >= 1 ? 'elevated' : 'normal';
  if (reasons.length === 0) reasons.push('Familiar location and recent activity — no anomalies');

  return { level, reasons, isStale, isExternal, idleMs };
}

export interface SessionSummary {
  total: number;
  others: number;
  stale: number;
  highRisk: number;
  overConcurrency: boolean;
}

/** Roll up the session list for the KPI tiles + concurrency check. */
export function summarizeSessions(
  sessions: ActiveSession[],
  policy: SessionPolicy,
  now: number = Date.now(),
): SessionSummary {
  let stale = 0;
  let highRisk = 0;
  sessions.forEach((s) => {
    const r = scoreSession(s, sessions, policy, now);
    if (r.isStale) stale += 1;
    if (r.level === 'high') highRisk += 1;
  });
  return {
    total: sessions.length,
    others: sessions.filter((s) => !s.isCurrent).length,
    stale,
    highRisk,
    overConcurrency: sessions.length > policy.maxConcurrent,
  };
}

/** The ids of stale (past-policy) non-current sessions — what "revoke all stale" targets. */
export function staleSessionIds(
  sessions: ActiveSession[],
  policy: SessionPolicy,
  now: number = Date.now(),
): string[] {
  return sessions
    .filter((s) => !s.isCurrent && scoreSession(s, sessions, policy, now).isStale)
    .map((s) => s.id);
}
