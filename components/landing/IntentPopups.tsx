'use client';

/**
 * Phase-0 intent + dwell pop-ups (M1.2 + M1.4b). Distinct, tailored offers keyed to
 * the signal observed:
 *   - dwell: lingered past a threshold.
 *   - exit: pointer left toward the top (desktop exit-intent).
 *   - premium: opened a premium (higher-credit) endpoint in the sandbox.
 *   - pricing: engaged a pricing CTA.
 *   - docs: opened the documentation.
 * Each kind shows at most once per session and the total is capped so we never nag;
 * every kind emits its own telemetry. Other components fire action intents via
 * `emitLandingIntent(kind)`. Marketing design system.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Rocket, ArrowRight, Zap, Tag } from 'lucide-react';
import { track, type TelemetryEventName } from '@/lib/telemetry';

export type IntentKind = 'dwell' | 'exit' | 'premium' | 'pricing';

const INTENT_EVENT = 'zinbit:intent';
/** Fire a tailored intent pop-up from anywhere on the landing. */
export function emitLandingIntent(kind: IntentKind, detail: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INTENT_EVENT, { detail: { kind, ...detail } }));
}

interface PopupCopy {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  event: TelemetryEventName;
}

const COPY: Record<IntentKind, PopupCopy> = {
  dwell: {
    icon: <Sparkles className="w-5 h-5" />, eyebrow: 'Still exploring?',
    title: 'Fire a real call in under 10 minutes',
    body: 'Create a free account, grab a key, and get 5,000 credits to run any endpoint against the real gateway — no card required.',
    cta: 'Start free', event: 'dwell_popup_shown',
  },
  exit: {
    icon: <Rocket className="w-5 h-5" />, eyebrow: 'Before you go',
    title: 'Take the sandbox with you',
    body: 'Your first key is one click away. Test with synthetic data for free, switch to live when you’re ready — you only spend credits on real calls.',
    cta: 'Create free account', event: 'exit_intent_popup_shown',
  },
  premium: {
    icon: <Zap className="w-5 h-5" />, eyebrow: 'Premium endpoint',
    title: 'Run our highest-value data live',
    body: 'This endpoint returns our richest data. Your 5,000 free credits cover plenty of calls — spin up a key and try it for real.',
    cta: 'Try it free', event: 'intent_popup_premium_shown',
  },
  pricing: {
    icon: <Tag className="w-5 h-5" />, eyebrow: 'Sizing it up?',
    title: 'You only pay for real calls',
    body: 'No seats, no minimums — credits are spent per successful call, and sandbox/test calls are always free. Start free and scale when you do.',
    cta: 'Start free', event: 'intent_popup_pricing_shown',
  },
};

const DWELL_MS = 25_000;
const MAX_POPUPS = 2;
const SEEN_KEY = 'zinbit-lp-popups';

function readSeen(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') as string[]; } catch { return []; }
}
function writeSeen(kinds: string[]): void {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(kinds)); } catch { /* storage blocked */ }
}

export function IntentPopups() {
  const [active, setActive] = useState<IntentKind | null>(null);

  const show = useCallback((kind: IntentKind) => {
    const seen = readSeen();
    if (seen.includes(kind) || seen.length >= MAX_POPUPS) return;
    writeSeen([...seen, kind]);
    setActive(kind);
    track(COPY[kind].event, {});
  }, []);

  // Dwell timer.
  useEffect(() => {
    const t = setTimeout(() => show('dwell'), DWELL_MS);
    return () => clearTimeout(t);
  }, [show]);

  // Exit-intent (desktop): pointer leaves toward the top of the viewport.
  useEffect(() => {
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) show('exit'); };
    document.addEventListener('mouseout', onLeave);
    return () => document.removeEventListener('mouseout', onLeave);
  }, [show]);

  // Action intents fired by other landing components.
  useEffect(() => {
    const onIntent = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind as IntentKind | undefined;
      if (kind && kind in COPY) show(kind);
    };
    window.addEventListener(INTENT_EVENT, onIntent);
    return () => window.removeEventListener(INTENT_EVENT, onIntent);
  }, [show]);

  const dismiss = () => { track('intent_popup_dismissed', { kind: active ?? '' }); setActive(null); };
  const copy = active ? COPY[active] : null;

  return (
    <AnimatePresence>
      {copy && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-6 right-6 z-[120] w-[340px] max-w-[calc(100vw-2rem)]"
          role="dialog"
          aria-label={copy.title}
        >
          <div className="relative rounded-2xl border border-teal/30 bg-white dark:bg-ink shadow-2xl p-5">
            <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 text-ink/40 dark:text-white/40 hover:text-ink dark:hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal/15 text-teal mb-3">{copy.icon}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-teal">{copy.eyebrow}</div>
            <h3 className="text-[16px] font-bold text-ink dark:text-white mt-1">{copy.title}</h3>
            <p className="text-[13px] text-ink/60 dark:text-white/60 mt-1.5 leading-relaxed">{copy.body}</p>
            <Link
              href="/signup"
              onClick={() => track('intent_popup_cta_clicked', { kind: active ?? '' })}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-teal px-5 py-2.5 text-[14px] font-bold text-ink transition-all hover:bg-teal-ice hover:-translate-y-0.5 w-full"
            >
              {copy.cta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
