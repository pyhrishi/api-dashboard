/**
 * Admin telemetry — typed operator events. In the prototype they land in an
 * in-memory ring buffer (readable on the Audit page); production forwards them to
 * the internal analytics pipeline. `track()` never throws.
 */

export type AdminEventName =
  | 'admin_signed_in' | 'admin_signed_out'
  | 'admin_page_viewed'
  | 'customer_opened'
  | 'preview_started' | 'preview_ended'
  | 'key_created' | 'key_updated' | 'key_status_changed' | 'key_regenerated' | 'key_deleted'
  | 'ledger_filtered' | 'ledger_exported'
  | 'wallet_viewed'
  | 'access_request_decided' | 'access_request_commented'
  | 'trigger_updated' | 'handoff_updated'
  | 'alerts_viewed' | 'alerts_evaluated' | 'alert_acked' | 'alert_resolved' | 'alert_snoozed' | 'alert_rule_updated' | 'alert_action_taken'
  | 'abuse_viewed' | 'abuse_signal_dismissed' | 'abuse_key_suspended' | 'abuse_action_taken'
  | 'health_viewed' | 'health_followup_created'
  | 'approvals_viewed' | 'change_submitted' | 'change_approved' | 'change_rejected'
  | 'messages_viewed' | 'customer_message_sent'
  | 'destructive_action_confirmed';

export type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

export interface AdminEventRecord { id: string; name: AdminEventName; at: number; props: TelemetryProps }

const BUFFER: AdminEventRecord[] = [];
const CAPACITY = 500;
let seq = 0;

export function track(name: AdminEventName, props: TelemetryProps = {}): void {
  try {
    seq += 1;
    BUFFER.unshift({ id: `aevt_${seq}`, name, at: Date.now(), props });
    if (BUFFER.length > CAPACITY) BUFFER.length = CAPACITY;
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ADMIN_TELEMETRY_DEBUG === '1') console.debug('[admin-telemetry]', name, props);
  } catch { /* never throw */ }
}

export function recentEvents(limit = 50): AdminEventRecord[] { return BUFFER.slice(0, limit); }
