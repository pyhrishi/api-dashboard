'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, Zap, Lock, ArrowRight, Sparkles, Play, RefreshCw, Check, ShieldCheck, CreditCard } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, Skeleton } from '@/components/ui';
import { isPublicApi } from '@/lib/trial-credits';

interface Ledger { free: number; paid: number; granted: number; freeUsedPct: number; }

// A couple of representative endpoints for the live free-vs-paid demonstration.
const PUBLIC_PROBE = { path: '/v1/people', label: 'People enrich (Public)', qs: '?email=jane@acme.com' };
const PREMIUM_PROBE = { path: '/v1/export', label: 'Bulk export (premium)', qs: '?entity=companies&preview=1' };
const ELIGIBILITY = ['/v1/people', '/v1/companies/enrich', '/v1/email/verify', '/v1/identity/resolve', '/v1/people/search/ai', '/v1/export', '/v1/batch/enrich', '/v1/enrich/stream'];

function TrialCreditsInner() {
  const { activeKeys } = useStore();
  const toast = useToast();
  const liveKey = useMemo(() => activeKeys.find((k) => k.key.startsWith('sk_live_'))?.key ?? 'sk_live_trial_demo', [activeKeys]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [lastCharge, setLastCharge] = useState<{ label: string; bucket: string; freeRemaining: string } | null>(null);
  const [firing, setFiring] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/credits', { headers: { Authorization: authHeaderValue(liveKey) }, cache: 'no-store' });
      const body = await res.json();
      setLedger(body.data as Ledger);
      setPhase('ready');
    } catch { setPhase('error'); }
  }, [liveKey]);

  useEffect(() => { track('trial_credits_viewed', {}); load(); }, [load]);

  const fire = useCallback(async (probe: typeof PUBLIC_PROBE, kind: 'public' | 'premium') => {
    setFiring(kind);
    try {
      const res = await fetch(`/api${probe.path}${probe.qs}`, { headers: { Authorization: authHeaderValue(liveKey) } });
      const bucket = res.headers.get('X-Credits-Bucket') ?? (res.status === 402 ? 'declined' : '—');
      const freeRemaining = res.headers.get('X-Free-Credits-Remaining') ?? '—';
      setLastCharge({ label: probe.label, bucket, freeRemaining });
      track('trial_credits_probe_fired', { kind, bucket, status: res.status });
      if (res.status === 402) toast.info('Charge declined', 'Premium endpoints need a paid balance.');
      else toast.success('Call billed', `Charged to your ${bucket} balance.`);
      await load();
    } finally { setFiring(null); }
  }, [liveKey, load, toast]);

  return (
    <div className="max-w-[1000px] mx-auto pb-16">
      <PageHeader
        icon={<Wallet />}
        title="Trial & Credits"
        description="Your trial gives you free credits for Public APIs, spent before any paid balance. Premium endpoints (bulk, streaming, export, AI search) draw on your paid balance. This is the live ledger the gateway bills against."
        actions={<Link href="/console/activate"><StatusBadge tone="info"><Sparkles className="w-3.5 h-3.5" /> Activation</StatusBadge></Link>}
      />

      {phase === 'loading' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}</div>
      ) : phase === 'error' || !ledger ? (
        <GlassCard className="p-5 mt-6"><p className="text-sm text-fg-muted">Couldn’t reach the credit ledger. <button onClick={load} className="text-teal font-bold">Retry</button></p></GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            <KpiTile label="Free trial credits" value={ledger.free.toLocaleString()} icon={<Zap />} hint="Public APIs only" />
            <KpiTile label="Paid balance" value={ledger.paid.toLocaleString()} icon={<CreditCard />} hint="any endpoint" />
            <KpiTile label="Free trial used" value={`${ledger.freeUsedPct}%`} icon={<ShieldCheck />} hint={`of ${ledger.granted.toLocaleString()}`} />
          </div>

          {/* Rules */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">How trial credits are spent</h3></div>
            <ul className="text-[13px] text-fg-muted space-y-1.5">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-semantic-success shrink-0" /> Free credits apply to <span className="font-semibold text-fg">Public APIs only</span> — premium endpoints need a paid balance.</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-semantic-success shrink-0" /> Free credits are <span className="font-semibold text-fg">consumed before</span> any paid balance.</li>
            </ul>
          </GlassCard>

          {/* Live demonstration */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-1"><Play className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">See it live</h3></div>
            <p className="text-[12px] text-fg-muted mb-3">Fire a real call against the gateway and watch which bucket it draws from.</p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => fire(PUBLIC_PROBE, 'public')} disabled={firing !== null}>
                {firing === 'public' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Fire a Public call
              </Button>
              <Button variant="secondary" size="sm" onClick={() => fire(PREMIUM_PROBE, 'premium')} disabled={firing !== null}>
                {firing === 'premium' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Fire a premium call
              </Button>
            </div>
            {lastCharge && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3 text-[12px]">
                <span className="text-fg-muted">{lastCharge.label} →</span>{' '}
                <StatusBadge tone={lastCharge.bucket === 'declined' ? 'error' : lastCharge.bucket === 'paid' ? 'warning' : 'success'}>{lastCharge.bucket} balance</StatusBadge>{' '}
                <span className="text-fg-subtle">· free remaining: {lastCharge.freeRemaining}</span>
              </motion.div>
            )}
          </GlassCard>

          {/* Eligibility */}
          <GlassCard className="p-5 mt-5">
            <h3 className="text-sm font-bold text-fg mb-3">What your free credits cover</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ELIGIBILITY.map((p) => {
                const pub = isPublicApi(p);
                return (
                  <div key={p} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2">
                    <span className={pub ? 'text-semantic-success' : 'text-fg-subtle'}>{pub ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</span>
                    <code className="font-mono text-[11px] text-fg-muted flex-1 truncate">{p}</code>
                    <StatusBadge tone={pub ? 'success' : 'info'}>{pub ? 'Free-eligible' : 'Paid only'}</StatusBadge>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <div className="mt-4 flex items-center gap-4">
            <Link href="/console/explorer" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Explorer <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/billing" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Billing <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/funnel" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Funnel <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function TrialCreditsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <TrialCreditsInner />
    </RoleGuard>
  );
}
