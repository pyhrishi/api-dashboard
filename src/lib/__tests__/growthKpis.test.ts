import {
  generateCohort, computeFunnel, durationStats, usageBands, engagement, endpointHeatmap, revenueCohorts, healthMetrics,
  evaluateAlerts, weeklyExternal, weeklyActivationRates, applyScenario, liveDeveloperRecord, buildSnapshot, pmReportMarkdown,
  formatDuration, ACTIVATION_TARGET_MS, COHORT_SIZE, ALERT_RULES, TRIAL_CREDITS,
  type LiveWorkspaceInput, type DeveloperRecord,
} from '@/lib/growth-kpis';
import type { TelemetryEventRecord } from '@/lib/telemetry';
import { ENDPOINTS } from '@/data/endpoints';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const MIN = 60_000;

const evt = (name: TelemetryEventRecord['name'], iso: string, props: TelemetryEventRecord['props'] = {}): TelemetryEventRecord =>
  ({ id: `evt_${name}_${iso}`, name, props, timestamp: iso, environment: 'sandbox', orgId: 'org_1', role: 'admin' });

const emptyLive: LiveWorkspaceInput = {
  events: [], requestLog: [], email: 'dev7@zintlr.com', company: 'Zintlr', orgCreatedAt: null,
  isFirstCallMade: false, firstCallTimestamp: null, activeKeyCount: 0, creditBalance: TRIAL_CREDITS, plan: 'Starter', teamSize: 1, supportTickets: 0,
};
const noLiveAlerts = { topupAttempts: 0, topupFailures: 0, docsSearches: 0, docsNoResults: 0 };

