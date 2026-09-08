import {
  weekKey, nextDigestRunAt, lastDigestPoint, digestIsDue, digestPeriodLabel, clampThreshold, effectiveRules, isDefaultThreshold,
  reconcileIncidents, acknowledgeIncident, resolveIncident, medianTimeToAcknowledge, renderAlertText, resolveTargets, planDeliveries,
  deliverySummary, normalizeEmails, isValidSlackChannel, isValidWebhookUrl, useAlertCenter, DEFAULT_ROUTING, DEFAULT_DIGEST, THRESHOLD_BOUNDS,
  type DigestSettings,
} from '@/lib/growth-alerts';
import { ALERT_RULES, generateCohort, weeklyExternal, evaluateAlerts, applyScenario } from '@/lib/growth-kpis';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0); // Tuesday 2026-09-08 12:00Z
const HOUR = 3_600_000;
const noLive = { topupAttempts: 0, topupFailures: 0, docsSearches: 0, docsNoResults: 0 };

describe('time helpers', () => {
  it('ISO week keys', () => {
    expect(weekKey(NOW)).toBe('2026-W37');
    expect(weekKey(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    expect(weekKey(Date.UTC(2027, 0, 3))).toBe('2026-W53');
  });
  it('next weekly run: Monday 08:00 UTC from a Tuesday is next Monday', () => {
    const s: DigestSettings = { ...DEFAULT_DIGEST, weekday: 1, hourUtc: 8 };
    const next = nextDigestRunAt(s, NOW) as number;
    expect(new Date(next).toISOString()).toBe('2026-09-14T08:00:00.000Z');
    expect(new Date(lastDigestPoint(s, NOW) as number).toISOString()).toBe('2026-09-07T08:00:00.000Z');
  });
  it('same weekday: before the hour → today, after → next week', () => {
    const s: DigestSettings = { ...DEFAULT_DIGEST, weekday: 2, hourUtc: 15 }; // Tuesday 15:00
    expect(new Date(nextDigestRunAt(s, NOW) as number).toISOString()).toBe('2026-09-08T15:00:00.000Z');
    expect(new Date(nextDigestRunAt({ ...s, hourUtc: 9 }, NOW) as number).toISOString()).toBe('2026-09-15T09:00:00.000Z');
  });
  it('daily cadence and disabled digest', () => {
    const s: DigestSettings = { ...DEFAULT_DIGEST, cadence: 'daily', hourUtc: 6 };
    expect(new Date(nextDigestRunAt(s, NOW) as number).toISOString()).toBe('2026-09-09T06:00:00.000Z');
    expect(nextDigestRunAt({ ...s, enabled: false }, NOW)).toBeNull();
    expect(digestIsDue({ ...s, enabled: false }, null, NOW)).toBe(false);
  });
  it('due when a schedule point passed since the last run', () => {
    const s: DigestSettings = { ...DEFAULT_DIGEST, weekday: 1, hourUtc: 8 };
    expect(digestIsDue(s, null, NOW)).toBe(true);
    expect(digestIsDue(s, Date.UTC(2026, 8, 7, 8, 0, 1), NOW)).toBe(false);
    expect(digestIsDue(s, Date.UTC(2026, 7, 31, 8, 0, 0), NOW)).toBe(true);
    expect(digestPeriodLabel(NOW, 'weekly')).toBe('Week 37 · 2026-09-08');
  });
});

describe('thresholds', () => {
  it('clamps and snaps to bounds; defaults are inside their bounds', () => {
    expect(clampThreshold('topup_failure', 99)).toBe(THRESHOLD_BOUNDS.topup_failure.max);
    expect(clampThreshold('activation_wow', -2)).toBe(THRESHOLD_BOUNDS.activation_wow.max);
    expect(clampThreshold('otp_completion', 63)).toBe(65);
    expect(clampThreshold('docs_no_results', Number.NaN)).toBe(20);
    ALERT_RULES.forEach((r) => expect(clampThreshold(r.id, r.threshold)).toBe(r.threshold));
  });
  it('effective rules override only what is set and feed the evaluator', () => {
    const rules = effectiveRules({ otp_completion: 90 });
    expect(rules.find((r) => r.id === 'otp_completion')!.threshold).toBe(90);
    expect(rules.find((r) => r.id === 'topup_failure')!.threshold).toBe(5);
    expect(isDefaultThreshold('otp_completion', 60)).toBe(true);
    const cohort = generateCohort(NOW);
    const before = evaluateAlerts(cohort, weeklyExternal('current'), noLive, NOW).find((a) => a.id === 'otp_completion')!;
    const after = evaluateAlerts(cohort, weeklyExternal('current'), noLive, NOW, rules).find((a) => a.id === 'otp_completion')!;
    expect(before.status).toBe('ok');
    expect(after.threshold).toBe(90);
    expect(after.status).toBe('firing');
  });
});

describe('incident lifecycle', () => {
  const cohort = generateCohort(NOW);
  const firing = evaluateAlerts(cohort, weeklyExternal('provider-incident'), noLive, NOW);
  const quiet = evaluateAlerts(cohort, weeklyExternal('current'), noLive, NOW);
  const ctx = { now: NOW, orgId: 'org_1', source: 'live' as const, scenario: 'current' as const };

  it('opens one incident per firing rule and never duplicates within the week', () => {
    const first = reconcileIncidents([], firing, ctx);
    expect(first.fired.map((i) => i.ruleId).sort()).toEqual(['otp_completion', 'topup_failure']);
    expect(first.incidents.every((i) => i.status === 'open' && i.weekKey === '2026-W37')).toBe(true);
    const again = reconcileIncidents(first.incidents, firing, { ...ctx, now: NOW + HOUR });
    expect(again.fired).toHaveLength(0);
    expect(again.incidents).toHaveLength(2);
  });
  it('auto-resolves when the rule recovers, and re-fires as a new incident later', () => {
    const opened = reconcileIncidents([], firing, ctx).incidents;
    const recovered = reconcileIncidents(opened, quiet, { ...ctx, now: NOW + 2 * HOUR });
    expect(recovered.resolved).toHaveLength(2);
    expect(recovered.incidents.every((i) => i.status === 'resolved' && i.resolution === 'auto')).toBe(true);
    const refired = reconcileIncidents(recovered.incidents, firing, { ...ctx, now: NOW + 3 * HOUR });
    expect(refired.fired).toHaveLength(2);
    expect(new Set(refired.incidents.map((i) => i.id)).size).toBe(refired.incidents.length);
  });
  it('rehearsal incidents are isolated from live ones', () => {
    const live = reconcileIncidents([], firing, ctx).incidents;
    const both = reconcileIncidents(live, firing, { ...ctx, source: 'rehearsal', scenario: 'provider-incident' });
    expect(both.fired).toHaveLength(2);
    expect(both.incidents.filter((i) => i.source === 'rehearsal')).toHaveLength(2);
    expect(both.incidents.filter((i) => i.source === 'live')).toHaveLength(2);
  });
  it('acknowledge and resolve record who and when; MTTA is the median', () => {
    const opened = reconcileIncidents([], firing, ctx).incidents;
    const a = opened.find((i) => i.ruleId === 'otp_completion')!;
    const b = opened.find((i) => i.ruleId === 'topup_failure')!;
    const acked = acknowledgeIncident(a, 'dev7@zintlr.com', '  Provider confirmed SMS outage in IN  ', NOW + 10 * 60_000);
    expect(acked.status).toBe('acknowledged');
    expect(acked.note).toBe('Provider confirmed SMS outage in IN');
    expect(acknowledgeIncident(acked, 'x', 'again', NOW)).toBe(acked); // idempotent
    const done = resolveIncident(b, 'dev7@zintlr.com', NOW + 30 * 60_000);
    expect(done.status).toBe('resolved');
    expect(done.acknowledgedAt).toBe(NOW + 30 * 60_000);
    expect(medianTimeToAcknowledge([acked, done])).toBe(20 * 60_000);
    expect(medianTimeToAcknowledge([])).toBeNull();
    expect(renderAlertText(acked)).toContain('Phone OTP completion rate');
    expect(renderAlertText(acked)).toContain('Owner: Product');
  });
  it('the activation-regression scenario opens Product + Docs incidents', () => {
    const regressed = applyScenario(cohort, 'activation-regression', NOW);
    const evals = evaluateAlerts(regressed, weeklyExternal('activation-regression'), noLive, NOW);
    const r = reconcileIncidents([], evals, { ...ctx, source: 'rehearsal', scenario: 'activation-regression' });
    expect(r.fired.map((i) => i.owner).sort()).toEqual(['Docs owner', 'Product']);
  });
});

describe('delivery', () => {
  it('routes to every configured channel and fails honestly on misconfiguration', () => {
    const ok = resolveTargets(DEFAULT_ROUTING.Eng);
    expect(ok.map((t) => t.channel)).toEqual(['in-app', 'slack', 'webhook']);
    expect(ok.every((t) => t.status === 'delivered')).toBe(true);
    const bad = resolveTargets({ channels: ['in-app', 'email', 'slack', 'webhook'], emails: [], slackChannel: 'growth alerts', webhookUrl: 'http://insecure' });
    expect(bad.filter((t) => t.status === 'failed').map((t) => t.channel)).toEqual(['email', 'slack', 'webhook']);
    expect(bad.find((t) => t.channel === 'in-app')!.status).toBe('delivered');
  });
  it('plans one ledger entry per target with stable ids', () => {
    const recs = planDeliveries('alert', 'inc_x', 'Product', DEFAULT_ROUTING.Product, NOW);
    expect(recs).toHaveLength(3);
    expect(recs.map((r) => r.id)).toEqual(['dl_inc_x_in-app_0', 'dl_inc_x_email_1', 'dl_inc_x_slack_2']);
    const sum = deliverySummary([...recs, { ...recs[0], id: 'f', status: 'failed' }]);
    expect(sum).toEqual({ total: 4, delivered: 3, failed: 1, failureRatePct: 25 });
  });
  it('validators', () => {
    expect(normalizeEmails(['A@B.co', 'nope', 'a@b.co', 42])).toEqual(['a@b.co']);
    expect(isValidSlackChannel('#growth-alerts')).toBe(true);
    expect(isValidSlackChannel('growth')).toBe(false);
    expect(isValidWebhookUrl('https://hooks.example.com/x')).toBe(true);
    expect(isValidWebhookUrl('http://hooks.example.com/x')).toBe(false);
  });
});

describe('useAlertCenter store', () => {
  beforeEach(() => useAlertCenter.getState().resetAlertCenter());
  const cohort = generateCohort(NOW);
  const firing = evaluateAlerts(cohort, weeklyExternal('provider-incident'), noLive, NOW);

  it('recording an evaluation opens incidents and writes deliveries per owner routing', () => {
    const r = useAlertCenter.getState().recordEvaluation(firing, { now: NOW, orgId: 'org_1', source: 'live', scenario: 'current' });
    expect(r.fired).toHaveLength(2);
    const s = useAlertCenter.getState();
    expect(s.incidents).toHaveLength(2);
    // Product: in-app + slack + email(1) = 3 · Eng: in-app + slack + webhook = 3
    expect(s.deliveries).toHaveLength(6);
    expect(s.deliveries.every((d) => d.status === 'delivered')).toBe(true);
  });
  it('RBAC: only admins tune thresholds and routing; developers can acknowledge', () => {
    const s = useAlertCenter.getState();
    expect(s.setThreshold('developer', 'topup_failure', 2)).toBe(false);
    expect(s.setThreshold('admin', 'topup_failure', 2)).toBe(true);
    expect(useAlertCenter.getState().thresholds.topup_failure).toBe(2);
    expect(s.updateRouting('billing', 'Eng', { slackChannel: '#x' })).toBe(false);
    expect(s.updateRouting('admin', 'Eng', { channels: ['slack'] })).toBe(true);
    expect(useAlertCenter.getState().routing.Eng.channels).toEqual(['in-app', 'slack']); // in-app floor re-added
    s.recordEvaluation(firing, { now: NOW, orgId: 'org_1', source: 'live', scenario: 'current' });
    const id = useAlertCenter.getState().incidents[0].id;
    expect(s.acknowledge('developer', id, 'dev', 'looking', NOW + 60_000)).toBe(true);
    expect(useAlertCenter.getState().incidents.find((i) => i.id === id)!.status).toBe('acknowledged');
    expect(s.acknowledge('developer', id, 'dev', 'again', NOW)).toBe(false);
  });
  it('a digest run records the report and its deliveries; rehearsals can be cleared', () => {
    const s = useAlertCenter.getState();
    const rec = s.runDigest({ markdown: '# report', trigger: 'scheduled', scope: 'population', firing: 1, now: NOW });
    expect(rec.deliveries).toBe(4); // in-app + 2 emails + slack
    expect(rec.delivered).toBe(4);
    expect(useAlertCenter.getState().lastDigestRunAt).toBe(NOW);
    s.recordEvaluation(firing, { now: NOW, orgId: 'org_1', source: 'rehearsal', scenario: 'provider-incident' });
    expect(useAlertCenter.getState().incidents).toHaveLength(2);
    s.clearRehearsals();
    expect(useAlertCenter.getState().incidents).toHaveLength(0);
    expect(useAlertCenter.getState().deliveries.every((d) => d.kind === 'digest')).toBe(true);
  });
  it('a rehearsal incident is never confused for a live one in the same week', () => {
    const s = useAlertCenter.getState();
    s.recordEvaluation(firing, { now: NOW, orgId: 'org_1', source: 'rehearsal', scenario: 'provider-incident' });
    const r = s.recordEvaluation(firing, { now: NOW + 1, orgId: 'org_1', source: 'live', scenario: 'current' });
    expect(r.fired).toHaveLength(2);
    const ids = useAlertCenter.getState().incidents.map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
  });
});
