/**
 * F-068 Request coalescing — single-flight tests.
 * Real concurrency: fires overlapping promises and asserts the wave collapses.
 */
import {
  coalesceRequest,
  runCoalescingDrill,
  getCoalescingStats,
  fingerprintRequest,
  __resetCoalescing,
} from '@/lib/gateway/coalescing';

const delayed = <T>(value: T, ms = 20) => () => new Promise<T>((r) => setTimeout(() => r(value), ms));

beforeEach(() => __resetCoalescing());

describe('coalesceRequest — single-flight', () => {
  it('collapses N concurrent identical requests into one leader', async () => {
    const fp = fingerprintRequest('GET', '/v1/companies/enrich', { domain: 'stripe.com' });
    let upstreamRuns = 0;
    const work = () => { upstreamRuns += 1; return new Promise<string>((r) => setTimeout(() => r('OK'), 20)); };
    const results = await Promise.all(Array.from({ length: 8 }, () => coalesceRequest('k1', '/v1/companies/enrich', fp, 1, work)));

    expect(upstreamRuns).toBe(1); // only the leader ran the work
    expect(results.filter((r) => r.role === 'leader')).toHaveLength(1);
    expect(results.filter((r) => r.role === 'follower')).toHaveLength(7);
    expect(results.every((r) => r.result === 'OK')).toBe(true);
    expect(results.every((r) => r.waveSize === 8)).toBe(true);
  });

  it('does not coalesce sequential (non-overlapping) requests', async () => {
    const fp = fingerprintRequest('GET', '/v1/x', { a: 1 });
    let runs = 0;
    const work = () => { runs += 1; return Promise.resolve('v'); };
    const a = await coalesceRequest('k1', '/v1/x', fp, 1, work);
    const b = await coalesceRequest('k1', '/v1/x', fp, 1, work);
    expect(runs).toBe(2);
    expect(a.role).toBe('leader');
    expect(b.role).toBe('leader'); // the first settled before the second began
  });

  it('does not coalesce different fingerprints or different API keys', async () => {
    let runs = 0;
    const work = () => { runs += 1; return new Promise<string>((r) => setTimeout(() => r('v'), 15)); };
    const fpA = fingerprintRequest('GET', '/v1/x', { a: 1 });
    const fpB = fingerprintRequest('GET', '/v1/x', { a: 2 });
    await Promise.all([
      coalesceRequest('k1', '/v1/x', fpA, 1, work),
      coalesceRequest('k1', '/v1/x', fpB, 1, work), // different params
      coalesceRequest('k2', '/v1/x', fpA, 1, work), // different key
    ]);
    expect(runs).toBe(3);
  });

  it('clears in-flight state after settling', async () => {
    const fp = fingerprintRequest('GET', '/v1/x', { a: 1 });
    await Promise.all(Array.from({ length: 4 }, () => coalesceRequest('k1', '/v1/x', fp, 1, delayed('v'))));
    expect(getCoalescingStats().inFlightNow).toBe(0);
  });

  it('propagates a leader error to followers and cleans up', async () => {
    const fp = fingerprintRequest('GET', '/v1/x', { a: 1 });
    const work = () => new Promise<string>((_res, rej) => setTimeout(() => rej(new Error('upstream down')), 15));
    const settled = await Promise.allSettled(Array.from({ length: 3 }, () => coalesceRequest('k1', '/v1/x', fp, 1, work)));
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(getCoalescingStats().inFlightNow).toBe(0);
  });
});

describe('stats', () => {
  it('accrues coalesced count, credits saved, largest wave', async () => {
    const fp = fingerprintRequest('GET', '/v1/companies/enrich', { domain: 'x.com' });
    await Promise.all(Array.from({ length: 10 }, () => coalesceRequest('k1', '/v1/companies/enrich', fp, 2, delayed('v'))));
    const s = getCoalescingStats();
    expect(s.coalescedRequests).toBeGreaterThanOrEqual(9); // 9 followers (+ any seed)
    expect(s.upstreamCallsSaved).toBe(s.coalescedRequests);
    expect(s.creditsSaved).toBeGreaterThanOrEqual(18); // 9 followers × 2 credits
    expect(s.largestWave).toBeGreaterThanOrEqual(10);
    expect(s.recent[0].waveSize).toBe(10);
    expect(s.recent[0].upstreamCalls).toBe(1);
  });

  it('seeds continuous history on first read', () => {
    const s = getCoalescingStats();
    expect(s.recent.length).toBeGreaterThan(0);
    expect(s.wavesTotal).toBeGreaterThan(0);
  });
});

describe('runCoalescingDrill', () => {
  it('fires concurrent calls that collapse to one upstream call', async () => {
    const d = await runCoalescingDrill('k1', '/v1/people/search', 12, 1);
    expect(d.upstreamCalls).toBe(1);
    expect(d.coalesced).toBe(11);
    expect(d.waveSize).toBe(12);
    expect(d.creditsSaved).toBe(11);
  });

  it('clamps concurrency into a safe range', async () => {
    const lo = await runCoalescingDrill('k1', '/v1/x', 1, 1);
    expect(lo.concurrency).toBeGreaterThanOrEqual(2);
    const hi = await runCoalescingDrill('k1', '/v1/x', 999, 1);
    expect(hi.concurrency).toBeLessThanOrEqual(64);
  });
});