describe('seeded cohort', () => {
  it('is deterministic for the same day and has the requested size', () => {
    const a = generateCohort(NOW);
    const b = generateCohort(NOW + 3 * 3_600_000); // same UTC day
    expect(a).toHaveLength(COHORT_SIZE);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('never activates a developer without a key, never pays without exhausting the trial', () => {
    generateCohort(NOW).forEach((d) => {
      if (d.firstCallAt !== null) expect(d.firstKeyAt).not.toBeNull();
      if (d.firstKeyAt !== null) expect(d.firstKeyAt).toBeGreaterThanOrEqual(d.signupAt);
      if (d.firstCallAt !== null) expect(d.firstCallAt).toBeGreaterThanOrEqual(d.firstKeyAt as number);
      if (d.paidAt !== null) expect(d.trialCreditsUsedPct).toBe(100);
      expect(d.destructiveReverts).toBeLessThanOrEqual(d.destructiveActions);
      expect(d.invitesAccepted).toBeLessThanOrEqual(d.invitesSent);
    });
  });

  it('lands in a believable PLG range (activation 40–75%, some paid, heavy-tailed usage)', () => {
    const cohort = generateCohort(NOW);
    const funnel = computeFunnel(cohort);
    expect(funnel[2].pctOfTop).toBeGreaterThan(40);
    expect(funnel[2].pctOfTop).toBeLessThan(75);
    expect(funnel[4].count).toBeGreaterThan(0);
    const bands = usageBands(cohort);
    expect(bands[0].callShare).toBeGreaterThan(bands[9].callShare);
    expect(bands[0].callShare).toBeGreaterThan(25);
  });
});

describe('funnel math', () => {
  it('computes counts, % of top, drop-off and conversion per stage', () => {
    const mk = (over: Partial<DeveloperRecord>): DeveloperRecord => ({
      id: 'x', handle: 'x', company: 'x', region: 'EMEA', signupAt: NOW - 3 * MIN, signupMonth: '2026-09', firstKeyAt: null, firstCallAt: null,
      callsTotal: 0, calls7d: 0, activeDays: [], trialCreditsUsedPct: 0, paidAt: null, walletBalanceCredits: 0, revenueUsd: 0, plan: 'Trial',
      invitesSent: 0, invitesAccepted: 0, supportTickets: 0, destructiveActions: 0, destructiveReverts: 0, endpointMix: {}, isYou: false, ...over,
    });
    const records = [
      mk({}), mk({}), mk({ firstKeyAt: NOW }), mk({ firstKeyAt: NOW, firstCallAt: NOW }),
      mk({ firstKeyAt: NOW, firstCallAt: NOW, trialCreditsUsedPct: 100 }), mk({ firstKeyAt: NOW, firstCallAt: NOW, trialCreditsUsedPct: 100, paidAt: NOW }),
    ];
    const f = computeFunnel(records);
    expect(f.map((s) => s.count)).toEqual([6, 4, 3, 2, 1]);
    expect(f[0].dropOffPct).toBe(0);
    expect(f[1].dropOffPct).toBeCloseTo(33.3, 1);
    expect(f[2].conversionPct).toBe(75);
    expect(f[4].pctOfTop).toBeCloseTo(16.7, 1);
    expect(f.map((s) => s.band)).toEqual(['TOFU', 'MOFU', 'MOFU', 'BOFU', 'BOFU']);
  });

  it('handles an empty population without dividing by zero', () => {
    const f = computeFunnel([]);
    expect(f.every((s) => s.count === 0 && s.pctOfTop === 0 && s.dropOffPct === 0)).toBe(true);
  });
});

describe('duration statistics', () => {
  it('returns min/max/avg/median/p90 and the share within the 10-minute target', () => {
    const s = durationStats([1 * MIN, 4 * MIN, 6 * MIN, 12 * MIN, 60 * MIN]);
    expect(s).not.toBeNull();
    expect(s!.min).toBe(1 * MIN);
    expect(s!.max).toBe(60 * MIN);
    expect(s!.median).toBe(6 * MIN);
    expect(s!.avg).toBe(Math.round((83 * MIN) / 5));
    expect(s!.withinTargetPct).toBe(60);
    expect(s!.histogram.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it('is null for no samples and one-sample stats collapse to that value', () => {
    expect(durationStats([])).toBeNull();
    const one = durationStats([7 * MIN]);
    expect(one!.min).toBe(one!.median);
    expect(one!.median).toBe(one!.p90);
  });
  it('formats durations for humans', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(ACTIVATION_TARGET_MS)).toBe('10m');
    expect(formatDuration(95 * MIN)).toBe('1h 35m');
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000)).toBe('2d 3h');
  });
});

describe('engagement, heatmap, cohorts, health', () => {
  const cohort = generateCohort(NOW);
  it('DAU never exceeds WAU and stickiness is a percentage', () => {
    const e = engagement(cohort);
    e.dau.forEach((d, i) => expect(d).toBeLessThanOrEqual(e.wau[i]));
    expect(e.stickiness).toBeGreaterThanOrEqual(0);
    expect(e.stickiness).toBeLessThanOrEqual(100);
    expect(e.dau).toHaveLength(28);
  });
  it('heatmap counts real request logs exactly (workspace scope) and spreads the cohort (population scope)', () => {
    const log = [
      { timestamp: '2026-09-08T09:15:00.000Z', path: '/v1/people/phone' },
      { timestamp: '2026-09-08T09:40:00.000Z', path: '/v1/people/phone' },
      { timestamp: '2026-09-08T17:05:00.000Z', path: '/v1/companies/enrich' },
    ];
    const ws = endpointHeatmap([], log, 'workspace');
    expect(ws.total).toBe(3);
    expect(ws.rows[0].hours[9]).toBe(2);
    expect(ws.peakHour).toBe(9);
    const pop = endpointHeatmap(cohort, log, 'population');
    expect(pop.total).toBeGreaterThan(3);
    expect(pop.rows.length).toBeLessThanOrEqual(12);
  });
  it('revenue cohorts are keyed by signup month and sum to total revenue', () => {
    const cohorts = revenueCohorts(cohort);
    expect(cohorts.every((c) => /^\d{4}-\d{2}$/.test(c.signupMonth))).toBe(true);
    expect(cohorts.reduce((s, c) => s + c.revenueUsd, 0)).toBe(cohort.reduce((s, d) => s + d.revenueUsd, 0));
    expect(cohorts.reduce((s, c) => s + c.developers, 0)).toBe(cohort.length);
  });
  it('health rates are ratios of the right numerators', () => {
    const h = healthMetrics(cohort);
    expect(h.incidentRatePct).toBeCloseTo(h.destructiveActions === 0 ? 0 : Math.round((h.destructiveReverts / h.destructiveActions) * 1000) / 10, 5);
    expect(h.ticketsPerActiveDev).toBeCloseTo(Math.round((h.supportTickets / h.activeDevelopers) * 100) / 100, 5);
  });
});

describe('alert thresholds', () => {
  const cohort = generateCohort(NOW);
  it('all four rules are quiet in the current week', () => {
    const alerts = evaluateAlerts(cohort, weeklyExternal('current'), noLiveAlerts, NOW);
    expect(alerts.map((a) => a.id)).toEqual(ALERT_RULES.map((r) => r.id));
    expect(alerts.filter((a) => a.status === 'firing')).toHaveLength(0);
    expect(alerts.every((a) => a.series.length === 8)).toBe(true);
  });
  it('the provider-incident scenario fires the OTP (Product) and top-up (Eng) alerts', () => {
    const alerts = evaluateAlerts(cohort, weeklyExternal('provider-incident'), noLiveAlerts, NOW);
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a]));
    expect(byId.otp_completion.status).toBe('firing');
    expect(byId.otp_completion.owner).toBe('Product');
    expect(byId.otp_completion.source).toBe('auth service');
    expect(byId.topup_failure.status).toBe('firing');
    expect(byId.topup_failure.owner).toBe('Eng');
    expect(byId.docs_no_results.status).toBe('ok');
  });
  it('the activation-regression scenario drops activation >10 pp WoW and pushes docs no-results over 20%', () => {
    const regressed = applyScenario(cohort, 'activation-regression', NOW);
    const before = weeklyActivationRates(cohort, NOW)[7] as number;
    const after = weeklyActivationRates(regressed, NOW)[7] as number;
    expect(after).toBeLessThan(before);
    const alerts = evaluateAlerts(regressed, weeklyExternal('activation-regression'), noLiveAlerts, NOW);
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a]));
    expect(byId.activation_wow.status).toBe('firing');
    expect(byId.activation_wow.value as number).toBeLessThan(-10);
    expect(byId.docs_no_results.status).toBe('firing');
    expect(byId.docs_no_results.owner).toBe('Docs owner');
  });
  it('live workspace counts feed the current week', () => {
    const alerts = evaluateAlerts(cohort, weeklyExternal('current'), { topupAttempts: 40, topupFailures: 40, docsSearches: 0, docsNoResults: 0 }, NOW);
    expect(alerts.find((a) => a.id === 'topup_failure')!.status).toBe('firing');
  });
  it('live OTP challenges from the trial gate blend into the modelled completion rate', () => {
    const base = evaluateAlerts(cohort, weeklyExternal('current'), noLiveAlerts, NOW).find((a) => a.id === 'otp_completion')!;
    const blended = evaluateAlerts(cohort, weeklyExternal('current'), { ...noLiveAlerts, otpChallenges: 60, otpVerified: 6 }, NOW).find((a) => a.id === 'otp_completion')!;
    expect(blended.value as number).toBeLessThan(base.value as number);
    expect(blended.status).toBe('firing');
    expect(blended.summary).toContain('6 of 60 in this workspace');
    // verified can never exceed challenges
    const capped = evaluateAlerts(cohort, weeklyExternal('current'), { ...noLiveAlerts, otpChallenges: 2, otpVerified: 9 }, NOW).find((a) => a.id === 'otp_completion')!;
    expect(capped.value as number).toBeLessThanOrEqual(100);
  });
});

