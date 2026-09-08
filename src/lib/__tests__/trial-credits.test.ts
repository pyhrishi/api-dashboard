/**
 * Trial credit ledger (Phase 2, M3) — unit tests. Public-only + free-before-paid.
 */
import { isPublicApi, chargeTrial, trialUsedPct, TRIAL_FREE_CREDITS } from '@/lib/trial-credits';

describe('isPublicApi', () => {
  it('enrichment endpoints are Public', () => {
    expect(isPublicApi('/v1/people')).toBe(true);
    expect(isPublicApi('/v1/companies/enrich')).toBe(true);
    expect(isPublicApi('/v1/email/verify')).toBe(true);
    expect(isPublicApi('/v1/identity/resolve')).toBe(true);
  });
  it('premium / bulk / meta endpoints are NOT Public', () => {
    expect(isPublicApi('/v1/batch/enrich')).toBe(false);
    expect(isPublicApi('/v1/enrich/stream')).toBe(false);
    expect(isPublicApi('/v1/export')).toBe(false);
    expect(isPublicApi('/v1/people/search/ai')).toBe(false);
    expect(isPublicApi('/v1/encryption')).toBe(false);
    expect(isPublicApi('/v1/masking')).toBe(false);
  });
  it('normalizes a path without the /v1 prefix', () => {
    expect(isPublicApi('/people')).toBe(true);
  });
});

describe('chargeTrial — free-before-paid + Public-only', () => {
  it('Public call spends free credits first', () => {
    const r = chargeTrial({ free: 100, paid: 50 }, 30, true);
    expect(r.ok).toBe(true);
    expect(r.bucket).toBe('free');
    expect(r.fromFree).toBe(30);
    expect(r.fromPaid).toBe(0);
    expect(r.free).toBe(70);
    expect(r.paid).toBe(50);
  });
  it('Public call overflows into paid (mixed) when free runs out', () => {
    const r = chargeTrial({ free: 10, paid: 50 }, 30, true);
    expect(r.ok).toBe(true);
    expect(r.bucket).toBe('mixed');
    expect(r.fromFree).toBe(10);
    expect(r.fromPaid).toBe(20);
    expect(r.free).toBe(0);
    expect(r.paid).toBe(30);
  });
  it('premium call ignores free credits — paid only', () => {
    const r = chargeTrial({ free: 1000, paid: 40 }, 30, false);
    expect(r.ok).toBe(true);
    expect(r.bucket).toBe('paid');
    expect(r.fromFree).toBe(0);
    expect(r.free).toBe(1000);
    expect(r.paid).toBe(10);
  });
  it('premium call with only free credits fails with a clear message', () => {
    const r = chargeTrial({ free: 1000, paid: 0 }, 30, false);
    expect(r.ok).toBe(false);
    expect(r.bucket).toBeNull();
    expect(r.error).toMatch(/premium/i);
  });
  it('Public call fails when neither bucket covers it', () => {
    const r = chargeTrial({ free: 5, paid: 5 }, 30, true);
    expect(r.ok).toBe(false);
    expect(r.free).toBe(5);
    expect(r.paid).toBe(5);
  });
  it('zero-cost is a free no-op', () => {
    const r = chargeTrial({ free: 100, paid: 0 }, 0, true);
    expect(r.ok).toBe(true);
    expect(r.fromFree).toBe(0);
  });
});

describe('trialUsedPct', () => {
  it('computes percent of the granted free trial consumed', () => {
    expect(trialUsedPct(TRIAL_FREE_CREDITS)).toBe(0);
    expect(trialUsedPct(0)).toBe(100);
    expect(trialUsedPct(TRIAL_FREE_CREDITS / 2)).toBe(50);
  });
});
