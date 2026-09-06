'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, Lock, Unlock, Ban, Timer, UserX, Zap, ArrowRight, Sparkles,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, StatusBadge, ConfirmAction, type BadgeTone } from '@/components/ui';
import {
  useLoginGuard, isLocked, lockRemainingMs, attemptsRemaining, MAX_FAILED_ATTEMPTS, LOCK_DURATIONS_MS, type LoginGuardEntry,
} from '@/lib/brute-force';

function fmtDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 60) return `${s}s ago`; const m = Math.round(s / 60); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };

function AccountRow({ e, onUnlock }: { e: LoginGuardEntry; onUnlock: (email: string) => void }) {
  const locked = isLocked(e, Date.now());
  const fails = e.history.filter(h => !h.ok).length;
  const tone: BadgeTone = locked ? 'error' : e.failedCount > 0 ? 'warning' : 'success';
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${locked ? 'border-semantic-error/30 bg-semantic-error/5' : 'border-border bg-surface-2'}`}>
      <span className={locked ? 'text-semantic-error' : e.failedCount > 0 ? 'text-semantic-warning' : 'text-semantic-success'}>
        {locked ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg truncate">{e.email}</div>
        <div className="text-[11px] text-fg-subtle mt-0.5">{fails} failed · last {ago(e.lastAttemptAt)}{e.lockLevel > 0 ? ` · lock ×${e.lockLevel}` : ''}</div>
      </div>
      {locked
        ? <StatusBadge tone="error"><Timer className="w-3 h-3" /> {fmtDuration(lockRemainingMs(e, Date.now()))}</StatusBadge>
        : <StatusBadge tone={tone}>{attemptsRemaining(e)} left</StatusBadge>}
      {locked && (
        <ConfirmAction variant="ghost" size="sm" confirmLabel={<><Unlock className="w-3.5 h-3.5" /> Confirm</>} onConfirm={() => onUnlock(e.email)}>
          <Unlock className="w-3.5 h-3.5" /> Unlock
        </ConfirmAction>
      )}
    </div>
  );
}

function LoginSecurityInner() {
  const environment = useStore((s) => s.environment);
  const guards = useLoginGuard((s) => s.guards);
  const seedGuards = useLoginGuard((s) => s.seedGuards);
  const recordFailure = useLoginGuard((s) => s.recordFailure);
  const recordSuccess = useLoginGuard((s) => s.recordSuccess);
  const unlockAccount = useLoginGuard((s) => s.unlockAccount);
  const toast = useToast();

  const [simEmail, setSimEmail] = useState('demo@example.com');
  const [, setTick] = useState(0);

  useEffect(() => { seedGuards(); track('login_security_viewed', { environment }); }, [seedGuards, environment]);
  // Keep countdowns live.
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);

  const entries = useMemo(() => Object.values(guards).sort((a, b) => b.lastAttemptAt - a.lastAttemptAt), [guards]);
  const lockedCount = entries.filter(e => isLocked(e, Date.now())).length;
  const totalFails = entries.reduce((n, e) => n + e.history.filter(h => !h.ok).length, 0);

  const simulate = () => {
    const email = simEmail.trim().toLowerCase();
    if (!email) return;
    const next = recordFailure(email, 'simulation');
    const locked = isLocked(next, Date.now());
    track('login_lockout_simulated', { locked, lockLevel: next.lockLevel, environment });
    if (locked) toast.error('Account locked', `${email} hit the limit — locked for ${fmtDuration(lockRemainingMs(next, Date.now()))}.`);
    else toast.info('Failed attempt recorded', `${attemptsRemaining(next)} attempt(s) left before lockout.`);
  };
  const simulateSuccess = () => { const email = simEmail.trim().toLowerCase(); if (email) { recordSuccess(email, 'simulation'); toast.success('Sign-in succeeded', 'Counter cleared for this account.'); } };
  const onUnlock = (email: string) => { unlockAccount(email); track('login_guard_unlocked', { environment }); toast.success('Account unlocked', `${email} can sign in again.`); };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<ShieldAlert />}
        title="Login Security"
        description="Brute-force protection for account sign-in: after too many failed attempts an account is locked with a cooldown that grows on each repeat, so credential-stuffing is throttled while a legitimate mistake just waits. Watch lockouts here, and unlock a false alarm."
        actions={<Link href="/console/security"><Button variant="secondary" size="sm"><ShieldCheck className="w-4 h-4" /> Security Hub</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Locked accounts" value={lockedCount} icon={<Lock />} hint={lockedCount > 0 ? 'cooling down' : 'all clear'} />
        <KpiTile label="Accounts tracked" value={entries.length} icon={<UserX />} />
        <KpiTile label="Failed attempts" value={totalFails} icon={<Ban />} />
        <KpiTile label="Lock threshold" value={MAX_FAILED_ATTEMPTS} icon={<ShieldAlert />} hint="consecutive fails" />
      </div>

      {/* Policy + simulator */}
      <div className="grid lg:grid-cols-2 gap-4 mt-5">
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Lockout policy</div>
          <p className="text-[12px] text-fg-muted leading-relaxed">
            After <span className="font-bold text-fg">{MAX_FAILED_ATTEMPTS}</span> consecutive failed sign-ins, the account locks. Each repeat lock cycle escalates the cooldown:
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {LOCK_DURATIONS_MS.map((ms, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <StatusBadge tone={i === 0 ? 'info' : i === LOCK_DURATIONS_MS.length - 1 ? 'error' : 'warning'}>×{i + 1}: {fmtDuration(ms)}</StatusBadge>
                {i < LOCK_DURATIONS_MS.length - 1 && <ArrowRight className="w-3 h-3 text-fg-subtle" />}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1"><Sparkles className="w-3 h-3" /> A successful sign-in resets the counter and clears the lock.</p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1"><Zap className="w-3 h-3 text-teal" /> Simulate</div>
          <Input value={simEmail} onChange={(e) => setSimEmail(e.target.value)} placeholder="email to test" autoComplete="off" />
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="ghost" className="text-semantic-error" onClick={simulate}><Ban className="w-4 h-4" /> Failed attempt</Button>
            <Button size="sm" variant="ghost" className="text-semantic-success" onClick={simulateSuccess}><ShieldCheck className="w-4 h-4" /> Successful</Button>
          </div>
          {(() => { const g = guards[simEmail.trim().toLowerCase()]; if (!g) return <p className="text-[11px] text-fg-subtle mt-3">No attempts recorded for this email yet.</p>;
            const locked = isLocked(g, Date.now());
            return <div className="mt-3 text-[12px]"><StatusBadge tone={locked ? 'error' : g.failedCount > 0 ? 'warning' : 'success'}>{locked ? `locked ${fmtDuration(lockRemainingMs(g, Date.now()))}` : `${attemptsRemaining(g)} attempts left`}</StatusBadge></div>;
          })()}
        </GlassCard>
      </div>

      {/* Accounts */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg">Tracked accounts</h3>
        {lockedCount > 0 && <StatusBadge tone="error">{lockedCount} locked</StatusBadge>}
      </div>
      {entries.length === 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No failed sign-ins" description="Accounts with failed login attempts appear here. Use the simulator to see a lockout in action." />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.div key={e.email} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AccountRow e={e} onUnlock={onUnlock} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-6">
        <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security Hub <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function LoginSecurityPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <LoginSecurityInner />
    </RoleGuard>
  );
}