describe('the live workspace as a developer record', () => {
  it('reconstructs signup → key → first call from real events', () => {
    const live: LiveWorkspaceInput = {
      ...emptyLive,
      events: [
        evt('signup_completed', '2026-09-08T10:00:00.000Z'),
        evt('api_key_created', '2026-09-08T10:03:00.000Z'),
        evt('first_call_made', '2026-09-08T10:07:30.000Z'),
        evt('credits_recharged', '2026-09-08T11:00:00.000Z', { pack: 2 }),
        evt('destructive_action_confirmed', '2026-09-08T11:30:00.000Z', { action: 'revoke key' }),
      ],
      requestLog: [{ timestamp: '2026-09-08T10:07:30.000Z', path: '/v1/people/phone' }],
      activeKeyCount: 1, creditBalance: 31_000,
    };
    const you = liveDeveloperRecord(live, NOW);
    expect(you.isYou).toBe(true);
    expect(you.firstCallAt! - you.signupAt).toBe(7.5 * MIN);
    expect(you.paidAt).not.toBeNull();
    expect(you.revenueUsd).toBe(199);
    expect(you.trialCreditsUsedPct).toBe(100);
    expect(you.destructiveActions).toBe(1);
    const phoneEndpointId = ENDPOINTS.find((e) => e.path === '/v1/people/phone')!.id;
    expect(you.endpointMix).toHaveProperty(phoneEndpointId);
  });
  it('falls back to the store flag when the first call predates event logging', () => {
    const you = liveDeveloperRecord({ ...emptyLive, isFirstCallMade: true, firstCallTimestamp: NOW - 5 * MIN, activeKeyCount: 1 }, NOW);
    expect(you.firstCallAt).toBe(NOW - 5 * MIN);
  });
  it('a workspace with calls on record has activated, even without events or the flag', () => {
    const you = liveDeveloperRecord({ ...emptyLive, requestLog: [{ timestamp: '2026-09-07T09:00:00.000Z', path: '/v1/people' }, { timestamp: '2026-09-06T09:00:00.000Z', path: '/v1/people' }] }, NOW);
    expect(you.firstCallAt).toBe(Date.parse('2026-09-06T09:00:00.000Z'));
    expect(you.firstKeyAt).not.toBeNull();
    expect(you.callsTotal).toBe(2);
  });
});

