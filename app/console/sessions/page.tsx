'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MonitorSmartphone, Laptop, Smartphone, Tablet, Server, ShieldCheck, ShieldAlert,
  LogOut, Trash2, MapPin, Clock, Globe, Wifi, WifiOff, Info, ArrowRight, SlidersHorizontal,
  AlertTriangle, CircleCheck,
} from 'lucide-react';
import { useStore } from '@/lib/store';
// TODO(F-310 telemetry): re-enable after shared telemetry.ts append
// import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  scoreSession, summarizeSessions, staleSessionIds, parseDevice, relativeTime,
  type RiskLevel, type SessionRisk, type ParsedDevice,
} from '@/lib/sessions';
import type { ActiveSession } from '@/lib/store';
import {
  PageHeader, KpiTile, GlassCard, Button, StatusBadge, Skeleton, EmptyState, ConfirmAction,
  type BadgeTone,
} from '@/components/ui';

const RISK_TONE: Record<RiskLevel, BadgeTone> = { normal: 'success', elevated: 'warning', high: 'error' };
const RISK_LABEL: Record<RiskLevel, string> = { normal: 'Normal', elevated: 'Elevated', high: 'High risk' };
const TYPE_LABEL: Record<NonNullable<ActiveSession['type']>, string> = { console: 'Console', api: 'API key', cli: 'CLI' };

function DeviceIcon({ parsed, className }: { parsed: ParsedDevice; className?: string }) {
  const Icon = parsed.type === 'mobile' ? Smartphone : parsed.type === 'tablet' ? Tablet : parsed.type === 'server' ? Server : Laptop;
  return <Icon className={className} />;
}

