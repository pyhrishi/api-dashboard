'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { primaryStage, activeTriggers, detectTransitions, detectStateMilestones, type LifecycleAccount } from '@/lib/lifecycle';
import {
  useNudgeState, activeNudges, eligibleNudges, nudgeById, isDismissed, isSnoozed, resolveNudge, PRIORITY_RANK,
  TRANSITION_NUDGE, TRANSITION_EVENT,
  type NudgeSpec,
} from '@/lib/nudges';
import { useLifecycleAccount } from '@/components/nudges/useLifecycleAccount';
import { NudgeBanner } from '@/components/nudges/NudgeBanner';
import { NudgeModal } from '@/components/nudges/NudgeModal';
import { RoleCaptureModal } from '@/components/nudges/RoleCaptureModal';

const SNOOZE_MS = 24 * 3_600_000;
const REFRESH_MS = 60_000;

/**
 * The in-product nudge orchestrator (Section F). Mounted once in the console layout,
 * it reads the lifecycle account, selects the eligible nudges (dismissal / snooze /
 * frequency caps / priority all handled in `lib/nudges.ts`), and renders them:
 *   - banners / checklist  → a stacked region at the top of the page content;
 *   - modal / celebration  → one focused dialog at a time (highest priority);
 *   - toast / progress     → an ephemeral toast, fired once.
 *
 * Emits only the generic `nudge_*` lifecycle events; the milestone events
 * (first_call_made, usage_threshold_hit, …) are emitted by the state transitions and
 * the trigger evaluator (Steps 2–4), never here — so nothing is double-counted.
 */
