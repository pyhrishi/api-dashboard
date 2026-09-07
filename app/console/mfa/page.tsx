'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, Smartphone, KeyRound, QrCode, Check, Lock, Users, Copy, RefreshCw, ArrowRight, Sparkles,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, EmptyState, StatusBadge, SegmentedControl, ConfirmAction, type BadgeTone } from '@/components/ui';
import {
  useMfaPolicy, totpSecret, recoveryCodes, orgCompliance, memberCompliant, enrollmentRequired, isEnforced, inGracePeriod, type MfaPolicy,
} from '@/lib/mfa';

function MfaInner() {
  const { teamMembers, user, is2faEnabled, enable2fa, environment } = useStore();
  const { policy, graceUntil, enrollments, setPolicy, enroll, unenroll, regenerateRecovery, seedEnrollments } = useMfaPolicy();
  const toast = useToast();

  const isAdmin = user?.role === 'admin';
  const selfEmail = user?.email ?? 'you@zinbit.zintlr.com';
  const self = useMemo(() => ({ email: selfEmail, is2faEnabled }), [selfEmail, is2faEnabled]);

  const memberEmails = useMemo(() => {
    const set = new Set<string>(teamMembers.map((m) => m.email.toLowerCase()));
    set.add(selfEmail.toLowerCase());
    return Array.from(set);
  }, [teamMembers, selfEmail]);

  useEffect(() => { seedEnrollments(teamMembers.map((m) => m.email)); track('mfa_viewed', { environment }); }, [seedEnrollments, teamMembers, environment]);

  const compliance = useMemo(() => orgCompliance(memberEmails, enrollments, self), [memberEmails, enrollments, self]);
  const selfCompliant = memberCompliant(selfEmail, enrollments, self);
  const gated = enrollmentRequired(policy, self, enrollments, graceUntil, Date.now());

  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const secret = useMemo(() => totpSecret(selfEmail), [selfEmail]);
  const codes = useMemo(() => recoveryCodes(selfEmail), [selfEmail]);

  const copy = (text: string, tag: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1200); }).catch(() => {}); };

  const doEnroll = () => {
    enroll(selfEmail);
    enable2fa(); // keep the legacy personal flag in sync
    track('mfa_enrolled', { environment });
    toast.success('MFA enabled', 'Your account is now protected with an authenticator app.');
    setShowSecret(false);
  };
  const setOrgPolicy = (p: MfaPolicy) => {
    setPolicy(p, p === 'required' ? 7 : undefined);
    track('mfa_policy_changed', { policy: p, environment });
    toast.success('Policy updated', p === 'required' ? 'MFA is now required org-wide (7-day grace).' : 'MFA is now optional.');
  };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<ShieldCheck />}
        title="MFA Enforcement"
        description="Require multi-factor authentication for everyone in your organization. Members enroll an authenticator app; those who haven’t are prompted to before they can use the console — hardening every account, not just the security-minded ones."
        actions={<Link href="/console/settings/security"><Button variant="secondary" size="sm"><KeyRound className="w-4 h-4" /> Security settings</Button></Link>}
      />

      {/* Enforcement gate — shown when the org requires MFA and you haven't enrolled. */}
      <AnimatePresence>
        {gated && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
            <GlassCard className="p-5 border-semantic-error/40 bg-semantic-error/5">
              <div className="flex items-center gap-3">
                <span className="text-semantic-error shrink-0"><ShieldAlert className="w-6 h-6" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-fg">Your organization requires MFA</h3>
                  <p className="text-[12px] text-fg-muted mt-0.5">Enroll an authenticator app below to keep access to the console.</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Policy" value={isEnforced(policy) ? 'Required' : 'Optional'} icon={<Lock />} hint={inGracePeriod(graceUntil, Date.now()) ? 'grace active' : undefined} />
        <KpiTile label="Compliance" value={`${compliance.pct}%`} icon={<ShieldCheck />} hint={`${compliance.compliant}/${compliance.total}`} />
        <KpiTile label="Not enrolled" value={compliance.nonCompliant} icon={<ShieldAlert />} />
        <KpiTile label="Your MFA" value={selfCompliant ? 'On' : 'Off'} icon={<Smartphone />} />
      </div>

      {/* Admin policy control */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-fg">Organization policy</h3>
            <p className="text-[12px] text-fg-muted mt-0.5">Require MFA applies a 7-day grace period, then gates any member who hasn’t enrolled.</p>
          </div>
          {isAdmin ? (
            <SegmentedControl
              options={[{ label: 'Optional', value: 'optional' }, { label: 'Required', value: 'required' }]}
              value={policy}
              onChange={(v) => setOrgPolicy(v as MfaPolicy)}
            />
          ) : (
            <StatusBadge tone={isEnforced(policy) ? 'error' : 'info'}>{isEnforced(policy) ? 'Required' : 'Optional'}</StatusBadge>
          )}
        </div>
        {!isAdmin && <p className="text-[11px] text-fg-subtle mt-2">Only an admin can change the org MFA policy.</p>}
      </GlassCard>

      {/* Self enrollment */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-teal" />
          <h3 className="text-sm font-bold text-fg">Your authenticator</h3>
          {selfCompliant && <StatusBadge tone="success"><Check className="w-3 h-3" /> Enrolled</StatusBadge>}
        </div>
        {selfCompliant ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[12px] text-fg-muted min-w-0 flex-1">Your account is protected with a time-based one-time password (TOTP).</p>
            <Button size="sm" variant="ghost" onClick={() => { regenerateRecovery(selfEmail); toast.success('Recovery codes regenerated', 'Store the new codes safely.'); }}><RefreshCw className="w-4 h-4" /> Regenerate recovery codes</Button>
            <ConfirmAction variant="ghost" size="sm" confirmLabel="Confirm disable" onConfirm={() => { unenroll(selfEmail); toast.info('MFA disabled', 'Re-enroll any time.'); }}>Disable</ConfirmAction>
          </div>
        ) : (
          <div className="space-y-4">
            {!showSecret ? (
              <Button onClick={() => setShowSecret(true)}><QrCode className="w-4 h-4" /> Set up authenticator</Button>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">1. Add this secret to your authenticator app</div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm text-fg bg-surface px-3 py-1.5 rounded-lg border border-border tracking-widest">{secret}</code>
                    <button onClick={() => copy(secret.replace(/\s/g, ''), 'secret')} className="text-fg-subtle hover:text-teal transition-colors">{copied === 'secret' ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}</button>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">2. Save your recovery codes</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {codes.map((c) => <code key={c} className="font-mono text-[11px] text-fg-muted bg-surface px-2 py-1 rounded border border-border-subtle text-center">{c}</code>)}
                  </div>
                </div>
                <Button onClick={doEnroll}><Check className="w-4 h-4" /> I’ve set it up — enable MFA</Button>
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* Compliance roster */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Users className="w-4 h-4" /> Member compliance</h3>
        <StatusBadge tone={compliance.nonCompliant === 0 ? 'success' : 'warning'}>{compliance.compliant}/{compliance.total} enrolled</StatusBadge>
      </div>
      {memberEmails.length === 0 ? (
        <GlassCard className="p-0 overflow-hidden"><EmptyState icon={<Users className="w-8 h-8" />} title="No members" description="Invite your team from Settings to track MFA compliance." /></GlassCard>
      ) : (
        <div className="space-y-2">
          {memberEmails.map((email) => {
            const ok = memberCompliant(email, enrollments, self);
            const isSelf = email === selfEmail.toLowerCase();
            const tone: BadgeTone = ok ? 'success' : 'warning';
            return (
              <div key={email} className={`rounded-xl border px-4 py-2.5 flex items-center gap-3 ${ok ? 'border-border bg-surface-2' : 'border-semantic-warning/30 bg-semantic-warning/5'}`}>
                <span className={ok ? 'text-semantic-success' : 'text-semantic-warning'}>{ok ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{email}{isSelf && <span className="text-fg-subtle"> (you)</span>}</span>
                <StatusBadge tone={tone}>{ok ? 'Enrolled' : 'Not enrolled'}</StatusBadge>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> When the policy is Required, members who aren’t enrolled see an enrollment gate across the console after the grace period.</p>
      <div className="mt-3">
        <Link href="/console/login-security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Login security <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <MfaInner />
    </RoleGuard>
  );
}
