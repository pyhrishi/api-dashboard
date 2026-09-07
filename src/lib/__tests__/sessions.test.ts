import {
  scoreSession, summarizeSessions, staleSessionIds, parseDevice, isPrivateIp, relativeTime,
  DEFAULT_SESSION_POLICY,
} from '@/lib/sessions';
import type { ActiveSession, SessionPolicy } from '@/lib/store';

const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);
const POLICY: SessionPolicy = { idleTimeoutMins: 60, maxConcurrent: 5 };

const mk = (over: Partial<ActiveSession>): ActiveSession => ({
  id: 'sess_x', device: 'MacBook Pro', browser: 'Chrome', location: 'Bengaluru, IN',
  ip: '192.168.1.1', lastActive: new Date(NOW).toISOString(), isCurrent: false,
  createdAt: new Date(NOW - 3 * 86400000).toISOString(), type: 'console', ...over,
});

const current = mk({ id: 'cur', isCurrent: true, location: 'Bengaluru, IN', ip: '192.168.1.1' });

describe('parseDevice', () => {
  it('maps device strings to OS + form factor', () => {
    expect(parseDevice({ device: 'MacBook Pro', browser: 'Chrome' })).toEqual({ os: 'macOS', type: 'desktop' });
    expect(parseDevice({ device: 'iPhone 14 Pro', browser: 'Safari' })).toEqual({ os: 'iOS', type: 'mobile' });
    expect(parseDevice({ device: 'Windows Desktop', browser: 'Firefox' })).toEqual({ os: 'Windows', type: 'desktop' });
    expect(parseDevice({ device: 'Linux Server', browser: 'cli' })).toEqual({ os: 'Linux', type: 'server' });
    expect(parseDevice({ device: 'Something Odd', browser: 'x' })).toEqual({ os: 'Unknown', type: 'desktop' });
  });
});

describe('isPrivateIp', () => {
  it('recognizes RFC-1918 + loopback, rejects public', () => {
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.254.1')).toBe(true);
    expect(isPrivateIp('172.32.0.1')).toBe(false); // outside 16-31
    expect(isPrivateIp('52.204.19.77')).toBe(false);
  });
});

describe('scoreSession', () => {
  it('marks the current session normal', () => {
    const r = scoreSession(current, [current], POLICY, NOW);
    expect(r.level).toBe('normal');
    expect(r.isStale).toBe(false);
    expect(r.reasons[0]).toMatch(/right now/i);
  });

  it('same city + private IP + recent → normal', () => {
    const s = mk({ id: 's1', location: 'Bengaluru, IN', ip: '172.16.254.1', lastActive: new Date(NOW - 5 * 60000).toISOString() });
    const r = scoreSession(s, [current, s], POLICY, NOW);
    expect(r.level).toBe('normal');
    expect(r.reasons.join(' ')).toMatch(/no anomalies/i);
  });

  it('different city → elevated', () => {
    const s = mk({ id: 's2', location: 'Mumbai, IN', ip: '10.0.0.5', lastActive: new Date(NOW - 5 * 60000).toISOString() });
    const r = scoreSession(s, [current, s], POLICY, NOW);
    expect(r.level).toBe('elevated');
    expect(r.reasons.some((x) => /different city/i.test(x))).toBe(true);
  });

  it('foreign country + external network + stale → high, with all reasons', () => {
    const s = mk({
      id: 's3', location: 'Ashburn, US', ip: '52.204.19.77',
      lastActive: new Date(NOW - 5 * 3600000).toISOString(), // 5h idle > 60m policy
      createdAt: new Date(NOW - 10 * 86400000).toISOString(),
    });
    const r = scoreSession(s, [current, s], POLICY, NOW);
    expect(r.level).toBe('high');
    expect(r.isStale).toBe(true);
    expect(r.isExternal).toBe(true);
    expect(r.reasons.some((x) => /different country/i.test(x))).toBe(true);
    expect(r.reasons.some((x) => /external network/i.test(x))).toBe(true);
    expect(r.reasons.some((x) => /idle for/i.test(x))).toBe(true);
  });

  it('flags impossible-travel for a fresh foreign session', () => {
    const s = mk({
      id: 's4', location: 'Sydney, AU', ip: '52.1.1.1',
      lastActive: new Date(NOW - 60000).toISOString(),
      createdAt: new Date(NOW - 30 * 60000).toISOString(), // created 30m ago, < 2h
    });
    const r = scoreSession(s, [current, s], POLICY, NOW);
    expect(r.level).toBe('high');
    expect(r.reasons.some((x) => /impossible-travel/i.test(x))).toBe(true);
  });

  it('is deterministic', () => {
    const s = mk({ id: 's5', location: 'Mumbai, IN' });
    expect(scoreSession(s, [current, s], POLICY, NOW)).toEqual(scoreSession(s, [current, s], POLICY, NOW));
  });
});

describe('summarizeSessions + staleSessionIds', () => {
  const stale = mk({ id: 'stale', location: 'Mumbai, IN', ip: '10.0.0.5', lastActive: new Date(NOW - 26 * 3600000).toISOString() });
  const fresh = mk({ id: 'fresh', location: 'Bengaluru, IN', ip: '172.16.254.1', lastActive: new Date(NOW - 60000).toISOString() });
  const sessions = [current, fresh, stale];

  it('counts totals, others, stale, concurrency', () => {
    const sum = summarizeSessions(sessions, POLICY, NOW);
    expect(sum.total).toBe(3);
    expect(sum.others).toBe(2);
    expect(sum.stale).toBe(1);
    expect(sum.overConcurrency).toBe(false);
  });

  it('overConcurrency trips past maxConcurrent', () => {
    const tight: SessionPolicy = { idleTimeoutMins: 60, maxConcurrent: 2 };
    expect(summarizeSessions(sessions, tight, NOW).overConcurrency).toBe(true);
  });

  it('staleSessionIds returns only non-current stale ids', () => {
    const ids = staleSessionIds(sessions, POLICY, NOW);
    expect(ids).toEqual(['stale']);
  });
});

describe('relativeTime', () => {
  it('formats buckets', () => {
    expect(relativeTime(new Date(NOW - 30000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW - 5 * 60000).toISOString(), NOW)).toBe('5m ago');
    expect(relativeTime(new Date(NOW - 3 * 3600000).toISOString(), NOW)).toBe('3h ago');
    expect(relativeTime(new Date(NOW - 26 * 3600000).toISOString(), NOW)).toBe('yesterday');
    expect(relativeTime(new Date(NOW - 3 * 86400000).toISOString(), NOW)).toBe('3d ago');
  });
});

describe('DEFAULT_SESSION_POLICY', () => {
  it('matches the seeded policy', () => {
    expect(DEFAULT_SESSION_POLICY).toEqual({ idleTimeoutMins: 60, maxConcurrent: 5 });
  });
});
