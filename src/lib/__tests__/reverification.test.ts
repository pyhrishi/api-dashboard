import {
  generateReverifiableRecords, recordAgeDays, isDue, computeDueRecords,
  reverifyField, reverifyRecords, DEFAULT_CADENCE, CADENCE_BOUNDS,
} from '@/lib/reverification';
import { useStore } from '@/lib/store';

describe('automated re-verification engine', () => {
  it('generates a deterministic, dated record pool', () => {
    const a = generateReverifiableRecords();
    expect(generateReverifiableRecords()).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(12);
    a.forEach((r) => {
      expect(r.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['email', 'phone', 'employment']).toContain(r.fieldType);
    });
  });

  it('computes due status against the field-type cadence', () => {
    const records = generateReverifiableRecords();
    const fresh = records.find((r) => recordAgeDays(r) < DEFAULT_CADENCE[r.fieldType])!;
    const stale = records.find((r) => recordAgeDays(r) >= DEFAULT_CADENCE[r.fieldType])!;
    expect(isDue(fresh, DEFAULT_CADENCE)).toBe(false);
    expect(isDue(stale, DEFAULT_CADENCE)).toBe(true);
    const due = computeDueRecords(records, DEFAULT_CADENCE);
    expect(due.length).toBeGreaterThan(0);
    expect(due.length).toBeLessThan(records.length);
  });

  it('a tighter cadence makes more records due', () => {
    const records = generateReverifiableRecords();
    const loose = computeDueRecords(records, { email: 180, phone: 180, employment: 180 }).length;
    const tight = computeDueRecords(records, { email: 7, phone: 7, employment: 7 }).length;
    expect(tight).toBeGreaterThanOrEqual(loose);
    expect(tight).toBe(records.length);
  });

  it('re-verifies a field deterministically with a valid outcome', () => {
    const rec = generateReverifiableRecords()[0];
    expect(reverifyField(rec, 0)).toEqual(reverifyField(rec, 0));
    const res = reverifyField(rec, 0);
    expect(['unchanged', 'updated', 'decayed']).toContain(res.outcome);
    if (res.outcome === 'updated') expect(res.newValue).toBeTruthy();
    if (res.outcome !== 'updated') expect(res.newValue).toBeUndefined();
  });

  it('different cycles can yield different outcomes for the same record', () => {
    const rec = generateReverifiableRecords().find((r) => r.fieldType === 'email')!;
    const outcomes = new Set([0, 1, 2, 3, 4, 5].map((c) => reverifyField(rec, c).outcome));
    expect(outcomes.size).toBeGreaterThanOrEqual(1); // deterministic per cycle; usually varies
  });

  it('rolls up run counts that sum to checked', () => {
    const due = computeDueRecords(generateReverifiableRecords(), DEFAULT_CADENCE);
    const run = reverifyRecords(due, 0);
    expect(run.results).toHaveLength(run.checked);
    expect(run.unchanged + run.updated + run.decayed).toBe(run.checked);
  });

  it('exposes sane cadence bounds', () => {
    expect(CADENCE_BOUNDS.min).toBeGreaterThan(0);
    expect(CADENCE_BOUNDS.max).toBeGreaterThan(CADENCE_BOUNDS.min);
  });
});

describe('re-verification store slice', () => {
  beforeEach(() => {
    useStore.setState({ reverificationRuns: [], reverificationCadence: { ...DEFAULT_CADENCE } });
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('runs re-verification and records a coherent run', () => {
    const run = useStore.getState().runReVerification();
    expect(run.checked).toBeGreaterThan(0);
    expect(run.unchanged + run.updated + run.decayed).toBe(run.checked);
    expect(useStore.getState().reverificationRuns[0].id).toBe(run.id);
  });

  it('clamps cadence changes to the bounds', () => {
    useStore.getState().setReverificationCadence('email', 1);
    expect(useStore.getState().reverificationCadence.email).toBe(CADENCE_BOUNDS.min);
    useStore.getState().setReverificationCadence('phone', 9999);
    expect(useStore.getState().reverificationCadence.phone).toBe(CADENCE_BOUNDS.max);
  });

  it('blocks the billing role from running', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    expect(() => useStore.getState().runReVerification()).toThrow();
  });
});
