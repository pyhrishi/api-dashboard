'use client';

/**
 * Phase-0 intent + dwell pop-ups (M1.2). Distinct, tailored offers keyed to the
 * signal observed:
 *   - dwell: the visitor lingered past a threshold → gentle "still exploring?" nudge.
 *   - exit-intent: the pointer left toward the top (desktop) → stronger "before you go".
 * Each shows at most once per session (sessionStorage), is dismissible, and emits a
 * distinct telemetry event. Marketing design system.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Rocket, ArrowRight } from 'lucide-react';
import { track } from '@/lib/telemetry';

type PopupKind = 'dwell' | 'exit';

interface PopupCopy {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

const COPY: Record<PopupKind, PopupCopy> = {
  dwell: {
    icon: <Sparkles className="w-5 h-5" />,
    eyebrow: 'Still exploring?',
    title: 'Fire a real call in under 10 minutes',
    body: 'Create a free account, grab a key, and get 5,000 credits to run any endpoint against the real gateway — no card required.',
    cta: 'Start free',
  },
  exit: {
    icon: <Rocket className="w-5 h-5" />,
    eyebrow: 'Before you go',
    title: 'Take the sandbox with you',
    body: 'Your first key is one click away. Test with synthetic data for free, switch to live when you’re ready — you only spend credits on real calls.',
    cta: 'Create free account',
  },
};

const DWELL_MS = 25_000;
const SEEN_KEY = 'zinbit-lp-popup-seen';

function seen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen(): void {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
}

export function IntentPopups() {
  const [active, setActive] = useState<PopupKind | null>(null);

  const show = useCallback((kind: PopupKind) => {
    if (seen()) return;
    markSeen();
    setActive(kind);
    track(kind === 'dwell' ? 'dwell_popup_shown' : 'exit_intent_popup_shown', {});
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
