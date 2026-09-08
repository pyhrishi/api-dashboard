'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, ShieldCheck, RefreshCw, FlaskConical, Lock, Unlock, Check, X, AlertTriangle, ArrowRight, Users, Activity,
  MessageSquare, MessageCircle, PhoneCall, Plus, ScrollText, Search, Sparkles, UserCheck, Ban,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, DataTable, ConfirmAction, Select, Input,
  type Column, type BadgeTone,
} from '@/components/ui';
import {
  RISK_CONDITIONS, SIGNUP_PERSONAS, POLICY_BOUNDS, conditionSpec,
  type TrialGatePolicy, type TrialRiskEvaluation, type RiskCondition, type ConditionResult,
} from '@/lib/auth/trial-gate';
import { COUNTRIES, CHANNEL_LABEL, CHANNEL_ORDER, type OtpChannel, type LineType } from '@/lib/auth/phone-otp';
import type { PhoneChallenge, TrialGateEvent, TrialGateStats, ChallengeState } from '@/lib/auth/trial-gate-service';

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const STATE_TONE: Record<ChallengeState, BadgeTone> = { pending: 'warning', verified: 'success', locked: 'error', abandoned: 'neutral', overridden: 'error' };
const LINE_TONE: Record<LineType, BadgeTone> = { mobile: 'success', landline: 'warning', voip: 'error', fictional: 'error', temp_provider: 'error' };
const CHANNEL_ICON: Record<OtpChannel, React.ReactNode> = { sms: <MessageSquare className="w-3.5 h-3.5" />, whatsapp: <MessageCircle className="w-3.5 h-3.5" />, voice: <PhoneCall className="w-3.5 h-3.5" /> };

type Load<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string };
interface Snapshot { stats: TrialGateStats; challenges: PhoneChallenge[]; events: TrialGateEvent[]; policy: TrialGatePolicy; directory: number }

