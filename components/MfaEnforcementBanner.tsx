'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useMfaPolicy, enrollmentRequired } from '@/lib/mfa';

/**
 * MFA enforcement gate (F-309) — a persistent, non-dismissible banner shown across
 * the console when the org requires MFA and the signed-in user hasn't enrolled (and
 * any grace period has passed). It links to the enrollment flow; it hides itself on
 * the MFA page (where the user is already enrolling). Reads the dedicated MFA store
 * joined read-only with the current user + the legacy is2faEnabled flag.
 */
export function MfaEnforcementBanner() {
  const pathname = usePathname();
  const user = useStore((s) => s.user);
  const is2faEnabled = useStore((s) => s.is2faEnabled);
  const policy = useMfaPolicy((s) => s.policy);
  const graceUntil = useMfaPolicy((s) => s.graceUntil);
  const enrollments = useMfaPolicy((s) => s.enrollments);

  const self = user?.email ? { email: user.email, is2faEnabled } : null;
  const gated = enrollmentRequired(policy, self, enrollments, graceUntil, Date.now());
  const onMfaPage = pathname?.startsWith('/console/mfa');

  return (
    <AnimatePresence>
      {gated && !onMfaPage && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mb-4 rounded-xl border border-semantic-error/40 bg-semantic-error/5 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-semantic-error shrink-0"><ShieldAlert className="w-5 h-5" /></span>
            <p className="text-sm text-fg min-w-0 flex-1">
              <span className="font-bold">Your organization requires MFA.</span> Enroll an authenticator app to keep access to the console.
            </p>
            <Link
              href="/console/mfa"
              className="inline-flex items-center gap-1.5 text-sm font-bold bg-semantic-error text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity shrink-0"
            >
              Enroll now <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
