'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Gift, ArrowRight } from 'lucide-react';
import { track } from '@/lib/telemetry';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * C0-b exit-intent capture on the signup gate. When the visitor moves to leave
 * (cursor exits the top of the viewport) once, a value reminder offers to hold their
 * free credits and captures the email into the form so the account isn't lost.
 * Simulated, dismissible, shown at most once. Pre-auth — anonymous telemetry.
 */
export function SignupExitIntent({ onCapture, disabled }: { onCapture: (email: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seen || disabled) return;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) { setSeen(true); setOpen(true); track('signup_started', { method: 'exit_intent' }); }
    };
    document.addEventListener('mouseout', onLeave);
    return () => document.removeEventListener('mouseout', onLeave);
  }, [seen, disabled]);

  const save = () => {
    const v = email.trim();
    if (!EMAIL_RE.test(v)) { setError('Enter a valid work email.'); return; }
    onCapture(v);
    track('signup_started', { method: 'exit_intent_captured' });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="exit-title">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 14 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-ink shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center"><Gift className="w-5 h-5" /></span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 id="exit-title" className="text-lg font-bold text-white mt-3">Before you go — your 10,000 free credits are waiting</h2>
              <p className="text-sm text-white/60 mt-1.5">Drop your work email and we’ll hold your spot. No phone number needed to start.</p>
              <div className="mt-4">
                <input
                  type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  aria-label="Work email" aria-invalid={!!error} placeholder="developer@startup.com"
                  className="w-full bg-[#09090B] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                />
                {error && <p className="text-[12px] text-semantic-error mt-1.5" role="alert">{error}</p>}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 bg-white/[0.03] flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">No thanks</button>
              <button type="button" onClick={save} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold bg-teal text-ink hover:bg-teal-ice transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">Save my spot <ArrowRight className="w-4 h-4" /></button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
