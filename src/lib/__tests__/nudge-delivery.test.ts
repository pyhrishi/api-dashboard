import { reengagementDue, planReengagement, nudgeDeliverySummary, type ReengagementContext } from '@/lib/nudge-delivery';
import { nudgeById, type NudgeSpec, type NudgeRecord } from '@/lib/nudges';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const HOUR = 3_600_000;

// A nudge with a re-engagement config + email channel (C2-b: afterHours 6, maxTouches 1).
const withReengage = nudgeById('n-c4a-decision') as NudgeSpec; // afterHours 24, maxTouches 3, email+webhook? email only
const shownRecord = (lastSeenAt: number, status: NudgeRecord['status'] = 'active'): NudgeRecord => ({ id: withReengage.id, status, seenCount: 1, firstSeenAt: lastSeenAt, lastSeenAt });
const ctx = (over: Partial<ReengagementContext> = {}): ReengagementContext => ({ recipient: 'dev7@zintlr.com', unsubscribed: false, touchesSoFar: 0, ...over });

describe('reengagementDue', () => {
  it('is due once the window passes; not before', () => {
    const rec = shownRecord(NOW);
    expect(reengagementDue(withReengage, rec, ctx(), NOW + 23 * HOUR)).toBe(false); // < 24h
    expect(reengagementDue(withReengage, rec, ctx(), NOW + 25 * HOUR)).toBe(true);  // > 24h
  });
  it('the window widens with each touch', () => {
    const rec = shownRecord(NOW);
    // touch 2 is due at afterHours × 2 = 48h
    expect(reengagementDue(withReengage, rec, ctx({ touchesSoFar: 1 }), NOW + 30 * HOUR)).toBe(false);
    expect(reengagementDue(withReengage, rec, ctx({ touchesSoFar: 1 }), NOW + 49 * HOUR)).toBe(true);
  });
  it('honours the cap, unsubscribe, conversion, and un-shown nudges', () => {
    const rec = shownRecord(NOW);
    expect(reengagementDue(withReengage, rec, ctx({ touchesSoFar: 3 }), NOW + 1000 * HOUR)).toBe(false); // cap = 3
    expect(reengagementDue(withReengage, rec, ctx({ unsubscribed: true }), NOW + 100 * HOUR)).toBe(false);
    expect(reengagementDue(withReengage, shownRecord(NOW, 'converted'), ctx(), NOW + 100 * HOUR)).toBe(false);
    expect(reengagementDue(withReengage, undefined, ctx(), NOW + 100 * HOUR)).toBe(false);
    const noReengage = nudgeById('n-c3b-used10') as NudgeSpec; // no reengagement
    expect(reengagementDue(noReengage, rec, ctx(), NOW + 100 * HOUR)).toBe(false);
  });
});

describe('planReengagement', () => {
  it('delivers email to a valid recipient, fails without one', () => {
    const ok = planReengagement(withReengage, ctx(), NOW);
    const email = ok.find((d) => d.channel === 'email');
    expect(email?.status).toBe('delivered');
    expect(email?.touch).toBe(1);
    const bad = planReengagement(withReengage, ctx({ recipient: null }), NOW).find((d) => d.channel === 'email');
    expect(bad?.status).toBe('failed');
  });
  it('webhook is skipped without a URL, delivered with an https one', () => {
    const zero = nudgeById('n-c7b-zero') as NudgeSpec; // has a webhook channel
    expect(planReengagement(zero, ctx(), NOW).find((d) => d.channel === 'webhook')?.status).toBe('skipped');
    expect(planReengagement(zero, ctx({ webhookUrl: 'https://hooks.example.com/x' }), NOW).find((d) => d.channel === 'webhook')?.status).toBe('delivered');
  });
  it('summary counts by status', () => {
    const recs = planReengagement(withReengage, ctx({ recipient: null }), NOW);
    const s = nudgeDeliverySummary(recs);
    expect(s.total).toBe(recs.length);
    expect(s.failed).toBeGreaterThanOrEqual(1);
  });
});
