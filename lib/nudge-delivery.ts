/**
 * Nudge re-engagement delivery (Step 4, Section F "re-engagement if stalled").
 *
 * When an in-product nudge stalls — shown but not acted on past its re-engagement
 * window — the account is reached over email (and webhook where configured) in a
 * capped, multi-touch sequence that honours unsubscribe. This mirrors the Alert
 * Center delivery ledger's honest delivered/failed/skipped model, but the recipient
 * is the developer (not an ops owner), so it lives in the nudge store.
 *
 * Pure and deterministic — the outcome is a function of the routing config, not a
 * random draw. No Node APIs; safe in the browser and in tests.
 */

import type { NudgeSpec, NudgeRecord } from '@/lib/nudges';

export type NudgeDeliveryChannel = 'email' | 'webhook';
export type NudgeDeliveryStatus = 'delivered' | 'failed' | 'skipped';

export interface NudgeDelivery {
  id: string;
  nudgeId: string;
  /** Which touch in the sequence (1-based). */
  touch: number;
  channel: NudgeDeliveryChannel;
  target: string;
  status: NudgeDeliveryStatus;
  at: number;
  detail: string;
}

export interface ReengagementContext {
  /** The developer's email; null → email fails honestly. */
  recipient: string | null;
  /** Optional webhook URL for lifecycle events (Phase 2 in the table). */
  webhookUrl?: string;
  /** Opt-out honoured across all channels. */
  unsubscribed: boolean;
  /** How many touches already sent for this nudge. */
  touchesSoFar: number;
}

const HOUR = 3_600_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Is this nudge due for its next re-engagement touch now? Due when the nudge has a
 * re-engagement config, the account hasn't opted out, the cap isn't reached, the
 * nudge was shown and not converted, and enough time has passed since it was last
 * seen (the window widens with each touch: afterHours × touchNumber).
 */
export function reengagementDue(spec: NudgeSpec, record: NudgeRecord | undefined, ctx: ReengagementContext, now: number): boolean {
  if (!spec.reengagement) return false;
  if (ctx.unsubscribed) return false;
  if (!record || record.seenCount === 0) return false;
  if (record.status === 'converted') return false;
  if (ctx.touchesSoFar >= spec.reengagement.maxTouches) return false;
  const dueAt = record.lastSeenAt + spec.reengagement.afterHours * HOUR * (ctx.touchesSoFar + 1);
  return now >= dueAt;
}

/** Plan the delivery attempts for one re-engagement touch. */
export function planReengagement(spec: NudgeSpec, ctx: ReengagementContext, now: number): NudgeDelivery[] {
  const touch = ctx.touchesSoFar + 1;
  const idBase = `nd_${spec.id}_${touch}_${now}`;
  const out: NudgeDelivery[] = [];
  if (spec.channels.includes('email')) {
    const ok = !!ctx.recipient && EMAIL_RE.test(ctx.recipient);
    out.push({ id: `${idBase}_email`, nudgeId: spec.id, touch, channel: 'email', target: ctx.recipient ?? '—', status: ok ? 'delivered' : 'failed', at: now, detail: ok ? `Re-engagement email (touch ${touch}) sent.` : 'No valid recipient email.' });
  }
  if (spec.channels.includes('webhook')) {
    const ok = !!ctx.webhookUrl && /^https:\/\/[^\s]+$/.test(ctx.webhookUrl);
    out.push({ id: `${idBase}_webhook`, nudgeId: spec.id, touch, channel: 'webhook', target: ctx.webhookUrl ?? '—', status: ok ? 'delivered' : 'skipped', at: now, detail: ok ? `Lifecycle webhook (touch ${touch}) posted.` : 'No webhook configured.' });
  }
  return out;
}

export interface DeliverySummary { total: number; delivered: number; failed: number; skipped: number }
export function nudgeDeliverySummary(records: NudgeDelivery[]): DeliverySummary {
  return {
    total: records.length,
    delivered: records.filter((r) => r.status === 'delivered').length,
    failed: records.filter((r) => r.status === 'failed').length,
    skipped: records.filter((r) => r.status === 'skipped').length,
  };
}