export function NudgeOrchestrator() {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const account = useLifecycleAccount(now);
  const nudge = useNudgeState();
  const recordedRef = useRef<Set<string>>(new Set());
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [transitionIds, setTransitionIds] = useState<string[]>([]);
  const prevAccountRef = useRef<LifecycleAccount | null>(null);

  // Seed the authoritative, persisted trial start once, so the decision window counts
  // down stably across sessions (Step 3). No-op after the first seed.
  useEffect(() => {
    if (account.trialStartedAt !== null) useNudgeState.getState().seedTrialStart(account.trialStartedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const stage = primaryStage(account, now);
  const signature = useMemo(() => `${stage}|${activeTriggers(account, now).slice().sort().join(',')}`, [account, now, stage]);

  // One-shot celebrations & activation milestones on real transitions (Step 2). The
  // first snapshot is baselined so the already-provisioned demo state does not celebrate.
  const txSignature = `${account.trialGranted}|${account.firstKeyAt !== null}|${account.firstCallAt !== null}|${account.paidAt !== null}|${account.walletBalanceCredits}`;
  useEffect(() => {
    const prev = prevAccountRef.current;
    prevAccountRef.current = account;
    if (prev === null) return;
    // Conversion & wallet milestone events (decision window, wallet low/zero, dunning).
    detectStateMilestones(prev, account, Date.now()).forEach((m) => {
      const key = `evt:${m.name}`;
      if (recordedRef.current.has(key)) return;
      recordedRef.current.add(key);
      track(m.name, m.props);
    });
    detectTransitions(prev, account).forEach((t) => {
      const evt = TRANSITION_EVENT[t];
      if (evt) track(evt, { source: 'transition' });
      const nid = TRANSITION_NUDGE[t];
      if (!nid || recordedRef.current.has(nid)) return;
      const spec = nudgeById(nid);
      if (!spec) return;
      recordedRef.current.add(nid);
      useNudgeState.getState().recordShown(nid, Date.now());
      track('nudge_shown', { nudge: nid, code: String(spec.code), surface: spec.surface, funnel: spec.funnel, priority: spec.priority, transition: t });
      if (spec.surface === 'toast' || spec.surface === 'progress') toast.info(spec.title, spec.body);
      else setTransitionIds((ids) => (ids.includes(nid) ? ids : [...ids, nid]));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the transition signature
  }, [txSignature]);

  // When the lifecycle signature changes, discover newly-eligible nudges: record the
  // show, emit `nudge_shown`, and either queue a persistent surface or fire a toast.
  useEffect(() => {
    const state = useNudgeState.getState();
    activeNudges(account, state, now).forEach((n) => {
      if (recordedRef.current.has(n.id)) return;
      recordedRef.current.add(n.id);
      state.recordShown(n.id, Date.now());
      track('nudge_shown', { nudge: n.id, code: String(n.code), surface: n.surface, funnel: n.funnel, priority: n.priority, stage });
      if (n.surface === 'toast' || n.surface === 'progress') {
        toast.info(n.title, n.body);
      } else {
        setSessionIds((prev) => (prev.includes(n.id) ? prev : [...prev, n.id]));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the lifecycle signature
  }, [signature]);

  // Render set: session nudges still eligible and not dismissed/snoozed, by priority.
  const eligibleNow = useMemo(() => {
    const ids: Record<string, true> = {};
    eligibleNudges(account, now).forEach((n) => { ids[n.id] = true; });
    return ids;
  }, [account, now]);

  const sessionDisplay = sessionIds
    .map((id) => nudgeById(id))
    .filter((spec): spec is NudgeSpec => !!spec && eligibleNow[spec.id] === true && !isDismissed(nudge, spec.id) && !isSnoozed(nudge, spec.id, now));
  // Transition celebrations are one-shot: shown regardless of stage eligibility until acted on.
  const transitionDisplay = transitionIds
    .map((id) => nudgeById(id))
    .filter((spec): spec is NudgeSpec => !!spec && !isDismissed(nudge, spec.id) && !isSnoozed(nudge, spec.id, now));
  const display = [...transitionDisplay, ...sessionDisplay].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const banners = display.filter((n) => n.surface === 'banner' || n.surface === 'checklist').slice(0, 3);
  const modal = display.find((n) => n.surface === 'modal' || n.surface === 'celebration') ?? null;

  // C1-b role/use-case capture — once, for a fresh account still in onboarding.
  const showCapture = !account.onboardingComplete && !nudge.profile.captured;

  const onCta = (spec: NudgeSpec) => {
    track('nudge_clicked', { nudge: spec.id, code: String(spec.code) });
    nudge.convert(spec.id, Date.now());
    track('nudge_converted', { nudge: spec.id, code: String(spec.code) });
    if (spec.cta) router.push(spec.cta.href);
  };
  const onDismiss = (spec: NudgeSpec) => { track('nudge_dismissed', { nudge: spec.id, code: String(spec.code) }); nudge.dismiss(spec.id, Date.now()); };
  const onSnooze = (spec: NudgeSpec) => { track('nudge_snoozed', { nudge: spec.id, code: String(spec.code) }); nudge.snooze(spec.id, Date.now() + SNOOZE_MS, Date.now()); };

  return (
    <>
      <div className={banners.length > 0 ? 'space-y-2 mb-4' : ''} role="region" aria-label="Suggestions">
        <AnimatePresence initial={false}>
          {banners.map((n) => {
            const r = resolveNudge(n, account, now);
            return <NudgeBanner key={n.id} spec={n} body={r.body} ctaLabel={r.ctaLabel ?? undefined} onCta={() => onCta(n)} onSnooze={() => onSnooze(n)} onDismiss={() => onDismiss(n)} />;
          })}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {modal && (
          <NudgeModal
            key={modal.id}
            spec={modal}
            body={resolveNudge(modal, account, now).body}
            ctaLabel={resolveNudge(modal, account, now).ctaLabel ?? undefined}
            celebrate={modal.surface === 'celebration'}
            onCta={() => onCta(modal)}
            onSnooze={() => onSnooze(modal)}
            onDismiss={() => onDismiss(modal)}
          />
        )}
      </AnimatePresence>
      {showCapture && !modal && <RoleCaptureModal onDone={() => { /* profile flag set inside */ }} />}
    </>
  );
}
