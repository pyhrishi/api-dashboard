/**
 * Growth telemetry — the in-product source of truth for PLG measurement.
 *
 * `track()` writes a typed event into the persisted Zustand `telemetryEvents` slice
 * (which powers /console/growth) and, when `NEXT_PUBLIC_POSTHOG_KEY` is configured,
 * forwards it to PostHog's capture API. Without a key the adapter is a no-op, so the
 * prototype stays deterministic and demo-safe. `track()` never throws.
 */

import { useStore } from '@/lib/store';

/** The event catalog. Add here first; keep names `<area>_<past_tense_verb>`. */
export type TelemetryEventName =
  // activation
  | 'signup_completed'
  | 'onboarding_step_completed'
  | 'api_key_created'
  | 'first_call_made'
  | 'explorer_run'
  | 'person_resolved'
  | 'person_resolution_failed'
  | 'company_enriched'
  | 'company_enrichment_failed'
  | 'feature_viewed'
  // monetization
  | 'quota_threshold_reached'
  | 'upgrade_prompt_shown'
  | 'upgrade_prompt_clicked'
  | 'upgrade_prompt_dismissed'
  | 'plan_upgraded'
  | 'credits_recharged'
  // expansion / virality
  | 'invite_sent'
  | 'invite_accepted'
  | 'referral_code_applied'
  | 'org_created'
  // engagement
  | 'webhook_created'
  | 'export_downloaded'
  | 'alert_rule_created'
  | 'feature_abandoned'
  // navigation & workspace
  | 'command_palette_used'
  | 'roadmap_viewed'
  | 'roadmap_view_changed'
  | 'org_updated'
  | 'org_deleted'
  | 'ownership_transferred'
  // bulk enrichment jobs
  | 'bulk_job_created'
  | 'bulk_job_started'
  | 'bulk_job_completed'
  | 'bulk_job_cancelled'
  | 'bulk_job_retried';

export type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

export interface TelemetryEventRecord {
  id: string;
  name: TelemetryEventName;
  props: TelemetryProps;
  timestamp: string; // ISO
  environment: 'sandbox' | 'live';
  orgId: string | null;
  role: string | null;
}

/** Record a growth event. Safe to call anywhere (client only; no-op on the server). */
export function track(name: TelemetryEventName, props: TelemetryProps = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const state = useStore.getState();
    const record: TelemetryEventRecord = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      props,
      timestamp: new Date().toISOString(),
      environment: state.environment,
      orgId: state.activeOrganizationId ?? null,
      role: state.user?.role ?? null,
    };
    state.recordTelemetryEvent(record);
    forwardToPostHog(record, state.user?.email ?? record.orgId ?? 'anonymous');
  } catch {
    // Telemetry must never break the product.
  }
}

// ─── Optional PostHog adapter (no SDK dependency) ─────────────────────────────

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com').replace(/\/$/, '');

/** Fire-and-forget forward to PostHog's capture endpoint when a key is configured. */
function forwardToPostHog(record: TelemetryEventRecord, distinctId: string): void {
  if (!POSTHOG_KEY) return;
  const body = JSON.stringify({
    api_key: POSTHOG_KEY,
    event: record.name,
    distinct_id: distinctId,
    timestamp: record.timestamp,
    properties: { ...record.props, environment: record.environment, org_id: record.orgId, role: record.role, $lib: 'zinbit-console' },
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${POSTHOG_HOST}/capture/`, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(`${POSTHOG_HOST}/capture/`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    }
  } catch {
    // ignore — analytics is best-effort
  }
}

/** True when events will also be forwarded externally. Useful for the Growth dashboard's status pill. */
export const isPostHogEnabled = Boolean(POSTHOG_KEY);