const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/api/auth/${path}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
};
const post = (path: string, body: unknown, method = 'POST') => fetch(`/api/auth/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ago = (ts: number) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

function TrialGateInner() {
  const user = useStore((s) => s.user);
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [snap, setSnap] = useState<Load<Snapshot>>({ status: 'loading' });

  useEffect(() => {
    track('trial_gate_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 240);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [stats, challenges, events, policy, directory] = await Promise.all([
        get<TrialGateStats>('stats'), get<PhoneChallenge[]>('challenges'), get<TrialGateEvent[]>('events?limit=40'), get<TrialGatePolicy>('policy/zinbit'), get<unknown[]>('directory'),
      ]);
      setSnap({ status: 'ok', data: { stats, challenges, events, policy, directory: directory.length } });
    } catch (e) {
      setSnap({ status: 'error', message: e instanceof Error ? e.message : 'Could not reach the auth service.' });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Live: the ledger and event feed refresh every 6 s while the page is open (the badge says so).
  useEffect(() => { const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  // ── Simulator ──
  const [sim, setSim] = useState({ email: SIGNUP_PERSONAS[0].profile.email, company: SIGNUP_PERSONAS[0].profile.company, ip: SIGNUP_PERSONAS[0].profile.ip, referralCode: '' });
  const [simResult, setSimResult] = useState<Load<TrialRiskEvaluation> | null>(null);
  const runSim = useCallback(async (override?: typeof sim) => {
    const p = override ?? sim;
    setSimResult({ status: 'loading' });
    try {
      const res = await post('trial/evaluate', { accountId: `sim_${p.email.toLowerCase()}`, email: p.email, company: p.company, ip: p.ip, referralCode: p.referralCode || undefined, productId: 'zinbit', simulate: true });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data?.evaluation) { setSimResult({ status: 'error', message: body?.error?.message ?? `HTTP ${res.status}` }); return; }
      const ev = body.data.evaluation as TrialRiskEvaluation;
      setSimResult({ status: 'ok', data: ev });
      track('trial_gate_simulated', { decision: ev.decision, tripped: ev.tripped.join(',') || null });
    } catch { setSimResult({ status: 'error', message: 'Could not reach the auth service.' }); }
  }, [sim]);
  const pickPersona = (id: string) => {
    const p = SIGNUP_PERSONAS.find((x) => x.id === id);
    if (!p) return;
    const next = { email: p.profile.email, company: p.profile.company, ip: p.profile.ip, referralCode: p.profile.referralCode ?? '' };
    setSim(next);
    runSim(next);
  };

  // ── Number checker ──
  const [chk, setChk] = useState({ phone: '', country: 'IN' });
  const [chkResult, setChkResult] = useState<{ e164: string | null; lineType: LineType | null; reason: string | null } | null>(null);
  useEffect(() => {
    if (!chk.phone.trim()) { setChkResult(null); return; }
    const t = setTimeout(() => {
      post('phone/inspect', chk).then((r) => r.json()).then((b) => {
        const d = b?.data as { normalized: { e164: string } | null; lineType: LineType | null; reason: string | null } | undefined;
        setChkResult(d ? { e164: d.normalized?.e164 ?? null, lineType: d.lineType, reason: d.reason } : null);
      }).catch(() => setChkResult(null));
    }, 300);
    return () => clearTimeout(t);
  }, [chk]);

  // ── Policy ──
  const [policySync, setPolicySync] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [isoDraft, setIsoDraft] = useState('');
  const [egressDraft, setEgressDraft] = useState('');
  const patchPolicy = useCallback(async (patch: Record<string, unknown>, field: string) => {
    setPolicySync('syncing');
    try {
      const res = await post('policy/zinbit', patch, 'PATCH');
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data?.policy) { setPolicySync('error'); return; }
      setIgnored(body.data.ignored as string[]);
      setSnap((s) => (s.status === 'ok' ? { status: 'ok', data: { ...s.data, policy: body.data.policy as TrialGatePolicy } } : s));
      setPolicySync('ok');
      track('trial_gate_policy_updated', { field });
      if ((body.data.ignored as string[]).length) toast.info('Some changes were not applied', (body.data.ignored as string[]).join(', '));
    } catch { setPolicySync('error'); }
  }, [toast]);

  // ── Overrides ──
  const [overrideFor, setOverrideFor] = useState<PhoneChallenge | null>(null);
  const [reason, setReason] = useState('');
  const [overriding, setOverriding] = useState<'allow' | 'deny' | null>(null);
  const doOverride = useCallback(async (action: 'allow' | 'deny') => {
    if (!overrideFor || overriding) return;
    setOverriding(action);
    try {
    const res = await post('phone/override', { accountId: overrideFor.accountId, action, reason, actorId: user?.email ?? 'support' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { toast.error('Override not applied', body?.error?.message ?? `HTTP ${res.status}`); return; }
    track('otp_override', { action, conditions: overrideFor.conditions.join(',') });
    toast.success(action === 'allow' ? 'Challenge waived — trial activated' : 'Account denied', `Reason recorded: “${reason.trim()}”.`);
    setOverrideFor(null); setReason('');
    load();
    } finally { setOverriding(null); }
  }, [overrideFor, overriding, reason, user?.email, toast, load]);

  const policy = snap.status === 'ok' ? snap.data.policy : null;
  const stats = snap.status === 'ok' ? snap.data.stats : null;

  const conditionColumns: Column<ConditionResult>[] = [
    { key: 'code', header: 'Condition', render: (c) => <div className="min-w-0"><div className="text-[12px] font-bold text-fg"><span className="font-mono text-fg-muted mr-1.5">{c.code}</span>{c.label}</div></div> },
    { key: 'evidence', header: 'Evidence', render: (c) => <span className="text-[11px] text-fg-muted">{c.evidence}</span> },
    { key: 'result', header: 'Result', align: 'right', render: (c) => !c.enabled ? <StatusBadge tone="neutral">disabled</StatusBadge> : c.tripped ? <StatusBadge tone="warning">flagged</StatusBadge> : <StatusBadge tone="success">ok</StatusBadge> },
  ];

  const challengeColumns: Column<PhoneChallenge>[] = [
    { key: 'account', header: 'Account', render: (c) => <div className="min-w-0"><div className="font-mono text-[11px] text-fg truncate">{c.accountId}</div><div className="text-[10px] text-fg-muted">{ago(c.createdAt)} · {c.productId}</div></div> },
    { key: 'conditions', header: 'Flagged for', render: (c) => <div className="flex flex-wrap gap-1">{c.conditions.length ? c.conditions.map((id) => <span key={id} className="text-[10px] font-mono text-fg-muted rounded border border-border px-1">{conditionSpec(id as RiskCondition).code}</span>) : <span className="text-[10px] text-fg-muted">—</span>}</div> },
    { key: 'phone', header: 'Number', className: 'hidden md:table-cell', render: (c) => c.phoneMasked ? <div className="flex items-center gap-1.5 flex-wrap"><span className="font-mono text-[11px] text-fg">{c.phoneMasked}</span>{c.lineType && <StatusBadge tone={LINE_TONE[c.lineType]}>{c.lineType.replace('_', ' ')}</StatusBadge>}</div> : <span className="text-[11px] text-fg-muted">not entered</span> },
    { key: 'delivery', header: 'Sends', className: 'hidden lg:table-cell', render: (c) => <div className="flex items-center gap-1 flex-wrap">{c.sends.map((s) => <span key={s.id} title={`${CHANNEL_LABEL[s.channel]} · ${s.deliveryStatus}${s.deliveryReason ? ` · ${s.deliveryReason}` : ''}`} className={`inline-flex items-center gap-0.5 text-[10px] rounded px-1 border ${s.deliveryStatus === 'failed' ? 'border-semantic-error/30 text-semantic-error' : 'border-border text-fg-muted'}`}>{CHANNEL_ICON[s.channel]}{s.fallbackFrom ? '↳' : ''}<span className="sr-only">{CHANNEL_LABEL[s.channel]} {s.deliveryStatus}{s.fallbackFrom ? ` (fallback from ${CHANNEL_LABEL[s.fallbackFrom]})` : ''}</span></span>)}{c.sends.length === 0 && <span className="text-[10px] text-fg-muted">—</span>}</div> },
    { key: 'state', header: 'State', align: 'right', render: (c) => <StatusBadge tone={STATE_TONE[c.state]}>{c.state}{c.overrideId ? ' · override' : ''}</StatusBadge> },
    { key: 'actions', header: '', align: 'right', render: (c) => c.state === 'pending' || c.state === 'locked' || c.state === 'abandoned' ? <Button size="sm" variant="ghost" onClick={() => { setOverrideFor(c); setReason(''); }} icon={<UserCheck className="w-3.5 h-3.5" />}>Override</Button> : null },
  ];

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Smartphone />}
        title="Trial Gate"
        description="Sign-up never asks for a phone. At trial activation the shared auth service checks six risk conditions and asks for a phone OTP only when one trips. Tune the policy, simulate a sign-up, and review every challenge here."
        actions={<Button variant="secondary" size="sm" onClick={load} loading={snap.status === 'loading' && phase === 'ready'} icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>}
      />

      {phase === 'loading' ? (
        <div className="mt-6" aria-busy="true" aria-label="Loading trial gate">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading label="Activations evaluated" value="" icon={<Activity />} />
            <KpiTile loading label="Challenged" value="" icon={<Smartphone />} />
            <KpiTile loading label="Verified" value="" icon={<ShieldCheck />} />
            <KpiTile loading label="Numbers rejected" value="" icon={<Ban />} />
          </div>
          {['h-[380px]', 'h-[240px]', 'h-[460px]', 'h-[360px]', 'h-[300px]'].map((h, i) => <Skeleton key={i} variant="block" className={`${h} mt-5`} />)}
        </div>
      ) : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={snap.status === 'loading'} label="Activations evaluated" value={stats ? stats.evaluations : '—'} icon={<Activity />} hint={stats ? `${stats.allowed} allowed · ${stats.exempt} exempt · since the service started` : snap.status === 'error' ? 'auth service unavailable' : 'reading the auth service'} />
            <KpiTile loading={snap.status === 'loading'} label="Challenged" value={stats ? `${stats.challengeRate}%` : '—'} icon={<Smartphone />} hint={stats ? `${stats.challenged} phone checks · target < 25%` : ''} lowerIsBetter />
            <KpiTile loading={snap.status === 'loading'} label="Verified" value={stats ? `${stats.verifiedRate}%` : '—'} icon={<ShieldCheck />} hint={stats ? `${stats.verified} of ${stats.challenged} challenged · median ${stats.medianSecondsToVerify ?? '—'}s` : ''} />
            <KpiTile loading={snap.status === 'loading'} label="Numbers rejected" value={stats ? stats.phoneRejections : '—'} icon={<Ban />} hint={stats ? `${stats.locked} locked · ${stats.fallbacks} channel fallbacks` : ''} lowerIsBetter />
          </motion.div>

          {/* Simulator */}
          <motion.div {...SECTION} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <FlaskConical className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Sign-up simulator</h3>
                <StatusBadge tone="neutral">evaluates only — registers nothing</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Run a sign-up through the live policy and see exactly which conditions would trip and why. Pick a persona or enter your own.</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {SIGNUP_PERSONAS.map((p) => (
                  <button key={p.id} type="button" onClick={() => pickPersona(p.id)} title={p.blurb} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${sim.email === p.profile.email ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-surface text-fg-muted hover:text-fg hover:border-teal/30'}`}>{p.label}</button>
                ))}
              </div>
              <form className="grid grid-cols-1 md:grid-cols-4 gap-2" onSubmit={(e) => { e.preventDefault(); runSim(); }}>
                <Input aria-label="Email" value={sim.email} onChange={(e) => setSim({ ...sim, email: e.target.value })} placeholder="work email" className="text-[12px]" />
                <Input aria-label="Company" value={sim.company} onChange={(e) => setSim({ ...sim, company: e.target.value })} placeholder="company" className="text-[12px]" />
                <Input aria-label="Public IP" value={sim.ip} onChange={(e) => setSim({ ...sim, ip: e.target.value })} placeholder="203.0.113.7" mono className="text-[12px]" />
                <div className="flex gap-2"><Input aria-label="Referral code" value={sim.referralCode} onChange={(e) => setSim({ ...sim, referralCode: e.target.value })} placeholder="referral (optional)" className="text-[12px] flex-1" /><Button type="submit" size="sm" loading={simResult?.status === 'loading'} icon={<Search className="w-4 h-4" />}>Evaluate</Button></div>
              </form>
              <AnimatePresence mode="wait" initial={false}>
                {simResult?.status === 'ok' && (
                  <motion.div key={simResult.data.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <StatusBadge tone={simResult.data.decision === 'challenge' ? 'warning' : 'success'}>{simResult.data.decision === 'challenge' ? `phone OTP required · ${simResult.data.tripped.length} condition${simResult.data.tripped.length === 1 ? '' : 's'}` : simResult.data.decision === 'exempt' ? `exempt · ${simResult.data.exemptReason}` : 'activates instantly — no phone'}</StatusBadge>
                      <span className="text-[11px] text-fg-muted">{simResult.data.inputs.companyName ? `${simResult.data.inputs.companyName} · ${simResult.data.inputs.headcount?.toLocaleString()} people · ${simResult.data.inputs.industry}` : simResult.data.inputs.personalDomain ? 'personal / free-mail domain' : 'no company resolved'} · domain age {simResult.data.inputs.domainAgeDays ?? '—'}d · mail posture {simResult.data.inputs.domainAuthGrade ?? '—'}</span>
                    </div>
                    <DataTable columns={conditionColumns} rows={simResult.data.conditions} rowKey={(c) => c.id} />
                  </motion.div>
                )}
                {simResult?.status === 'error' && <p key="err" className="mt-3 text-[12px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {simResult.message}</p>}
              </AnimatePresence>
            </GlassCard>
          </motion.div>

          {/* Number checker */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Smartphone className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Temp-phone verifier</h3>
                <StatusBadge tone="neutral">classifies only — sends nothing</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-3">The same check that runs before any OTP is sent. Reserved and fictional ranges, non-geographic VoIP blocks, receive-SMS patterns and landlines are declined (landlines may still take a voice call).</p>
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 items-start">
                <Select aria-label="Country" value={chk.country} onChange={(e) => setChk({ ...chk, country: e.target.value })} className="text-[12px]">{COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.iso} +{c.dial} · {c.name}</option>)}</Select>
                <Input aria-label="Phone number to check" value={chk.phone} onChange={(e) => setChk({ ...chk, phone: e.target.value })} placeholder="+1 555 0100 · 07700 900123 · 98450 12345" mono className="text-[12px]" />
                <div className="min-h-[38px] flex items-center" role="status" aria-live="polite">
                  {chk.phone.trim() && !chkResult?.e164 && <StatusBadge tone="neutral">not a valid number for {chk.country}</StatusBadge>}
                  {chkResult?.e164 && chkResult.lineType && <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11px] text-fg">{chkResult.e164}</span><StatusBadge tone={LINE_TONE[chkResult.lineType]}>{chkResult.lineType.replace('_', ' ')}</StatusBadge><span className="text-[11px] text-fg-muted">{chkResult.reason}</span></div>}
                </div>
              </div>
              <p className="text-[10px] text-fg-subtle mt-3">Delivery simulator (prototype): SMS fails in degraded countries or for numbers ending in 99; WhatsApp fails for numbers ending in 98; voice always completes.</p>
            </GlassCard>
          </motion.div>

          {/* Policy */}
          <motion.div {...SECTION} transition={{ delay: 0.12 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Lock className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Gate policy · zinbit</h3>
                {policy && <StatusBadge tone="neutral">v{policy.version}</StatusBadge>}
                {policySync === 'ok' && <StatusBadge tone="success"><Check className="w-3 h-3" /> saved at the auth service</StatusBadge>}
                {policySync === 'syncing' && <StatusBadge tone="neutral"><RefreshCw className="w-3 h-3 animate-spin" /> saving</StatusBadge>}
                {policySync === 'error' && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> save failed</StatusBadge>}
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Per product, shared defaults. Two conditions are locked on for every Zintlr product; the rest and their thresholds are yours. Changes apply to the next evaluation.</p>
              {!policy ? (
                snap.status === 'error' ? <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load the policy" description={snap.message} action={<Button size="sm" variant="secondary" onClick={load} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>} /> : <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    {RISK_CONDITIONS.map((c) => {
                      const on = policy.conditionsEnabled[c.id];
                      return (
                        <div key={c.id} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3">
                          <button type="button" role="switch" aria-checked={on} aria-label={`${c.label} ${on ? 'enabled' : 'disabled'}`} disabled={c.locked} onClick={() => patchPolicy({ conditionsEnabled: { [c.id]: !on } }, c.id)} className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${on ? 'bg-teal' : 'bg-surface-2 border border-border'} ${c.locked ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            <motion.span layout className={`absolute top-0.5 w-4 h-4 rounded-full shadow ${on ? 'left-[18px] bg-surface' : 'left-0.5 bg-fg-muted'}`} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-bold text-fg flex items-center gap-1.5"><span className="font-mono text-fg-muted">{c.code}</span>{c.label}{c.locked && <span className="inline-flex items-center gap-0.5 text-[10px] text-fg-muted"><Lock className="w-3 h-3" /> locked on</span>}</div>
                            <div className="text-[11px] text-fg-muted">{c.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['smallCompanyThreshold', 'C4 headcount below', 'people'],
                        ['duplicateIpWindowDays', 'C6 IP look-back', 'days'],
                        ['domainAgeMinDays', 'C2 min domain age', 'days'],
                        ['fallbackAfterSeconds', 'Offer next channel after', 'seconds'],
                      ] as const).map(([k, label, unit]) => (
                        <label key={k} className="rounded-xl border border-border bg-surface px-3 py-2 block">
                          <span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted">{label}</span>
                          <span className="flex items-center gap-1.5 mt-1">
                            <input type="number" min={POLICY_BOUNDS[k].min} max={POLICY_BOUNDS[k].max} defaultValue={policy[k]} key={`${k}-${policy.version}`} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== policy[k]) patchPolicy({ [k]: v }, k); }} className="w-24 rounded-lg border border-border bg-surface font-mono text-[12px] text-fg px-2 py-1 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50" aria-label={label} />
                            <span className="text-[11px] text-fg-muted">{unit}</span>
                          </span>
                          <span className="block text-[10px] text-fg-subtle mt-1">saves on blur · {POLICY_BOUNDS[k].min}–{POLICY_BOUNDS[k].max}</span>
                        </label>
                      ))}
                    </div>
                    <div className="rounded-xl border border-border bg-surface px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">SMS-degraded countries → WhatsApp first</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {policy.smsDegradedCountries.map((iso) => <span key={iso} className="inline-flex items-center gap-1 rounded-md border border-semantic-warning/30 bg-semantic-warning/5 px-2 py-0.5 font-mono text-[10px] text-fg">{iso}<button type="button" aria-label={`Remove ${iso}`} onClick={() => patchPolicy({ smsDegradedCountries: policy.smsDegradedCountries.filter((x) => x !== iso) }, 'smsDegradedCountries')} className="text-fg-muted hover:text-semantic-error"><X className="w-3 h-3" /></button></span>)}
                        {policy.smsDegradedCountries.length === 0 && <span className="text-[11px] text-fg-subtle">none — SMS leads everywhere</span>}
                      </div>
                      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (isoDraft.trim()) { patchPolicy({ smsDegradedCountries: [...policy.smsDegradedCountries, isoDraft.trim().toUpperCase()] }, 'smsDegradedCountries'); setIsoDraft(''); } }}>
                        <input value={isoDraft} onChange={(e) => setIsoDraft(e.target.value)} maxLength={2} placeholder="ISO e.g. NG" aria-label="Add a degraded country" className="w-28 rounded-lg border border-border bg-surface font-mono text-[11px] text-fg px-2 py-1 uppercase focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 placeholder:text-fg-subtle placeholder:normal-case" />
                        <Button type="submit" size="sm" variant="secondary" disabled={isoDraft.trim().length !== 2} icon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
                      </form>
                    </div>
                    <div className="rounded-xl border border-border bg-surface px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Shared-egress allow-list (never trips C6)</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {policy.sharedEgressAllowlist.map((p) => <span key={p} className="inline-flex items-center gap-1 rounded-md border border-border bg-glass px-2 py-0.5 font-mono text-[10px] text-fg">{p}<button type="button" aria-label={`Remove ${p}`} onClick={() => patchPolicy({ sharedEgressAllowlist: policy.sharedEgressAllowlist.filter((x) => x !== p) }, 'sharedEgressAllowlist')} className="text-fg-muted hover:text-semantic-error"><X className="w-3 h-3" /></button></span>)}
                        {policy.sharedEgressAllowlist.length === 0 && <span className="text-[11px] text-fg-subtle">none — add corporate NAT or carrier ranges as “203.0.113.”</span>}
                      </div>
                      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (egressDraft.trim()) { patchPolicy({ sharedEgressAllowlist: [...policy.sharedEgressAllowlist, egressDraft.trim()] }, 'sharedEgressAllowlist'); setEgressDraft(''); } }}>
                        <input value={egressDraft} onChange={(e) => setEgressDraft(e.target.value)} placeholder="203.0.113. or 198.51.100.7" aria-label="Add an allow-listed IP or prefix" className="flex-1 min-w-0 rounded-lg border border-border bg-surface font-mono text-[11px] text-fg px-2 py-1 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 placeholder:text-fg-subtle" />
                        <Button type="submit" size="sm" variant="secondary" disabled={!egressDraft.trim()} icon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
                      </form>
                    </div>
                    <label className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={policy.referralWaivesSmallCompany} onChange={(e) => patchPolicy({ referralWaivesSmallCompany: e.target.checked }, 'referralWaivesSmallCompany')} className="accent-teal focus-visible:ring-2 focus-visible:ring-teal/50 rounded" />
                      <span className="text-[12px] text-fg"><span className="font-bold">Referral / partner code waives C4</span> <span className="text-fg-muted">— early-stage partner leads aren’t challenged for size alone.</span></span>
                    </label>
                    {ignored.length > 0 && <p className="text-[11px] text-fg-muted inline-flex items-center gap-1"><Unlock className="w-3 h-3" /> Not applied: {ignored.join(', ')}</p>}
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Ledger */}
          <motion.div {...SECTION} transition={{ delay: 0.16 }}>
            <GlassCard className="p-5 mt-5 border-teal/20">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <ScrollText className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Challenge ledger</h3>
                {snap.status === 'ok' && <StatusBadge tone="neutral">{snap.data.challenges.length} challenge{snap.data.challenges.length === 1 ? '' : 's'} · {snap.data.directory} accounts in the shared directory</StatusBadge>}
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Every account that was asked for a phone: what flagged it, the number’s line type, each send and fallback, and the outcome. Overrides need a reason and are audit-logged.</p>
              {snap.status === 'loading' ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
                : snap.status === 'error' ? <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load challenges" description={snap.message} action={<Button size="sm" variant="secondary" onClick={load} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>} />
                : snap.data.challenges.length === 0 ? <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No phone checks yet" description="Clean sign-ups activate without one. Activate your own trial from the banner above, or simulate a flagged sign-up to see the conditions." />
                : <DataTable columns={challengeColumns} rows={snap.data.challenges} rowKey={(c) => c.id} pageSize={8} />}
              <AnimatePresence>
                {overrideFor && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-4">
                      <div className="text-[12px] font-bold text-fg mb-1">Override for <span className="font-mono">{overrideFor.accountId}</span></div>
                      <p className="text-[11px] text-fg-muted mb-2">Allow activates the trial without a phone check; Deny closes the challenge. A reason is required and recorded with your identity.</p>
                      <Input aria-label="Override reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. verified customer on a support call (ticket #4821)" className="text-[12px]" />
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <ConfirmAction size="sm" loading={overriding === 'allow'} disabled={reason.trim().length < 4 || overriding !== null} onConfirm={() => doOverride('allow')} confirmLabel="Confirm allow" icon={<UserCheck className="w-4 h-4" />}>Allow &amp; activate</ConfirmAction>
                        <ConfirmAction size="sm" variant="danger" loading={overriding === 'deny'} disabled={reason.trim().length < 4 || overriding !== null} onConfirm={() => doOverride('deny')} confirmLabel="Confirm deny" icon={<Ban className="w-4 h-4" />}>Deny</ConfirmAction>
                        <Button size="sm" variant="ghost" onClick={() => setOverrideFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>

          {/* Delivery + events */}
          <motion.div {...SECTION} transition={{ delay: 0.2 }} className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Delivery &amp; fallback</h3></div>
              {stats ? (
                <div className="space-y-3">
                  {CHANNEL_ORDER.map((ch) => {
                    const s = stats.sendsByChannel[ch];
                    const rate = s.sent ? Math.round((s.delivered / s.sent) * 100) : null;
                    return (
                      <div key={ch} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3">
                        <span className="text-teal">{CHANNEL_ICON[ch]}</span>
                        <div className="min-w-0 flex-1"><div className="text-[12px] font-bold text-fg">{CHANNEL_LABEL[ch]}</div><div className="text-[11px] text-fg-muted">{s.sent} sent · {s.delivered} delivered · {s.failed} failed</div></div>
                        <StatusBadge tone={rate === null ? 'neutral' : rate >= 85 ? 'success' : 'warning'}>{rate === null ? 'no sends' : `${rate}% delivered`}</StatusBadge>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border border-border bg-surface px-3 py-2"><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Fallbacks</div><div className="text-sm font-bold text-fg mt-0.5">{stats.fallbacks}</div></div>
                    <div className="rounded-xl border border-border bg-surface px-3 py-2"><div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Rejected by reason</div><div className="text-[11px] text-fg mt-0.5">{Object.entries(stats.rejectionsByReason).filter(([, n]) => n > 0).map(([r, n]) => `${r.replace('_', ' ')} ${n}`).join(' · ') || 'none'}</div></div>
                  </div>
                </div>
              ) : <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>}
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Auth events</h3>{snap.status === 'ok' && <StatusBadge tone="teal" dot pulse>live</StatusBadge>}</div>
              {snap.status === 'ok' ? (snap.data.events.length === 0 ? <EmptyState icon={<Activity className="w-8 h-8" />} title="No events yet" description="Evaluations, sends, fallbacks, verifications and overrides stream here — each product forwards them into its growth layer." /> : (
                <ul className="space-y-1 max-h-[360px] overflow-auto pr-1" aria-label="Auth events">
                  {snap.data.events.map((e) => (
                    <li key={e.id} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 flex items-start gap-2">
                      <span className="font-mono text-[10px] text-fg-subtle tabular-nums shrink-0 mt-0.5">{ago(e.at)}</span>
                      <div className="min-w-0"><span className="font-mono text-[11px] text-fg">{e.name}</span> <span className="text-[10px] text-fg-muted break-all">{Object.entries(e.props).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}=${String(v)}`).join(' ')}</span></div>
                    </li>
                  ))}
                </ul>
              )) : <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>}
            </GlassCard>
          </motion.div>

          <p className="text-[11px] text-fg-muted mt-4 flex items-center gap-1 flex-wrap"><Sparkles className="w-3 h-3 shrink-0" /> This is the prototype of the shared auth service — one policy engine, one directory and one OTP path for every Zintlr product. Sign-up itself never asks for a phone.</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Link href="/console/login-security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Login security <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/mfa" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">MFA enforcement <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/growth" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Growth <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/settings/team" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Team <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function TrialGatePage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <TrialGateInner />
    </RoleGuard>
  );
}
