'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gauge, Timer, Play, RefreshCw, AlertTriangle, ArrowRight, Sparkles, Hourglass, ShieldCheck, Activity,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, StatusBadge, type BadgeTone } from '@/components/ui';
import { parseRateLimitHeaders, RATE_LIMIT_WINDOW_SEC, type ParsedRateLimit } from '@/lib/gateway/rateLimitHeaders';

const STANDARD_HEADERS = [
  { name: 'RateLimit-Limit', desc: 'The quota ceiling for the current window (tokens per window).' },
  { name: 'RateLimit-Remaining', desc: 'Tokens left before you are throttled.' },
  { name: 'RateLimit-Reset', desc: 'Seconds until the quota refills (delta-seconds, per the IETF draft).' },
  { name: 'RateLimit-Policy', desc: `The policy, e.g. "100;w=${RATE_LIMIT_WINDOW_SEC}" — 100 requests per ${RATE_LIMIT_WINDOW_SEC}s.` },
  { name: 'Retry-After', desc: 'On a 429 only — seconds to wait before retrying.' },
];

interface Inspection { status: number; parsed: ParsedRateLimit; raw: Record<string, string>; }

function gaugeTone(pct: number): BadgeTone {
  if (pct > 50) return 'success'; if (pct > 20) return 'warning'; return 'error';
}

function RateLimitHeadersInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);
  const toast = useToast();

  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [bursting, setBursting] = useState(false);
  const [limited, setLimited] = useState<Inspection | null>(null);

  const readHeaders = (res: Response): Inspection => {
    const raw: Record<string, string> = {};
    ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Policy', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'].forEach((h) => {
      const v = res.headers.get(h); if (v != null) raw[h] = v;
    });
    return { status: res.status, parsed: parseRateLimitHeaders((n) => res.headers.get(n)), raw };
  };

  const inspect = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/v1/companies/enrich?domain=stripe.com', { headers: { Authorization: authHeaderValue(apiKey) } });
      const insp = readHeaders(res);
      setInspection(insp);
      setPhase('ready');
      track('rate_limit_inspected', { status: insp.status, remaining: insp.parsed.remaining, standard: insp.parsed.standard, environment });
    } catch {
      setPhase('error');
    }
  }, [apiKey, environment]);

  useEffect(() => { track('rate_limit_headers_viewed', { environment }); }, [environment]);

  const triggerLimit = async () => {
    setBursting(true); setLimited(null);
    try {
      // Fire rapid calls until one is rate-limited, then capture ITS headers.
      let hit: Inspection | null = null;
      for (let i = 0; i < 130 && !hit; i++) {
        const res = await fetch('/api/v1/companies/enrich?domain=stripe.com', { headers: { Authorization: authHeaderValue(apiKey) } });
        if (res.status === 429) hit = readHeaders(res);
      }
      if (hit) {
        setLimited(hit);
        toast.success('Rate limited', `Got a 429 with Retry-After: ${hit.parsed.retryAfter ?? '—'}s.`);
      } else {
        toast.info('Not limited', 'The bucket did not drain within the burst — try again.');
      }
    } catch {
      toast.error('Burst failed', 'The gateway didn’t respond.');
    } finally {
      setBursting(false);
    }
  };

  const pct = inspection?.parsed.limit && inspection.parsed.remaining != null
    ? Math.round((inspection.parsed.remaining / inspection.parsed.limit) * 100) : null;

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Gauge />}
        title="Standard Rate-Limit Headers"
        description="Every response carries the emerging IETF-standard rate-limit headers — RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset (delta-seconds), and RateLimit-Policy — plus Retry-After on a 429, with the legacy X-RateLimit-* kept for compatibility. Inspect them live on a real call."
        actions={<Link href="/console/rate-limits"><Button variant="secondary" size="sm"><Activity className="w-4 h-4" /> Rate limits</Button></Link>}
      />

      {/* Live inspector */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-fg flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-teal" /> Inspect a live response</h3>
          <Button size="sm" className="ml-auto" onClick={inspect} disabled={phase === 'loading'}>{phase === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Inspect</Button>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mt-4"><EmptyState icon={<Gauge className="w-7 h-7" />} title="Inspect the headers" description="Fire a real API call and read the RateLimit-* headers off the response." /></div>
            </motion.div>
          )}
          {phase === 'error' && (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
              <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-2 text-sm text-fg-muted"><AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" /> The gateway didn’t respond. <Button size="sm" variant="secondary" className="ml-auto" onClick={inspect}><RefreshCw className="w-4 h-4" /> Retry</Button></div>
            </motion.div>
          )}
          {phase === 'ready' && inspection && (
            <motion.div key="r" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiTile label="Limit" value={inspection.parsed.limit ?? '—'} icon={<Gauge />} />
                <KpiTile label="Remaining" value={inspection.parsed.remaining ?? '—'} icon={<Activity />} hint={pct != null ? `${pct}%` : undefined} />
                <KpiTile label="Reset (s)" value={inspection.parsed.resetSeconds ?? '—'} icon={<Timer />} />
                <KpiTile label="Policy" value={inspection.parsed.policy ?? '—'} icon={<Hourglass />} />
              </div>
              {pct != null && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-fg-subtle mb-1"><span>Quota remaining</span><StatusBadge tone={gaugeTone(pct)}>{pct}%</StatusBadge></div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><motion.div className="h-full bg-teal" initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge tone={inspection.parsed.standard ? 'success' : 'warning'}>{inspection.parsed.standard ? 'Standard RateLimit-* present' : 'Legacy X- only'}</StatusBadge>
                <StatusBadge tone={inspection.status === 200 ? 'success' : 'error'}>{inspection.status}</StatusBadge>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Raw response headers</div>
                <pre className="text-[11px] font-mono text-fg-muted overflow-x-auto">{Object.entries(inspection.raw).map(([k, v]) => `${k}: ${v}`).join('\n') || '—'}</pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* 429 header demo */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Timer className="w-4 h-4 text-teal" /> See the headers on a 429</h3>
            <p className="text-[12px] text-fg-muted mt-1 leading-snug">Fire a burst until the bucket drains, then read the Retry-After + RateLimit-* headers off the throttled response.</p>
          </div>
          <Button onClick={triggerLimit} disabled={bursting}>{bursting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Trigger a 429</Button>
        </div>
        <AnimatePresence>
          {limited && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
              <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-4 flex-wrap">
                <StatusBadge tone="error">429</StatusBadge>
                <span className="text-sm text-fg">Retry-After <span className="font-black tabular-nums text-semantic-error">{limited.parsed.retryAfter ?? '—'}s</span></span>
                <span className="text-[12px] text-fg-muted">Remaining {limited.parsed.remaining ?? '—'} · resets in {limited.parsed.resetSeconds ?? '—'}s</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Header reference */}
      <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mt-6 mb-3">The header contract</div>
      <div className="space-y-2">
        {STANDARD_HEADERS.map((h) => (
          <div key={h.name} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2.5">
            <span className="font-mono text-[12px] font-bold text-teal w-44 shrink-0">{h.name}</span>
            <span className="text-[12px] text-fg-muted leading-snug">{h.desc}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Legacy X-RateLimit-* headers are still sent alongside the standard set, so existing clients keep working.</p>

      <div className="mt-6">
        <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">See 429s in Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function RateLimitHeadersPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <RateLimitHeadersInner />
    </RoleGuard>
  );
}