function SessionsInner() {
  const { activeSessions, sessionPolicy, revokeSession, revokeAllOtherSessions, revokeSessions, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  // Pin "now" once per mount so relative times + risk are stable across re-renders.
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    // TODO(F-310 telemetry): track('sessions_viewed', { count: activeSessions.length });
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => summarizeSessions(activeSessions, sessionPolicy, now || Date.now()), [activeSessions, sessionPolicy, now]);
  const scored = useMemo(() => {
    const list = activeSessions.map((s) => ({ session: s, risk: scoreSession(s, activeSessions, sessionPolicy, now || Date.now()) }));
    // Current first, then by risk (high → normal), then most-recent activity.
    const rank: Record<RiskLevel, number> = { high: 0, elevated: 1, normal: 2 };
    return list.sort((a, b) => {
      if (a.session.isCurrent !== b.session.isCurrent) return a.session.isCurrent ? -1 : 1;
      if (rank[a.risk.level] !== rank[b.risk.level]) return rank[a.risk.level] - rank[b.risk.level];
      return Date.parse(b.session.lastActive) - Date.parse(a.session.lastActive);
    });
  }, [activeSessions, sessionPolicy, now]);

  const current = scored.find((s) => s.session.isCurrent) ?? null;
  const others = scored.filter((s) => !s.session.isCurrent);
  const staleIds = useMemo(() => staleSessionIds(activeSessions, sessionPolicy, now || Date.now()), [activeSessions, sessionPolicy, now]);
  const topRisk = others.find((s) => s.risk.level === 'high') ?? null;

  const doRevoke = (s: ActiveSession) => {
    revokeSession(s.id);
    // TODO(F-310 telemetry): track('session_revoked', { risk, type });
    toast.success('Session revoked', `${s.device} · ${s.location} was signed out.`);
  };

  const doRevokeAll = () => {
    const n = others.length;
    revokeAllOtherSessions();
    // TODO(F-310 telemetry): track('sessions_revoked_all', { count: n });
    toast.success('Signed out everywhere else', `${n} other ${n === 1 ? 'session' : 'sessions'} ended. This device stays signed in.`);
  };

  const doRevokeStale = () => {
    const n = staleIds.length;
    revokeSessions(staleIds);
    // TODO(F-310 telemetry): track('sessions_revoked_all', { count: n, scope: 'stale' });
    toast.success('Stale sessions cleared', `${n} idle ${n === 1 ? 'session' : 'sessions'} past the ${sessionPolicy.idleTimeoutMins}-minute policy signed out.`);
  };

  if (phase === 'loading') return <SessionsSkeleton />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Sessions"
        description="Every device and client currently signed into your account. We score each session against your active one — a sign-in from a new country, an idle session past your policy, an external network — and explain why, so you can spot the one you don't recognize and end it. One click signs out everywhere but here."
        icon={<MonitorSmartphone />}
        actions={
          others.length > 0 ? (
            <ConfirmAction variant="danger" onConfirm={doRevokeAll} confirmLabel="Click again — sign out all others">
              <LogOut className="w-4 h-4" /> Sign out everywhere else
            </ConfirmAction>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Active sessions" value={String(summary.total)} icon={<MonitorSmartphone />} hint={summary.overConcurrency ? `Over the ${sessionPolicy.maxConcurrent}-session limit` : `of ${sessionPolicy.maxConcurrent} allowed`} />
        <KpiTile label="This device" value="1" icon={<ShieldCheck />} hint={current ? current.session.location : '—'} />
        <KpiTile label="Idle / stale" value={String(summary.stale)} icon={<Clock />} hint={`Past ${sessionPolicy.idleTimeoutMins}m policy`} />
        <KpiTile label="High risk" value={String(summary.highRisk)} icon={<ShieldAlert />} hint={summary.highRisk > 0 ? 'Review below' : 'None flagged'} />
      </div>

      {/* High-risk callout — the wow: the risky session, explained */}
      <AnimatePresence>
        {topRisk && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard className="p-4 mt-6 border-semantic-error/30 bg-semantic-error/5">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-semantic-error/10 flex items-center justify-center shrink-0"><AlertTriangle className="w-4.5 h-4.5 text-semantic-error" /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-fg">A session needs your attention</div>
                  <div className="text-[13px] text-fg-muted mt-0.5">{topRisk.session.device} · {topRisk.session.browser} · {topRisk.session.location}</div>
                  <ul className="mt-2 space-y-1">
                    {topRisk.risk.reasons.map((r, i) => (
                      <li key={i} className="text-[12px] text-fg-muted flex items-start gap-1.5"><span className="text-semantic-error mt-0.5">•</span> {r}</li>
                    ))}
                  </ul>
                </div>
                <ConfirmAction variant="danger" size="sm" onConfirm={() => doRevoke(topRisk.session)} confirmLabel="Confirm revoke">
                  <Trash2 className="w-3.5 h-3.5" /> Revoke
                </ConfirmAction>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current session */}
      {current && (
        <div className="mt-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">This device</div>
          <SessionCard entry={current} now={now || Date.now()} onRevoke={undefined} />
        </div>
      )}

      {/* Other sessions */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Other sessions {others.length > 0 && <span className="text-fg-muted">· {others.length}</span>}</div>
          {staleIds.length > 0 && (
            <ConfirmAction variant="ghost" size="sm" onConfirm={doRevokeStale} confirmLabel="Confirm — clear stale">
              <Clock className="w-3.5 h-3.5" /> Revoke all stale ({staleIds.length})
            </ConfirmAction>
          )}
        </div>
        {others.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="No other sessions" description="You're only signed in on this device. Any new sign-in will appear here with a risk assessment." />
        ) : (
          <div className="space-y-3">
            {others.map((entry) => (
              <SessionCard key={entry.session.id} entry={entry} now={now || Date.now()} onRevoke={() => doRevoke(entry.session)} />
            ))}
          </div>
        )}
      </div>

      {/* Session policy — admin only */}
      {user?.role === 'admin' && <SessionPolicyPanel />}

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/settings/security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Security settings <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/login-security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Login Security <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function SessionCard({ entry, now, onRevoke }: { entry: { session: ActiveSession; risk: SessionRisk }; now: number; onRevoke?: () => void }) {
  const { session, risk } = entry;
  const parsed = parseDevice(session);
  const [showWhy, setShowWhy] = useState(false);
  return (
    <GlassCard className={`p-4 ${session.isCurrent ? 'border-teal/30 bg-teal/[0.03]' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${session.isCurrent ? 'bg-teal/10' : 'bg-surface-2'}`}>
          <DeviceIcon parsed={parsed} className={`w-5 h-5 ${session.isCurrent ? 'text-teal' : 'text-fg-muted'}`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg">{session.device}</span>
            <span className="text-[11px] text-fg-subtle">{parsed.os} · {session.browser}</span>
            {session.type && <StatusBadge tone="neutral">{TYPE_LABEL[session.type]}</StatusBadge>}
            {session.isCurrent && <StatusBadge tone="teal"><ShieldCheck className="w-3 h-3" /> Current</StatusBadge>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-fg-muted flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {session.location}</span>
            <span className="inline-flex items-center gap-1 font-mono">{risk.isExternal ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />} {session.ip}</span>
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {relativeTime(session.lastActive, now)}</span>
            {session.createdAt && <span className="inline-flex items-center gap-1 text-fg-subtle"><Globe className="w-3.5 h-3.5" /> since {relativeTime(session.createdAt, now)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge tone={RISK_TONE[risk.level]}>
            {risk.level === 'normal' ? <CircleCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />} {RISK_LABEL[risk.level]}
          </StatusBadge>
          {onRevoke && (
            <ConfirmAction variant="secondary" size="sm" onConfirm={onRevoke} confirmLabel="Confirm">
              <Trash2 className="w-3.5 h-3.5" /> Revoke
            </ConfirmAction>
          )}
        </div>
      </div>
      {/* Why this risk */}
      <button onClick={() => setShowWhy((v) => !v)} className="mt-2 text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded px-1">
        <Info className="w-3 h-3" /> {showWhy ? 'Hide' : 'Why this rating?'}
      </button>
      <AnimatePresence>
        {showWhy && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-1 space-y-1 pl-1">
            {risk.reasons.map((r, i) => (
              <li key={i} className="text-[12px] text-fg-muted flex items-start gap-1.5"><span className={`mt-0.5 ${risk.level === 'normal' ? 'text-semantic-success' : 'text-semantic-warning'}`}>•</span> {r}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function SessionPolicyPanel() {
  const { sessionPolicy, updateSessionPolicy } = useStore();
  const toast = useToast();
  const [idle, setIdle] = useState(sessionPolicy.idleTimeoutMins);
  const [maxc, setMaxc] = useState(sessionPolicy.maxConcurrent);
  const dirty = idle !== sessionPolicy.idleTimeoutMins || maxc !== sessionPolicy.maxConcurrent;

  const save = () => {
    updateSessionPolicy({ idleTimeoutMins: idle, maxConcurrent: maxc });
    // TODO(F-310 telemetry): track('session_policy_updated', { idleTimeoutMins: idle, maxConcurrent: maxc });
    toast.success('Session policy updated', `Idle timeout ${idle}m · max ${maxc} concurrent sessions.`);
  };

  return (
    <GlassCard className="p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="w-4 h-4 text-teal" />
        <span className="text-sm font-semibold text-fg">Session policy</span>
        <StatusBadge tone="neutral">Admin</StatusBadge>
      </div>
      <p className="text-[12px] text-fg-subtle mb-4">Sessions idle past the timeout are flagged stale and targeted by &ldquo;revoke all stale&rdquo;. The concurrency cap warns when exceeded.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2"><label htmlFor="idle" className="text-[12px] font-medium text-fg">Idle timeout</label><span className="text-xs font-mono tabular-nums text-fg-muted">{idle} min</span></div>
          <input id="idle" type="range" min={5} max={480} step={5} value={idle} onChange={(e) => setIdle(Number(e.target.value))} className="w-full accent-teal" />
          <div className="flex justify-between text-[10px] text-fg-subtle mt-1"><span>5m</span><span>8h</span></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><label htmlFor="maxc" className="text-[12px] font-medium text-fg">Max concurrent sessions</label><span className="text-xs font-mono tabular-nums text-fg-muted">{maxc}</span></div>
          <input id="maxc" type="range" min={1} max={20} step={1} value={maxc} onChange={(e) => setMaxc(Number(e.target.value))} className="w-full accent-teal" />
          <div className="flex justify-between text-[10px] text-fg-subtle mt-1"><span>1</span><span>20</span></div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty}>Save policy</Button>
      </div>
    </GlassCard>
  );
}

function SessionsSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[40rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-20 rounded-2xl mt-6" />
      <div className="space-y-3 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <SessionsInner />
    </RoleGuard>
  );
}
