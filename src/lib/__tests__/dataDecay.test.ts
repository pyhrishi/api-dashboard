import {
  scoreDecay, scoreAll, computeDecayAlerts, summarize, decayScoreForEmail,
  companyEvent, effectiveStatus, isSnoozeActive, severityRank, SEVERITY_ORDER,
  type DecayAlertState,
} from '@/lib/data-decay';
import { generateReverifiableRecords, DEFAULT_CADENCE } from '@/lib/reverification';
import { useStore } from '@/lib/store';

const records = generateReverifiableRecords();

describe('data-decay scoring engine', () => {
  it('scores deterministically with a bounded probability and valid severity', () => {
    const rec = records[0];
    const a = scoreDecay(rec, DEFAULT_CADENCE);
    expect(scoreDecay(rec, DEFAULT_CADENCE)).toEqual(a);
    expect(a.probability).toBeGreaterThanOrEqual(0);
    expect(a.probability).toBeLessThanOrEqual(1);
    expect(SEVERITY_ORDER).toContain(a.severity);
    expect(a.factors.length).toBeGreaterThan(0);
    expect(a.projectedDecayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('an older record scores higher than a fresh one of the same field type', () => {
    const emails = records.filter((r) => r.fieldType === 'email');
    const sorted = [...emails].sort((a, b) => Date.parse(a.lastVerified) - Date.parse(b.lastVerified));
    const oldest = scoreDecay(sorted[0], DEFAULT_CADENCE); // earliest date = oldest
    const newest = scoreDecay(sorted[sorted.length - 1], DEFAULT_CADENCE);
    expect(oldest.probability).toBeGreaterThan(newest.probability);
  });

  it('ranks the full pool by risk, descending', () => {
    const all = scoreAll(DEFAULT_CADENCE);
    expect(all).toHaveLength(records.length);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].probability).toBeGreaterThanOrEqual(all[i].probability);
    }
  });

  it('company event signal is deterministic and one of the known kinds', () => {
    expect(companyEvent('Acme')).toBe(companyEvent('Acme'));
    records.forEach((r) => {
      expect(['acquisition', 'layoffs', 'rapid_growth', 'stable']).toContain(companyEvent(r.company));
    });
  });

  it('a higher severity threshold yields fewer or equal alerts', () => {
    const low = computeDecayAlerts(DEFAULT_CADENCE, 'low', {}).length;
    const high = computeDecayAlerts(DEFAULT_CADENCE, 'high', {}).length;
    const critical = computeDecayAlerts(DEFAULT_CADENCE, 'critical', {}).length;
    expect(low).toBeGreaterThanOrEqual(high);
    expect(high).toBeGreaterThanOrEqual(critical);
    // every returned alert meets the floor
    computeDecayAlerts(DEFAULT_CADENCE, 'high', {}).forEach((a) =>
      expect(severityRank(a.severity)).toBeGreaterThanOrEqual(severityRank('high')),
    );
  });

  it('an expired snooze reverts to open; an active snooze holds', () => {
    const now = 1_000_000_000_000;
    const expired: DecayAlertState = { status: 'snoozed', snoozedUntil: now - 1000, updatedAt: 0 };
    const active: DecayAlertState = { status: 'snoozed', snoozedUntil: now + 1000, updatedAt: 0 };
    expect(effectiveStatus(expired, now)).toBe('open');
    expect(effectiveStatus(active, now)).toBe('snoozed');
    expect(isSnoozeActive(active, now)).toBe(true);
    expect(isSnoozeActive(expired, now)).toBe(false);
    expect(effectiveStatus(undefined, now)).toBe('open');
    expect(effectiveStatus({ status: 'resolved', updatedAt: 0 }, now)).toBe('resolved');
  });

  it('applies lifecycle overlay: resolved status is carried onto the alert', () => {
    const first = scoreAll(DEFAULT_CADENCE, undefined)[0];
    const states: Record<string, DecayAlertState> = { [first.recordId]: { status: 'resolved', updatedAt: 0 } };
    const alerts = computeDecayAlerts(DEFAULT_CADENCE, 'low', states);
    const found = alerts.find((a) => a.recordId === first.recordId)!;
    expect(found.status).toBe('resolved');
  });

  it('summarize counts open at-risk and criticals only', () => {
    const alerts = computeDecayAlerts(DEFAULT_CADENCE, 'low', {});
    const s = summarize(alerts, records.length);
    expect(s.monitored).toBe(records.length);
    expect(s.atRisk).toBe(alerts.filter((a) => a.status === 'open').length);
    expect(s.critical).toBeLessThanOrEqual(s.atRisk);
  });

  it('scores a record by email and returns null for the unknown', () => {
    const emailRec = records.find((r) => r.fieldType === 'email')!;
    const hit = decayScoreForEmail(emailRec.value);
    expect(hit).not.toBeNull();
    expect(hit!.recordId).toBe(emailRec.id);
    expect(decayScoreForEmail('nobody@nowhere.example')).toBeNull();
    expect(decayScoreForEmail('')).toBeNull();
  });
});

describe('data-decay store slice', () => {
  beforeEach(() => {
    useStore.setState({ decayAlertStates: {}, decayAlertThreshold: 'medium' });
    const u = useStore.getState().user;
    if (u && u.role === 'billing') useStore.setState({ user: { ...u, role: 'admin' } });
  });

  it('resolves and reopens an alert', () => {
    const id = scoreAll(DEFAULT_CADENCE)[0].recordId;
    useStore.getState().resolveDecayAlert(id);
    expect(useStore.getState().decayAlertStates[id].status).toBe('resolved');
    useStore.getState().reopenDecayAlert(id);
    expect(useStore.getState().decayAlertStates[id].status).toBe('open');
  });

  it('snoozes an alert with a future expiry', () => {
    const id = scoreAll(DEFAULT_CADENCE)[0].recordId;
    useStore.getState().snoozeDecayAlert(id, 7);
    const st = useStore.getState().decayAlertStates[id];
    expect(st.status).toBe('snoozed');
    expect(st.snoozedUntil).toBeGreaterThan(Date.now());
  });

  it('clamps/sets the alert threshold', () => {
    useStore.getState().setDecayAlertThreshold('critical');
    expect(useStore.getState().decayAlertThreshold).toBe('critical');
  });

  it('blocks the billing role from mutating', () => {
    const u = useStore.getState().user;
    useStore.setState({ user: { ...(u ?? { id: 'u', name: 'B', email: 'b@x.com' }), role: 'billing' } as typeof u });
    expect(() => useStore.getState().resolveDecayAlert('rv_1')).toThrow();
    expect(() => useStore.getState().setDecayAlertThreshold('low')).toThrow();
  });
});
