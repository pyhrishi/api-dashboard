import { reconcile, reconcileField } from '@/lib/reconciliation';

describe('cross-source reconciliation (F-027)', () => {
  it('clusters formatting variants and picks the most reliable + recent value', () => {
    const f = reconcileField({
      field: 'Title',
      observations: [
        { source: 'Professional graph', value: 'VP, Engineering', observedAt: '2026-08-01' },
        { source: 'Social graph', value: 'VP Engineering', observedAt: '2026-07-01' },
      ],
    });
    // Both are the same value (formatting variant) → one candidate, high agreement.
    expect(f.candidates).toHaveLength(1);
    expect(f.agreement).toBe(1);
    expect(f.conflict).toBe(false);
    expect(f.confidence).toBe(1);
    expect(f.value).toBe('VP, Engineering'); // Professional Graph is more reliable + more recent
    expect(f.winningSource).toBe('Professional Graph');
  });

  it('outvotes a stale minority value without flagging a conflict', () => {
    const f = reconcileField({
      field: 'Title',
      observations: [
        { source: 'Professional graph', value: 'VP, Engineering', observedAt: '2026-08-01' },
        { source: 'Social graph', value: 'VP Engineering', observedAt: '2026-07-01' },
        { source: 'Directory match', value: 'Senior Engineer', observedAt: '2024-03-01' }, // old, single source
      ],
    });
    expect(f.value).toBe('VP, Engineering');
    expect(f.candidates.length).toBe(2); // VP cluster + stale Senior Engineer
    expect(f.conflict).toBe(false); // the stale minority isn't strong enough to be a conflict
  });

  it('flags a real conflict when two well-supported sources disagree', () => {
    const f = reconcileField({
      field: 'Location',
      observations: [
        { source: 'Professional graph', value: 'San Francisco, US', observedAt: '2026-08-01' },
        { source: 'Directory match', value: 'New York, US', observedAt: '2026-08-01' }, // both recent, both reliable, different
      ],
    });
    expect(f.conflict).toBe(true);
    expect(f.candidates).toHaveLength(2);
    expect(f.confidence).toBeLessThan(1);
  });

  it('recency breaks ties — a fresher observation wins', () => {
    const stale = reconcileField({
      field: 'Phone',
      observations: [
        { source: 'Carrier HLR lookup', value: '+1 (415) 555-0100', observedAt: '2023-01-01' },
        { source: 'Carrier HLR lookup', value: '+1 (415) 555-0199', observedAt: '2026-09-01' },
      ],
    });
    // Same provider + reliability → recency decides; the fresh number wins.
    expect(stale.value).toBe('+1 (415) 555-0199');
  });

  it('reconciles a full record and rolls up conflicts + overall confidence', () => {
    const r = reconcile([
      { field: 'Title', observations: [
        { source: 'Professional graph', value: 'CFO', observedAt: '2026-08-01' },
        { source: 'Social graph', value: 'CFO', observedAt: '2026-07-01' },
      ]},
      { field: 'Company', observations: [
        { source: 'Company graph', value: 'Acme Corp', observedAt: '2026-08-01' },
        { source: 'Directory match', value: 'Acme Technologies', observedAt: '2026-08-01' },
      ]},
    ]);
    expect(r.fieldCount).toBe(2);
    expect(r.conflictCount).toBe(1); // Company disagrees
    expect(r.overallConfidence).toBeGreaterThan(0);
    expect(r.overallConfidence).toBeLessThanOrEqual(1);
  });

  it('handles empty observations safely', () => {
    const f = reconcileField({ field: 'Email', observations: [] });
    expect(f.value).toBe('');
    expect(f.confidence).toBe(0);
    expect(f.conflict).toBe(false);
    expect(f.candidates).toEqual([]);
  });

  it('is deterministic', () => {
    const input = [{ field: 'X', observations: [
      { source: 'Professional graph', value: 'A', observedAt: '2026-01-01' },
      { source: 'Social graph', value: 'B', observedAt: '2026-05-01' },
    ]}];
    expect(reconcile(input)).toEqual(reconcile(input));
  });
});
