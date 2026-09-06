import {
  getCircuitState, recordSuccess, recordFailure, forceCircuit, getCircuitSnapshot,
  FAILURE_THRESHOLD, __resetCircuits,
} from '@/lib/gateway/circuitBreaker';
import { upstreamForEndpoint, getUpstream, endpointsForUpstream, UPSTREAMS } from '@/lib/gateway/upstreams';

describe('circuit breaker per upstream (F-066)', () => {
  beforeEach(() => __resetCircuits());

  it('starts CLOSED for an unknown upstream', () => {
    expect(getCircuitState('smtp-verification')).toBe('CLOSED');
  });

  it('trips OPEN after the failure threshold, isolating just that upstream', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure('carrier-hlr');
    expect(getCircuitState('carrier-hlr')).toBe('OPEN');
    // A different upstream is unaffected — the whole point of per-upstream breakers.
    expect(getCircuitState('company-graph')).toBe('CLOSED');
  });

  it('a success below the threshold keeps it CLOSED and resets the streak', () => {
    recordFailure('mca-registry');
    recordFailure('mca-registry');
    recordSuccess('mca-registry');
    recordFailure('mca-registry');
    expect(getCircuitState('mca-registry')).toBe('CLOSED');
  });

  it('force OPEN drains, force CLOSED pins, auto clears the override', () => {
    forceCircuit('funding-database', 'OPEN');
    expect(getCircuitState('funding-database')).toBe('OPEN');
    forceCircuit('funding-database', 'CLOSED');
    expect(getCircuitState('funding-database')).toBe('CLOSED');
    // Even repeated failures can't trip a pinned-closed breaker.
    for (let i = 0; i < FAILURE_THRESHOLD + 2; i++) recordFailure('funding-database');
    expect(getCircuitState('funding-database')).toBe('CLOSED');
    forceCircuit('funding-database', 'auto');
    expect(getCircuitState('funding-database')).toBe('CLOSED');
  });

  it('snapshot reports failure rate, trip count, and forced state', () => {
    recordSuccess('news-monitor');
    recordFailure('news-monitor');
    const snap = getCircuitSnapshot('news-monitor');
    expect(snap.totalRequests).toBe(2);
    expect(snap.totalFailures).toBe(1);
    expect(snap.failureRate).toBe(0.5);
    forceCircuit('news-monitor', 'OPEN');
    const forced = getCircuitSnapshot('news-monitor');
    expect(forced.forced).toBe('OPEN');
    expect(forced.state).toBe('OPEN');
    expect(forced.trippedCount).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for the same call sequence (ignoring wall-clock fields)', () => {
    const run = () => {
      __resetCircuits();
      recordFailure('social-graph'); recordFailure('social-graph'); recordFailure('social-graph');
      const { state, failureCount, totalRequests, totalFailures, failureRate, trippedCount, forced } = getCircuitSnapshot('social-graph');
      return { state, failureCount, totalRequests, totalFailures, failureRate, trippedCount, forced };
    };
    expect(run()).toEqual(run());
    expect(run().state).toBe('OPEN');
  });
});

describe('upstream registry (F-066)', () => {
  it('maps endpoints to their real upstream, with a Zinbit Core fallback', () => {
    expect(upstreamForEndpoint('email-verify')).toBe('smtp-verification');
    expect(upstreamForEndpoint('domain-to-cin')).toBe('mca-registry');
    expect(upstreamForEndpoint('email-to-phone')).toBe('carrier-hlr');
    expect(upstreamForEndpoint('company-enrich')).toBe('company-graph');
    expect(upstreamForEndpoint('name-canonicalize')).toBe('zinbit-core');
    // Unknown endpoint → default.
    expect(upstreamForEndpoint('some-unknown-endpoint')).toBe('zinbit-core');
  });

  it('resolves every mapped upstream to a real provider', () => {
    UPSTREAMS.forEach((u) => expect(getUpstream(u.id)).toBeDefined());
    expect(getUpstream('smtp-verification')?.category).toBe('first-party');
  });

  it('lists the endpoints an upstream powers', () => {
    const smtp = endpointsForUpstream('smtp-verification');
    expect(smtp).toContain('email-verify');
    expect(smtp).toContain('catch-all-detect');
    expect(endpointsForUpstream('mca-registry')).toContain('domain-to-cin');
  });
});
