'use client';

/**
 * Consent banner (Phase 0, M1.4c). Shown once until the visitor chooses. Rejecting
 * suppresses marketing pop-ups + de-anon (see lib/consent). GDPR/DPDP-aware copy.
 * Marketing design system.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { getConsent, setConsent } from '@/lib/consent';
import { track } from '@/lib/telemetry';

export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() === 'pending') {
      setOpen(true);
      track('consent_banner_shown', {});
    }
  }, []);

  const choose = (granted: boolean) => {
    setConsent(granted ? 'granted' : 'rejected');
    track(granted ? 'consent_granted' : 'consent_rejected', {});
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-4 left-4 z-[130] w-[360px] max-w-[calc(100vw-2rem)]"
          role="dialog"
          aria-label="Cookie and analytics consent"
        >
          <div className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-ink shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-teal"><ShieldCheck className="w-4 h-4" /></span>
              <span className="text-[13px] font-bold text-ink dark:text-white">Your privacy</span>
            </div>
            <p className="text-[12px] text-ink/60 dark:text-white/60 leading-relaxed">
              We use analytics (Clarity, GA, Mixpanel) and visitor de-anonymization to improve the product and follow up.
              Under GDPR/DPDP we ask first — essential functionality works either way.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => choose(false)} className="flex-1 rounded-full border border-black/10 dark:border-white/15 px-4 py-2 text-[13px] font-bold text-ink dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors">
                Reject non-essential
              </button>
              <button onClick={() => choose(true)} className="flex-1 rounded-full bg-teal px-4 py-2 text-[13px] font-bold text-ink hover:bg-teal-ice transition-colors">
                Accept all
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
