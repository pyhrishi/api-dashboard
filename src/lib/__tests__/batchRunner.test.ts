import { runBatch, parseBatchInputs, isBatchOperation, BATCH_MAX_ITEMS } from '@/lib/batch-runner';

describe('batch endpoint fan-out', () => {
  it('recognizes valid operations', () => {
    expect(isBatchOperation('people')).toBe(true);
    expect(isBatchOperation('company')).toBe(true);
    expect(isBatchOperation('email-verify')).toBe(true);
    expect(isBatchOperation('nope')).toBe(false);
  });

  it('parses comma/newline inputs, de-duplicates, and caps at the max', () => {
    expect(parseBatchInputs('a@x.com, b@x.com\nc@x.com, A@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    const many = Array.from({ length: 80 }, (_, i) => `u${i}@x.com`).join(',');
    expect(parseBatchInputs(many)).toHaveLength(BATCH_MAX_ITEMS);
  });

  it('returns null for an invalid operation or empty inputs', () => {
    expect(runBatch('bogus', 'a@x.com')).toBeNull();
    expect(runBatch('people', '   ')).toBeNull();
  });

  it('runs a people batch with per-item status and a coherent summary', () => {
    const b = runBatch('people', 'jane.doe@acme.com, marcus@stripe.com, priya.nair@zomato.in');
    expect(b).not.toBeNull();
    if (!b) return;
    expect(b.operation).toBe('people');
    expect(b.results).toHaveLength(3);
    for (const r of b.results) expect(['matched', 'missed']).toContain(r.status);
    expect(b.summary.total).toBe(3);
    expect(b.summary.matched + b.summary.missed).toBe(3);
    expect(b.summary.match_rate).toBeGreaterThanOrEqual(0);
    expect(b.summary.match_rate).toBeLessThanOrEqual(1);
    // only-charge-on-match: credits = matched × per-op cost (people = 1)
    expect(b.summary.credits).toBe(b.summary.matched * 1);
  });

  it('marks unresolvable inputs as missed (not charged)', () => {
    const b = runBatch('people', 'jane.doe@acme.com, not-an-email');
    if (!b) return;
    expect(b.summary.total).toBe(2);
    expect(b.summary.missed).toBeGreaterThanOrEqual(1);
    const miss = b.results.find((r) => r.input === 'not-an-email');
    expect(miss?.status).toBe('missed');
    expect(miss?.data).toBeNull();
  });

  it('is deterministic', () => {
    expect(runBatch('company', 'stripe.com, zomato.in')).toEqual(runBatch('company', 'stripe.com, zomato.in'));
  });
});
