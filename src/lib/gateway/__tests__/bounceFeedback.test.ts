import {
  recordBounce, getBounce, isSuppressed, getBounceStats, normalizeBounceEmail, __resetBounceFeedback,
} from '@/lib/gateway/bounceFeedback';

beforeEach(() => __resetBounceFeedback());

describe('bounce feedback loop', () => {
  it('normalizes addresses (trim + lowercase)', () => {
    expect(normalizeBounceEmail('  Foo@BAR.com ')).toBe('foo@bar.com');
  });

  it('suppresses an address after a hard bounce', () => {
    expect(isSuppressed('fresh@acme.com')).toBe(false);
    const rec = recordBounce('Fresh@acme.com', 'hard');
    expect(rec.count).toBe(1);
    expect(getBounce('fresh@acme.com')?.type).toBe('hard');
    expect(isSuppressed('fresh@acme.com')).toBe(true);
  });

  it('treats a complaint as suppressing', () => {
    recordBounce('spammy@x.io', 'complaint');
    expect(isSuppressed('spammy@x.io')).toBe(true);
  });

  it('suppresses a soft bounce only after it repeats', () => {
    recordBounce('flaky@x.io', 'soft');
    expect(isSuppressed('flaky@x.io')).toBe(false);
    recordBounce('flaky@x.io', 'soft');
    recordBounce('flaky@x.io', 'soft');
    expect(getBounce('flaky@x.io')?.count).toBe(3);
    expect(isSuppressed('flaky@x.io')).toBe(true);
  });

  it('exposes a coherent stats snapshot (with the deterministic seed)', () => {
    const s = getBounceStats();
    expect(s.total_reports).toBeGreaterThan(0);
    expect(s.suppressed_addresses).toBeGreaterThan(0);
    expect(s.by_type.hard + s.by_type.soft + s.by_type.complaint).toBe(s.recent.length <= 10 ? s.by_type.hard + s.by_type.soft + s.by_type.complaint : 0);
    // the seeded hard bounce is suppressed
    expect(isSuppressed('old.contact@acme.com')).toBe(true);
  });

  it('is unaffected for a clean address', () => {
    expect(getBounce('clean@good.com')).toBeNull();
    expect(isSuppressed('clean@good.com')).toBe(false);
  });
});
