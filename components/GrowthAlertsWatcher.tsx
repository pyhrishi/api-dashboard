'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import {
  buildSnapshot, pmReportMarkdown, type LiveWorkspaceInput, type LiveAlertInputs,
} from '@/lib/growth-kpis';
import { useAlertCenter, effectiveRules, digestIsDue, lastDigestPoint, fmtIncidentValue } from '@/lib/growth-alerts';
import type { TelemetryEventRecord, TelemetryEventName } from '@/lib/telemetry';

const count = (events: TelemetryEventRecord[], name: TelemetryEventName) => events.reduce((n, e) => n + (e.name === name ? 1 : 0), 0);

/**
 * The live workspace as KPI inputs — one place that maps store state to the
 * `lib/growth-kpis.ts` contract, shared by the Growth dashboard, the Alert Center,
 * the Overview strip and the background watcher so they can never disagree.
 */
export function useGrowthLiveInputs(): { live: LiveWorkspaceInput; liveAlerts: LiveAlertInputs; orgId: string | null } {
  const {
    telemetryEvents, apiLogs, user, organizations, activeOrganizationId, isFirstCallMade, firstCallTimestamp,
    activeKeys, creditBalance, billingDetails, teamMembers, supportTickets,
  } = useStore();

  const live = useMemo<LiveWorkspaceInput>(() => ({
    events: telemetryEvents,
    requestLog: apiLogs.map((l) => ({ timestamp: l.timestamp, path: l.path })),
    email: user?.email ?? null,
    company: user?.company ?? null,
    orgCreatedAt: organizations.find((o) => o.id === activeOrganizationId)?.createdAt ?? null,
    isFirstCallMade,
    firstCallTimestamp: firstCallTimestamp ?? null,
    activeKeyCount: activeKeys.length,
    creditBalance,
    plan: billingDetails.plan,
    teamSize: teamMembers.length,
    supportTickets: supportTickets.length,
  }), [telemetryEvents, apiLogs, user, organizations, activeOrganizationId, isFirstCallMade, firstCallTimestamp, activeKeys.length, creditBalance, billingDetails.plan, teamMembers.length, supportTickets.length]);

  const liveAlerts = useMemo<LiveAlertInputs>(() => ({
    topupAttempts: count(telemetryEvents, 'credits_recharged') + count(telemetryEvents, 'credits_recharge_failed'),
    topupFailures: count(telemetryEvents, 'credits_recharge_failed'),
    docsSearches: count(telemetryEvents, 'docs_search_performed'),
    docsNoResults: telemetryEvents.reduce((n, e) => n + (e.name === 'docs_search_performed' && e.props.noResults === true ? 1 : 0), 0),
    otpChallenges: count(telemetryEvents, 'otp_challenge_shown'),
    otpVerified: count(telemetryEvents, 'otp_verified'),
  }), [telemetryEvents]);

  return { live, liveAlerts, orgId: activeOrganizationId ?? null };
}

const RECHECK_MS = 5 * 60_000;

/**
 * The prototype's scheduler. Mounted once in the console layout, it evaluates the
 * four Growth alert rules against real state (population scope, no scenario), opens
 * incidents and deliveries through the Alert Center store, surfaces new ones as
 * in-app notifications, and runs the weekly PM digest when it falls due — so alerts
 * reach someone even if nobody has the Growth page open.
 */
export function GrowthAlertsWatcher() {
  const { live, liveAlerts, orgId } = useGrowthLiveInputs();
  const toast = useToast();
  const thresholds = useAlertCenter((s) => s.thresholds);
  const digest = useAlertCenter((s) => s.digest);
  const lastDigestRunAt = useAlertCenter((s) => s.lastDigestRunAt);
  const eventCount = live.events.length;
  const lastRunRef = useRef(0);

  useEffect(() => {
    const run = () => {
      const now = Date.now();
      if (now - lastRunRef.current < 15_000) return; // debounce bursts of store updates
      lastRunRef.current = now;
      const rules = effectiveRules(thresholds);
      const snapshot = buildSnapshot({ scope: 'population', scenario: 'current', now, live, liveAlerts, rules });
      const { fired } = useAlertCenter.getState().recordEvaluation(snapshot.alerts, { now, orgId, source: 'live', scenario: 'current' });
      fired.forEach((inc) => {
        toast.error(`Alert · ${inc.label}`, `${fmtIncidentValue(inc)} — routed to ${inc.owner}. Open the Alert Center to acknowledge.`);
        track('growth_alert_fired', { rule: inc.ruleId, owner: inc.owner, value: inc.value, source: 'live' });
      });

      if (digestIsDue(digest, lastDigestRunAt, now)) {
        const at = lastDigestPoint(digest, now) ?? now;
        const digestSnapshot = digest.scope === 'population' ? snapshot : buildSnapshot({ scope: 'workspace', scenario: 'current', now, live, liveAlerts, rules });
        const rec = useAlertCenter.getState().runDigest({
          markdown: pmReportMarkdown(digestSnapshot), trigger: 'scheduled', scope: digest.scope,
          firing: digestSnapshot.alerts.filter((a) => a.status === 'firing').length, now: at,
        });
        toast.info('Weekly PM digest sent', `${rec.periodLabel} · delivered to ${rec.delivered} of ${rec.deliveries} targets.`);
        track('pm_digest_sent', { trigger: 'scheduled', delivered: rec.delivered, deliveries: rec.deliveries, scope: digest.scope });
      }
    };
    run();
    const t = setInterval(run, RECHECK_MS);
    return () => clearInterval(t);
    // Re-evaluate when the event log grows, thresholds change, or the digest schedule changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCount, thresholds, digest, lastDigestRunAt, orgId]);

  return null;
}
