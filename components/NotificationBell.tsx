'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, ArrowRight, Siren } from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { StatusBadge, Button, type BadgeTone } from '@/components/ui';
import { useAlertCenter, openIncidents, unseenIncidents, canAcknowledge, fmtIncidentValue, type AlertIncident } from '@/lib/growth-alerts';
import { cn } from '@/lib/utils';

const OWNER_TONE: Record<AlertIncident['owner'], BadgeTone> = { Product: 'teal', Eng: 'warning', 'Docs owner': 'info' };

const relTime = (ms: number, now: number) => {
  const mins = Math.max(0, Math.floor((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};

/**
 * Header notification bell — the in-app delivery channel for Growth alerts.
 * Shows unseen open incidents, lets the reader acknowledge from here, and links to
 * the Alert Center for routing, thresholds and the digest.
 */
export function NotificationBell() {
  const { user } = useStore();
  const toast = useToast();
  const incidents = useAlertCenter((s) => s.incidents);
  const lastSeenAt = useAlertCenter((s) => s.lastSeenAt);
  const markSeen = useAlertCenter((s) => s.markSeen);
  const acknowledge = useAlertCenter((s) => s.acknowledge);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setNow(Date.now()); }, [open, incidents]);

  const openList = openIncidents(incidents);
  const unseen = unseenIncidents(incidents, lastSeenAt).length;
  const canAck = canAcknowledge(user?.role);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      track('notification_bell_opened', { open: openList.length, unseen });
      markSeen();
    }
  };

  const ack = (inc: AlertIncident) => {
    if (acknowledge(user?.role, inc.id, user?.email ?? 'you', 'Acknowledged from the notification bell')) {
      track('growth_alert_acknowledged', { rule: inc.ruleId, source: inc.source, hasNote: false, surface: 'bell' });
      toast.success('Acknowledged', `${inc.label} is now yours — resolve it from the Alert Center when the number recovers.`);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unseen > 0 ? `Notifications, ${unseen} new alert${unseen === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
          openList.length > 0 ? 'bg-semantic-error/10 border-semantic-error/30 text-semantic-error hover:bg-semantic-error/15' : 'bg-glass border-border text-fg-muted hover:text-fg hover:border-teal/30',
        )}
      >
        <Bell className="w-4 h-4" />
        {unseen > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-semantic-error text-[10px] font-black text-white flex items-center justify-center tabular-nums" aria-hidden>
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Growth alerts"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16 }}
            className="absolute right-0 top-12 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Siren className="w-4 h-4 text-teal" />
                <span className="text-sm font-bold text-fg">Growth alerts</span>
              </div>
              <StatusBadge tone={openList.length > 0 ? 'error' : 'success'} dot pulse={openList.length > 0}>{openList.length > 0 ? `${openList.length} open` : 'all clear'}</StatusBadge>
            </div>

            {openList.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Check className="w-6 h-6 text-teal mx-auto mb-2" />
                <div className="text-sm font-bold text-fg">Every rule is within its threshold</div>
                <p className="text-[12px] text-fg-muted mt-1">Activation, OTP completion, top-up failures and docs search are all healthy this week.</p>
              </div>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto divide-y divide-border">
                {openList.slice(0, 6).map((inc) => (
                  <li key={inc.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-fg truncate">{inc.label}</span>
                        {inc.source === 'rehearsal' && <StatusBadge tone="neutral">rehearsal</StatusBadge>}
                      </div>
                      <div className="text-[12px] text-fg-muted mt-0.5">
                        <span className="font-semibold text-semantic-error tabular-nums">{fmtIncidentValue(inc)}</span> · <StatusBadge tone={OWNER_TONE[inc.owner]}>→ {inc.owner}</StatusBadge> · {now ? relTime(inc.firedAt, now) : ''}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => ack(inc)} disabled={!canAck} title={canAck ? 'Acknowledge this alert' : 'Your role cannot acknowledge alerts'} icon={<Check className="w-3.5 h-3.5" />}>Ack</Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-4 py-3 border-t border-border bg-surface-2 flex items-center justify-between">
              <span className="text-[11px] text-fg-muted">{openList.length > 6 ? `${openList.length - 6} more in the Alert Center` : 'Routing, thresholds and the weekly digest'}</span>
              <Link href="/console/alerts" onClick={() => setOpen(false)} className="text-[12px] font-bold text-teal hover:underline inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">
                Alert Center <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
