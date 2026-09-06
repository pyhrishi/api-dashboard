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
  | 'enrichment_run'
  | 'enrichment_failed'
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
  | 'social_profile_opened'
  | 'email_deliverability_checked'
  | 'technographic_detected'
  | 'offices_resolved'
  | 'region_coverage_viewed'
  | 'region_selected'
  | 'merge_center_viewed'
  | 'entities_merged'
  | 'merge_reverted'
  | 'match_audit_viewed'
  | 'match_audit_exported'
  | 'reverification_viewed'
  | 'reverification_run'
  | 'reverification_cadence_changed'
  | 'stream_started'
  | 'stream_completed'
  | 'coverage_viewed'
  | 'coverage_timeframe_changed'
  | 'match_recovery_clicked'
  | 'async_jobs_viewed'
  | 'async_job_created'
  | 'async_job_cancelled'
  | 'thresholds_viewed'
  | 'threshold_changed'
  | 'threshold_saved'
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
  | 'bulk_job_retried'
  // data quality — user-reported corrections (F-046)
  | 'corrections_viewed'
  | 'correction_reported'
  | 'correction_reviewed'
  // reliability — idempotency keys (F-061)
  | 'idempotency_viewed'
  // efficiency — field selection / sparse responses (F-062)
  | 'field_selection_analyzed'
  | 'field_selection_run'
  // reliability — circuit breaker per upstream (F-066)
  | 'circuits_viewed'
  | 'circuit_forced'
  // resilience — partial-result responses (F-071)
  | 'partial_result_received'
  // delivery — webhook-backed async results (F-072)
  | 'webhook_delivery_viewed'
  | 'async_result_dispatched'
  | 'webhook_delivery_replayed'
  // debugging — request replay & debug echo (F-074)
  | 'debug_inspector_viewed'
  | 'debug_echo_run'
  | 'request_replayed'
  // querying — query filtering & sorting (F-078)
  | 'query_viewed'
  | 'query_run'
  // efficiency — payload compression (F-080)
  | 'compression_viewed'
  // security — CORS configuration panel (F-082)
  | 'cors_viewed'
  | 'cors_policy_updated'
  | 'cors_preflight_tested'
  // firmographics — company hierarchy graph (F-008)
  | 'hierarchy_viewed'
  | 'hierarchy_resolved'
  // intent — buyer intent signals (F-012)
  | 'intent_resolved'
  // firmographics — historical time-series attributes (F-022)
  | 'timeseries_resolved'
  // data quality — cross-source reconciliation (F-027)
  | 'reconciliation_viewed'
  | 'reconciliation_run'
  // firmographics — company alias resolution (F-031)
  | 'company_alias_resolved'
  // accounts — household & account grouping (F-032)
  | 'accounts_viewed'
  | 'accounts_grouped'
  // identity — historical identity graph (F-035)
  | 'identity_history_viewed'
  | 'identity_history_resolved'
  // identity — cross-reference ID mapping (F-039)
  | 'cross_reference_viewed'
  | 'cross_reference_resolved'
  | 'cross_reference_exported'
  | 'decay_alerts_viewed'
  | 'decay_alert_actioned'
  | 'decay_threshold_changed'
  | 'accuracy_benchmark_viewed'
  | 'accuracy_benchmark_run'
  | 'coverage_gaps_viewed'
  | 'coverage_gaps_filtered'
  | 'coverage_expansion_requested'
  // data quality — golden-record snapshots (F-054)
  | 'golden_records_viewed'
  | 'golden_record_captured'
  | 'golden_record_pinned'
  | 'golden_record_deleted'
  // enrichment — currency normalization (F-056)
  | 'currency_normalized'
  // developer experience — GraphQL gateway (F-065)
  | 'graphql_explorer_viewed'
  | 'graphql_query_run'
  | 'graphql_query_failed'
  // reliability — request coalescing (F-068)
  | 'coalescing_viewed'
  | 'coalescing_drill_run'
  // compliance — regional API endpoints (F-070)
  | 'api_regions_viewed'
  | 'region_latency_tested'
  | 'data_residency_pinned'
  // data portability — bulk export endpoint (F-076)
  | 'bulk_export_previewed'
  | 'bulk_export_downloaded'
  // developer experience — gRPC high-throughput channel (F-077)
  | 'grpc_channel_viewed'
  | 'grpc_benchmark_run'
  // developer experience — dark-launch preview endpoints (F-081)
  | 'preview_program_viewed'
  | 'preview_endpoint_enrolled'
  | 'preview_endpoint_tried';

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