describe('snapshot + PM report', () => {
  it('workspace scope with nothing done renders zero counts, not NaN', () => {
    const s = buildSnapshot({ scope: 'workspace', scenario: 'current', now: NOW, live: emptyLive, liveAlerts: noLiveAlerts });
    expect(s.funnel[0].count).toBe(1);
    expect(s.funnel[2].count).toBe(0);
    expect(s.timeToActivate).toBeNull();
    expect(Number.isNaN(s.activationRatePct)).toBe(false);
    expect(s.insights.length).toBeGreaterThan(0);
  });
  it('population scope merges the live workspace as exactly one "you" row', () => {
    const s = buildSnapshot({ scope: 'population', scenario: 'current', now: NOW, live: emptyLive, liveAlerts: noLiveAlerts });
    expect(s.developers.filter((d) => d.isYou)).toHaveLength(1);
    expect(s.developers).toHaveLength(COHORT_SIZE + 1);
    expect(s.timeToActivate!.median).toBeGreaterThan(0);
  });
  it('the PM report contains every section of the framework', () => {
    const s = buildSnapshot({ scope: 'population', scenario: 'provider-incident', now: NOW, live: emptyLive, liveAlerts: noLiveAlerts });
    const md = pmReportMarkdown(s);
    ['## Activation funnel', '## MOFU', '## BOFU', '## Engagement & feature', '## Advanced', '## Alerts', '10-minute target', 'Alert Product', 'Alert Eng'].forEach((needle) => expect(md).toContain(needle));
  });
});
