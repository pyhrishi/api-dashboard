'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, ShieldQuestion, Smartphone, MessageCircle, PhoneCall, MessageSquare, Check, AlertTriangle, RefreshCw, Inbox, ArrowRight, Lock } from 'lucide-react';
import { useStore, TRIAL_CREDITS, type TrialActivationMethod } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { Modal, Button, StatusBadge, Select, Input, type BadgeTone } from '@/components/ui';
import { sha256Hex } from '@/lib/key-hashing';
import { explainChallenge, type TrialRiskEvaluation, type ConditionResult } from '@/lib/auth/trial-gate';
import { COUNTRIES, CHANNEL_LABEL, nextChannel, type OtpChannel } from '@/lib/auth/phone-otp';
import type { PhoneChallenge, OtpSend } from '@/lib/auth/trial-gate-service';

/**
 * Risk-based trial activation (shared auth, F-503). Sign-up never asks for a phone;
 * this gate runs when the user activates the free trial. A clean sign-up activates
 * instantly. A flagged one sees *why*, enters a phone (temporary / VoIP numbers are
 * rejected before any send), and verifies a code — SMS first, WhatsApp or a voice
 * call when SMS fails or takes too long. State survives a closed modal or a reload.
 */

type Step =
  | { kind: 'idle' }
  | { kind: 'evaluating' }
  | { kind: 'challenge_intro'; evaluation: TrialRiskEvaluation; country: string }
  | { kind: 'phone'; evaluation: TrialRiskEvaluation; country: string; error: string | null; lineType: string | null }
  | { kind: 'code'; challenge: PhoneChallenge; send: OtpSend; error: string | null; attemptsLeft: number | null }
  | { kind: 'verified'; method: TrialActivationMethod; channel: OtpChannel | null }
  | { kind: 'locked'; until: number }
  | { kind: 'error'; message: string };

interface InboxMessage { sendId: string; channel: OtpChannel; code: string | null; deliveryStatus: string; deliveryReason: string | null }

