'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { activeTriggers, triggerEvent, leadScoreOf, LEAD_CLASS_EVENT, type TriggerId } from '@/lib/lifecycle';
import { useNudgeState, eligibleNudges } from '@/lib/nudges';
import { reengagementDue, planReengagement, type NudgeDelivery } from '@/lib/nudge-delivery';
import { useLifecycleAccount } from '@/components/nudges/useLifecycleAccount';

const RECHECK_MS = 5 * 60_000;

/** Threshold/time triggers the watcher owns; the orchestrator's Step-3 milestones own decision/wallet. */
function isWatcherTrigger(t: TriggerId): boolean {
  return !(t === 'decision_window' || t === 'wallet_low' || t === 'wallet_depleted' || t === 'wallet_zero');
}

/**
 * The nudge trigger evaluator (Step 4). Mounted once in the console layout, it runs
 * on a cadence (and on state change) to:
 *   - fire the time/threshold milestone events the orchestrator doesn't
 *     (usage_threshold_hit, key_expiry_warned, key_expired, inactivity_detected),
 *     once per crossing — baselined on first run so already-crossed thresholds on load
 *     don't emit a burst;
 *   - dispatch re-engagement email/webhook for stalled nudges, in a capped multi-touch
 *     sequence that honours unsubscribe (`lib/nudge-delivery.ts`, Alert-Center-style ledger).
 *
 * A deterministic simulated-time offset (from the nudge store) lets the /console/journey
 * cockpit (Step 5) exercise time-based triggers the prototype can't naturally age into.
 */
export function NudgeWatcher() {
  const user = useStore((s) => s.user);
  const simulatedOffset = useNudgeState((s) => s.simulatedOffsetMs);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => clearInterval(t);
  }, []);
  const effNow = now + simulatedOffset;
  const account = useLifecycleAccount(effNow);

  const prevTriggersRef = useRef<Record<string, true>>({});
  const firedRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);

  useEffect(() => {
    const triggers = activeTriggers(account, effNow);
    const next: Record<string, true> = {};
    triggers.forEach((t) => { next[t] = true; });

    if (!baselinedRef.current) {
      baselinedRef.current = true;
      prevTriggersRef.current = next; // establish the baseline without firing
    } else {
      triggers.forEach((t) => {
        if (!isWatcherTrigger(t) || prevTriggersRef.current[t]) return;
        const evt = triggerEvent(t, account, effNow);
        if (evt && !firedRef.current.has(t)) {
          firedRef.current.add(t);
          track(evt.name, evt.props);
        }
      });
      prevTriggersRef.current = next;
    }

    // Re-engagement dispatch for stalled nudges (time-gated, self-limiting via touch counters).
    const state = useNudgeState.getState();
    const recipient = user?.email ?? null;
    const dispatched: NudgeDelivery[] = [];
    eligibleNudges(account, effNow).forEach((spec) => {
      if (!spec.reengagement) return;
      const ctx = { recipient, unsubscribed: state.unsubscribed, touchesSoFar: state.reengagementTouches[spec.id] ?? 0 };
      if (!reengagementDue(spec, state.records[spec.id], ctx, effNow)) return;
      planReengagement(spec, ctx, effNow).forEach((d) => {
        dispatched.push(d);
        track('reengagement_sent', { nudge: spec.id, channel: d.channel, touch: d.touch, status: d.status });
      });
    });
    if (dispatched.length > 0) useNudgeState.getState().recordReengagement(dispatched);

    // Lead classification & sales signals (Step 5): emit on class change, once per class.
    const lead = leadScoreOf(account, effNow);
    if (lead.class !== state.leadClass) {
      const evt = LEAD_CLASS_EVENT[lead.class];
      if (evt && !firedRef.current.has(`lead:${lead.class}`)) {
        firedRef.current.add(`lead:${lead.class}`);
        track(evt, { score: lead.score, prevClass: state.leadClass, salesRoutable: lead.salesRoutable });
      }
      track('lead_score_changed', { score: lead.score, class: lead.class });
    }
    if (lead.score !== state.leadScore || lead.class !== state.leadClass) state.setLead(lead.score, lead.class);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the effective clock or account changes
  }, [effNow, account]);

  return null;
}
