'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowRight, Fingerprint, Lock } from 'lucide-react';
import { useStore, ROLE_LABEL, ROLE_BLURB } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { Button, GlassCard } from '@/components/admin/ui';
import { CONSOLE_BASE_URL } from '@/lib/admin/config';
import type { AdminRole } from '@/lib/admin/types';

const ROLES: AdminRole[] = ['superadmin', 'ops', 'sales', 'finance'];
const OPERATORS: Record<AdminRole, { email: string; name: string }> = {
  superadmin: { email: 'dev7@zintlr.com', name: 'Dev Malhotra' },
  ops: { email: 'sofia.reyes@zintlr.com', name: 'Sofia Reyes' },
  sales: { email: 'ananya.iyer@zintlr.com', name: 'Ananya Iyer' },
  finance: { email: 'marcus.lee@zintlr.com', name: 'Marcus Lee' },
};

export default function LoginPage() {
  const router = useRouter();
  const signIn = useStore((s) => s.signIn);
  const [role, setRole] = useState<AdminRole>('ops');
  const [step, setStep] = useState<'idle' | 'sso' | 'mfa'>('idle');

  const go = async () => {
    setStep('sso');
    await new Promise((r) => setTimeout(r, 700));
    setStep('mfa');
    await new Promise((r) => setTimeout(r, 600));
    const op = OPERATORS[role];
    signIn(op.email, op.name, role);
    track('admin_signed_in', { role });
    router.replace('/admin/overview');
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 theme-grid">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[520px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-teal font-black tracking-tight text-lg"><ShieldCheck className="w-5 h-5" /> Zinbit Admin</div>
          <h1 className="text-2xl font-black text-fg mt-2">Zintlr internal sign-in</h1>
          <p className="text-sm text-fg-muted mt-1">Separate from the customer console. SSO + MFA required; your role comes from your SSO group.</p>
        </div>
        <GlassCard className="p-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Sign in as</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {ROLES.map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} className={`text-left rounded-xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${role === r ? 'border-teal/40 bg-teal/10' : 'border-border bg-surface hover:border-teal/30'}`}>
                <div className="text-[12px] font-bold text-fg">{ROLE_LABEL[r]}</div>
                <div className="text-[11px] text-fg-muted">{OPERATORS[r].name} · {OPERATORS[r].email}</div>
                <div className="text-[10px] text-fg-subtle mt-1">{ROLE_BLURB[r]}</div>
              </button>
            ))}
          </div>
          <Button onClick={go} loading={step !== 'idle'} className="w-full" icon={<Fingerprint className="w-4 h-4" />}>
            {step === 'idle' ? 'Continue with Zintlr SSO' : step === 'sso' ? 'Redirecting to SSO…' : 'Verifying MFA…'}
          </Button>
          <p className="text-[10px] text-fg-subtle mt-3 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Every action you take here is audit-logged with your identity and a reason.</p>
          <p className="text-[10px] text-fg-subtle mt-1">Prototype: the role picker stands in for SSO group membership.</p>
        </GlassCard>
        <p className="text-center text-[11px] text-fg-muted mt-4 inline-flex items-center gap-1 w-full justify-center">Looking for the customer console? <a className="text-teal hover:underline font-bold inline-flex items-center gap-0.5" href={CONSOLE_BASE_URL}>Open it <ArrowRight className="w-3 h-3" /></a></p>
      </motion.div>
    </main>
  );
}