const CHANNEL_ICON: Record<OtpChannel, React.ReactNode> = {
  sms: <MessageSquare className="w-3.5 h-3.5" />, whatsapp: <MessageCircle className="w-3.5 h-3.5" />, voice: <PhoneCall className="w-3.5 h-3.5" />,
};
const post = (path: string, body: unknown) => fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function TrialActivationGate() {
  const pathname = usePathname();
  const user = useStore((s) => s.user);
  const activation = useStore((s) => s.trialActivation);
  const setTrialActivation = useStore((s) => s.setTrialActivation);
  const rechargeCredits = useStore((s) => s.rechargeCredits);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'phone' | 'verify' | OtpChannel>(null);
  const [elapsed, setElapsed] = useState(0);
  const [fallbackAfter, setFallbackAfter] = useState(30);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const codeRef = useRef<HTMLInputElement>(null);

  const email = user?.email ?? '';
  const accountId = useMemo(() => (email ? `acct_${sha256Hex(`account:${email.toLowerCase()}`).slice(0, 12)}` : null), [email]);
  const gated = activation.status !== 'active' && Boolean(accountId);

  // ── Activation ──
  const activate = useCallback((method: TrialActivationMethod, channel: OtpChannel | null, evaluation: TrialRiskEvaluation | null, phoneMasked: string | null) => {
    rechargeCredits(TRIAL_CREDITS);
    setTrialActivation({
      status: 'active', accountId, method, channel, conditions: evaluation?.tripped ?? activation.conditions, phoneMasked,
      creditsGranted: TRIAL_CREDITS, activatedAt: new Date().toISOString(), evaluationId: evaluation?.id ?? activation.evaluationId,
    });
    track('trial_activated', { method, channel, conditions: (evaluation?.tripped ?? activation.conditions).length, credits: TRIAL_CREDITS });
    setStep({ kind: 'verified', method, channel });
  }, [accountId, activation.conditions, activation.evaluationId, rechargeCredits, setTrialActivation]);

  // ── Evaluate (or resume an open challenge) ──
  const begin = useCallback(async () => {
    if (!accountId || !user) return;
    setOpen(true);
    setStep({ kind: 'evaluating' });
    setCode('');
    try {
      const policyRes = await fetch('/api/auth/policy/zinbit');
      const policy = (await policyRes.json().catch(() => null))?.data as { fallbackAfterSeconds?: number } | null;
      if (policy?.fallbackAfterSeconds) setFallbackAfter(policy.fallbackAfterSeconds);

      // Resume a pending challenge from an earlier session.
      if (activation.challengeId) {
        const cur = (await (await fetch(`/api/auth/phone/challenge/${accountId}`)).json().catch(() => null))?.data as PhoneChallenge | null;
        if (cur?.state === 'pending' && cur.sends.length) {
          setStep({ kind: 'code', challenge: cur, send: cur.sends[cur.sends.length - 1], error: null, attemptsLeft: null });
          return;
        }
        if (cur?.state === 'verified') { activate('otp', cur.channelUsed, null, cur.phoneMasked); toast.success('Trial activated', `${TRIAL_CREDITS.toLocaleString()} free credits added to your balance.`); return; }
        if (cur?.state === 'locked' && cur.lockedUntil && cur.lockedUntil > Date.now()) { setStep({ kind: 'locked', until: cur.lockedUntil }); return; }
      }

      const res = await post('trial/evaluate', { accountId, email: user.email, company: user.company, productId: 'zinbit' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data?.evaluation) { setStep({ kind: 'error', message: body?.error?.message ?? `The auth service returned HTTP ${res.status}.` }); return; }
      const evaluation = body.data.evaluation as TrialRiskEvaluation;
      const country = String(body.data.suggestedCountry ?? 'IN');
      setTrialActivation({ accountId, evaluationId: evaluation.id, conditions: evaluation.tripped });
      track('trial_risk_evaluated', { decision: evaluation.decision, tripped: evaluation.tripped.length, conditions: evaluation.tripped.join(',') || null });
      if (evaluation.decision === 'challenge') {
        track('otp_challenge_shown', { conditions: evaluation.tripped.join(','), country });
        setStep({ kind: 'challenge_intro', evaluation, country });
      } else {
        activate(evaluation.decision === 'exempt' ? 'exempt' : 'clean', null, evaluation, null);
      }
    } catch {
      setStep({ kind: 'error', message: 'Could not reach the auth service. Check your connection and retry.' });
    }
  }, [accountId, user, activation.challengeId, activate, setTrialActivation, toast]);

  // ── Phone → challenge ──
  const submitPhone = useCallback(async () => {
    if (step.kind !== 'phone' || !accountId) return;
    setBusy('phone');
    try {
      const res = await post('phone/challenge', { accountId, evaluationId: step.evaluation.id, phone, country: step.country });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const err = body?.error ?? {};
        if (err.code === 'PHONE_LOCKED') { setStep({ kind: 'locked', until: Number(err.details?.lockedUntil ?? Date.now() + 86_400_000) }); return; }
        if (err.code === 'PHONE_REJECTED') track('otp_phone_rejected', { reason: String(err.details?.reason ?? ''), lineType: String(err.details?.lineType ?? ''), country: step.country });
        setStep({ ...step, error: String(err.message ?? 'Could not start the phone check.'), lineType: err.details?.lineType ? String(err.details.lineType) : null });
        return;
      }
      const { challenge, send } = body.data as { challenge: PhoneChallenge; send: OtpSend };
      setTrialActivation({ challengeId: challenge.id, phoneMasked: challenge.phoneMasked });
      track('otp_sent', { channel: send.channel, delivery: send.deliveryStatus, country: step.country });
      setCode('');
      setStep({ kind: 'code', challenge, send, error: null, attemptsLeft: null });
    } catch {
      setStep({ ...step, error: 'Could not reach the auth service.' });
    } finally {
      setBusy(null);
    }
  }, [step, accountId, phone, setTrialActivation]);

  // ── Resend / fallback ──
  const resend = useCallback(async (channel?: OtpChannel) => {
    if (step.kind !== 'code') return;
    setBusy(channel ?? nextChannel(step.send.channel) ?? step.send.channel);
    try {
      const res = await post('phone/resend', { challengeId: step.challenge.id, channel });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setStep({ ...step, error: String(body?.error?.message ?? 'Could not resend.') }); return; }
      const send = body.data as OtpSend;
      if (send.fallbackFrom) track('otp_fallback', { from: send.fallbackFrom, to: send.channel, reason: send.fallbackReason });
      track('otp_sent', { channel: send.channel, delivery: send.deliveryStatus, country: step.challenge.phoneCountry });
      setCode('');
      setElapsed(0);
      setStep({ kind: 'code', challenge: step.challenge, send, error: null, attemptsLeft: null });
    } catch {
      setStep({ ...step, error: 'Could not reach the auth service.' });
    } finally {
      setBusy(null);
    }
  }, [step]);

  // ── Verify ──
  const submitCode = useCallback(async () => {
    if (step.kind !== 'code') return;
    setBusy('verify');
    try {
      const res = await post('phone/verify', { challengeId: step.challenge.id, code });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const err = body?.error ?? {};
        track('otp_failed', { code: String(err.code ?? ''), channel: step.send.channel });
        setStep({ ...step, error: String(err.message ?? 'Verification failed.'), attemptsLeft: typeof err.details?.attemptsLeft === 'number' ? err.details.attemptsLeft : step.attemptsLeft });
        return;
      }
      const data = body.data as { challenge: PhoneChallenge; secondsToVerify: number };
      track('otp_verified', { channel: data.challenge.channelUsed, secondsToVerify: data.secondsToVerify, fallbacks: data.challenge.sends.filter((s) => s.fallbackFrom).length });
      activate('otp', data.challenge.channelUsed, null, data.challenge.phoneMasked);
    } catch {
      setStep({ ...step, error: 'Could not reach the auth service.' });
    } finally {
      setBusy(null);
    }
  }, [step, code, activate]);

  // Fallback timer + sandbox inbox while a code is outstanding (keyed on the active send).
  const activeSendId = step.kind === 'code' ? step.send.id : null;
  const activeChallengeId = step.kind === 'code' ? step.challenge.id : null;
  useEffect(() => {
    if (step.kind !== 'code') return;
    setElapsed(0);
    setInbox([]);
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const load = () => fetch(`/api/auth/demo/inbox/${step.challenge.id}`).then((r) => r.json()).then((b) => setInbox((b?.data?.messages ?? []) as InboxMessage[])).catch(() => {});
    load();
    const poll = setInterval(load, 4000);
    codeRef.current?.focus();
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the active send changes, not on every step object
  }, [activeSendId, activeChallengeId]);

  const close = () => {
    if (step.kind === 'phone' || step.kind === 'code' || step.kind === 'challenge_intro') track('otp_abandoned', { step: step.kind, conditions: activation.conditions.join(',') });
    setOpen(false);
    setStep({ kind: 'idle' });
  };

  const onPage = pathname?.startsWith('/console/trial-gate');
  const nextCh = step.kind === 'code' ? nextChannel(step.send.channel) : null;
  const smsFailed = step.kind === 'code' && step.send.deliveryStatus === 'failed';
  const showFallback = step.kind === 'code' && (smsFailed || elapsed >= fallbackAfter);
  const latest = inbox.length ? inbox[inbox.length - 1] : null;

  const tone = (c: ConditionResult): BadgeTone => (c.tripped ? 'warning' : 'neutral');

  return (
    <>
      <AnimatePresence>
        {gated && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mb-4 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 flex items-center gap-3 flex-wrap" role="region" aria-label="Trial activation">
              <span className="text-teal shrink-0"><Gift className="w-5 h-5" /></span>
              <p className="text-sm text-fg min-w-0 flex-1">
                <span className="font-bold">Activate your free trial — {TRIAL_CREDITS.toLocaleString()} credits.</span>{' '}
                No phone number needed unless something about the sign-up needs a second look.
                {onPage && <span className="text-fg-muted"> (You’re on the Trial Gate console — this is your own account’s gate.)</span>}
              </p>
              <Button size="sm" onClick={begin} icon={<ArrowRight className="w-4 h-4" />}>Activate trial</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={open}
        onClose={close}
        title={step.kind === 'verified' ? 'Trial activated' : step.kind === 'locked' ? 'Phone check locked' : 'Activate your free trial'}
        description={step.kind === 'evaluating' ? 'Checking your workspace…' : step.kind === 'code' ? `We sent a code by ${CHANNEL_LABEL[step.send.channel]} to ${step.challenge.phoneMasked}.` : step.kind === 'phone' ? 'A mobile number you control. Temporary and virtual numbers are declined.' : undefined}
        widthClass="max-w-lg"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step.kind} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {step.kind === 'evaluating' && (
              <div className="flex flex-col items-center justify-center py-10 text-center" aria-busy="true">
                <RefreshCw className="w-6 h-6 text-teal animate-spin mb-3" />
                <div className="text-sm font-bold text-fg">Checking your workspace</div>
                <div className="text-[12px] text-fg-muted mt-1">Domain, company, and whether we already know this workspace. Usually under a second.</div>
              </div>
            )}

            {step.kind === 'challenge_intro' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-semantic-warning/30 bg-semantic-warning/5 p-4 flex items-start gap-3">
                  <ShieldQuestion className="w-5 h-5 text-semantic-warning shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-fg">One quick check before we add your credits</div>
                    <p className="text-[12px] text-fg-muted mt-0.5">{explainChallenge(step.evaluation)} Verifying a mobile number takes about a minute and keeps free trials fair.</p>
                  </div>
                </div>
                <ul className="space-y-1.5" aria-label="What we looked at">
                  {step.evaluation.conditions.filter((c) => c.enabled).map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-[12px]">
                      <StatusBadge tone={tone(c)}>{c.tripped ? 'flagged' : 'ok'}</StatusBadge>
                      <span className="min-w-0"><span className="font-bold text-fg">{c.label}</span> <span className="text-fg-muted">— {c.evidence}</span></span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={close}>Not now</Button>
                  <Button size="sm" autoFocus onClick={() => setStep({ kind: 'phone', evaluation: step.evaluation, country: step.country, error: null, lineType: null })} icon={<Smartphone className="w-4 h-4" />}>Continue with phone check</Button>
                </div>
              </div>
            )}

            {step.kind === 'phone' && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submitPhone(); }}>
                <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-2">
                  <div>
                    <label htmlFor="otp-country" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Country</label>
                    <Select id="otp-country" value={step.country} onChange={(e) => setStep({ ...step, country: e.target.value, error: null })} className="text-[12px]">
                      {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.iso} +{c.dial} · {c.name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="otp-phone" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Mobile number</label>
                    <Input
                      id="otp-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus mono value={phone} onChange={(e) => { setPhone(e.target.value); if (step.error) setStep({ ...step, error: null, lineType: null }); }}
                      placeholder="98450 12345" invalid={Boolean(step.error)} aria-describedby={step.error ? 'otp-phone-error' : undefined} className="text-[13px]"
                    />
                  </div>
                </div>
                {step.error && (
                  <p id="otp-phone-error" role="alert" className="text-[12px] text-semantic-error inline-flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{step.error}{step.lineType ? <span className="text-fg-muted"> (detected: {step.lineType.replace('_', ' ')})</span> : null}</span></p>
                )}
                <p className="text-[11px] text-fg-muted inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Stored as a hash, used only to keep trials fair. Never shown to anyone, never used for marketing.</p>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" type="button" onClick={close}>Not now</Button>
                  <Button size="sm" type="submit" loading={busy === 'phone'} disabled={!phone.trim()} icon={<MessageSquare className="w-4 h-4" />}>Send code</Button>
                </div>
              </form>
            )}

            {step.kind === 'code' && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
                <div className={`rounded-xl border p-3 flex items-start gap-2 text-[12px] ${smsFailed ? 'border-semantic-warning/30 bg-semantic-warning/5' : 'border-border bg-surface'}`} role="status" aria-live="polite">
                  <span className={smsFailed ? 'text-semantic-warning' : 'text-teal'}>{CHANNEL_ICON[step.send.channel]}</span>
                  <span className="min-w-0 text-fg">
                    {smsFailed ? (
                      <><span className="font-bold">{CHANNEL_LABEL[step.send.channel]} couldn’t be delivered</span> <span className="text-fg-muted">({step.send.deliveryReason}).</span>{nextCh ? ` Get the code by ${CHANNEL_LABEL[nextCh]} instead.` : ''}</>
                    ) : (
                      <><span className="font-bold">Code sent by {CHANNEL_LABEL[step.send.channel]}</span> <span className="text-fg-muted"><span aria-hidden="true">· {elapsed}s ago </span>· valid 10 minutes{step.send.fallbackFrom ? ` · switched from ${CHANNEL_LABEL[step.send.fallbackFrom]}` : ''}</span></>
                    )}
                  </span>
                </div>
                <div>
                  <label htmlFor="otp-code" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">6-digit code</label>
                  <input
                    ref={codeRef} id="otp-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (step.error) setStep({ ...step, error: null }); }}
                    aria-invalid={step.error ? true : undefined} aria-describedby={step.error ? 'otp-code-error' : undefined}
                    className="w-full rounded-xl border border-border bg-surface font-mono text-[22px] tracking-[0.5em] text-center text-fg py-3 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 transition-colors"
                  />
                  {step.error && <p id="otp-code-error" role="alert" className="mt-1.5 text-[12px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {step.error}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {showFallback && nextCh && (
                    <Button size="sm" variant="secondary" type="button" loading={busy === nextCh} disabled={busy !== null && busy !== nextCh} onClick={() => resend(nextCh)} icon={CHANNEL_ICON[nextCh]}>{nextCh === 'voice' ? 'Call me instead' : `Resend by ${CHANNEL_LABEL[nextCh]}`}</Button>
                  )}
                  {showFallback && step.send.channel !== 'voice' && nextCh !== 'voice' && (
                    <Button size="sm" variant="ghost" type="button" loading={busy === 'voice'} disabled={busy !== null && busy !== 'voice'} onClick={() => resend('voice')} icon={<PhoneCall className="w-4 h-4" />}>Call me instead</Button>
                  )}
                  {!showFallback && <span className="text-[11px] text-fg-muted">Didn’t get it? Other options appear in {Math.max(0, fallbackAfter - elapsed)}s.</span>}
                  {showFallback && !smsFailed && <Button size="sm" variant="ghost" type="button" loading={busy === step.send.channel} disabled={busy !== null && busy !== step.send.channel} onClick={() => resend(step.send.channel)} icon={<RefreshCw className="w-4 h-4" />}>Resend</Button>}
                </div>

                {/* Sandbox stand-in for the phone: what a real device would have received. */}
                <div className="rounded-xl border border-dashed border-border bg-glass p-3" data-testid="sandbox-inbox">
                  <div className="flex items-center gap-2 mb-1.5"><Inbox className="w-3.5 h-3.5 text-fg-muted" /><span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Sandbox phone</span><StatusBadge tone="neutral">prototype only</StatusBadge></div>
                  {latest && latest.code ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[12px] text-fg">{CHANNEL_LABEL[latest.channel]}: <span className="font-mono font-bold tracking-widest">{latest.code}</span> <span className="text-fg-muted">is your Zinbit code. Valid 10 minutes.</span></span>
                      <Button size="sm" variant="secondary" type="button" onClick={() => { setCode(latest.code ?? ''); codeRef.current?.focus(); }}>Use this code</Button>
                    </div>
                  ) : latest && latest.deliveryStatus === 'failed' ? (
                    <span className="text-[12px] text-fg-muted">Nothing arrived — the {CHANNEL_LABEL[latest.channel]} send failed ({latest.deliveryReason}).</span>
                  ) : (
                    <span className="text-[12px] text-fg-muted">Waiting for delivery…</span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" type="button" onClick={close}>Finish later</Button>
                  <Button size="sm" type="submit" loading={busy === 'verify'} disabled={code.length !== 6 || (busy !== null && busy !== 'verify')} icon={<Check className="w-4 h-4" />}>Verify</Button>
                </div>
              </form>
            )}

            {step.kind === 'verified' && (
              <div className="text-center py-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-teal/10 text-teal flex items-center justify-center mb-3"><Check className="w-6 h-6" /></div>
                <div className="text-lg font-black text-fg">{TRIAL_CREDITS.toLocaleString()} credits added</div>
                <p className="text-[12px] text-fg-muted mt-1">
                  {step.method === 'clean' ? 'Your sign-up looked good — no phone check was needed.' : step.method === 'exempt' ? 'Verified by your account standing — no phone check was needed.' : `Phone verified by ${step.channel ? CHANNEL_LABEL[step.channel] : 'OTP'}. You won’t be asked again.`}
                </p>
                <div className="mt-4"><Button size="sm" onClick={close} icon={<ArrowRight className="w-4 h-4" />}>Start building</Button></div>
              </div>
            )}

            {step.kind === 'locked' && (
              <div className="text-center py-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-semantic-error/10 text-semantic-error flex items-center justify-center mb-3"><Lock className="w-6 h-6" /></div>
                <div className="text-lg font-black text-fg">Too many rejected numbers</div>
                <p className="text-[12px] text-fg-muted mt-1">The phone check is locked until {new Date(step.until).toLocaleString()}. Our Trust &amp; Safety team has been notified and can help — <Link href="/console/support" onClick={close} className="text-teal hover:underline font-bold">contact support</Link>.</p>
                <div className="mt-4"><Button size="sm" variant="secondary" onClick={close}>Close</Button></div>
              </div>
            )}

            {step.kind === 'error' && (
              <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-3 flex-wrap">
                <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" />
                <div className="text-[12px] text-fg flex-1 min-w-0"><span className="font-bold">Couldn’t activate.</span> {step.message}</div>
                <Button variant="secondary" size="sm" onClick={begin} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Modal>
    </>
  );
}
