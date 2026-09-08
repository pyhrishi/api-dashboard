'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, X, Clock } from 'lucide-react';
import { useStore } from '@/lib/store';

/**
 * Preview-as-customer banner (Admin Panel FR-5). When an operator opens the console
 * through `/console/preview-session`, a short-lived sandbox key is added to the
 * store and this banner labels every screen until it expires or the operator exits.
 */
export function ImpersonationBanner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const revokeKey = useStore((s) => s.revokeKey);
  const session = activeKeys.find((k) => k.name.startsWith('Preview ·') && k.status === 'active' && k.expiresAt && Date.parse(k.expiresAt) > Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!session) return; const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, [session]);
  if (!session || !session.expiresAt) return null;
  const minutes = Math.max(0, Math.round((Date.parse(session.expiresAt) - now) / 60_000));
  const customer = session.name.replace('Preview · ', '');
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
        <div className="mb-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 flex items-center gap-3 flex-wrap" role="status">
          <Eye className="w-4 h-4 text-teal shrink-0" />
          <p className="text-[13px] text-fg min-w-0 flex-1"><span className="font-bold">Viewing as {customer}</span> <span className="text-fg-muted">· sandbox · operator preview from Zinbit Admin · every action is audit-logged</span></p>
          <span className="text-[11px] text-fg-muted inline-flex items-center gap-1"><Clock className="w-3 h-3" /> expires in {minutes} min</span>
          <Link href="/console/explorer" className="text-[11px] font-bold text-teal hover:underline">Run a sandbox call</Link>
          <button type="button" onClick={() => revokeKey(session.id)} className="text-[11px] font-bold text-fg-muted hover:text-fg inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><X className="w-3 h-3" /> Exit preview</button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
