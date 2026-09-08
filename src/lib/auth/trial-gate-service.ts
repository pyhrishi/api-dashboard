/**
 * Trial gate service — the shared-auth backend (prototype: in-memory, per isolate).
 *
 * Owns everything stateful about risk-based phone OTP at trial activation:
 *   - per-product policy (locked conditions can't be turned off);
 *   - the cross-product **account directory** the duplicate checks look at;
 *   - evaluations, challenges, OTP sends, phone rejections (3 in 24 h → lock),
 *     overrides, and a verified-phone index (180-day reuse block);
 *   - the **event stream** every product forwards into its own growth layer;
 *   - a **demo inbox**: since no SMS/WhatsApp/voice provider is wired in the
 *     prototype, the code a "delivered" send would have carried is readable here —
 *     clearly a sandbox affordance, never present in production.
 *
 * Pure decisions live in `@/lib/auth/trial-gate` and `@/lib/auth/phone-otp`; this
 * module only sequences them and keeps state. Deterministic; no `Math.random`.
 */

import {
  defaultTrialGatePolicy, normalizeTrialGatePatch, applyTrialGatePatch, evaluateTrialRisk, seedDirectory, emailDomain,
  type TrialGatePolicy, type TrialRiskEvaluation, type DirectoryAccount, type SignupProfile, type Exemptions, type RiskCondition,
} from '@/lib/auth/trial-gate';
import {
  normalizePhone, verifyPhoneQuality, classifyLine, generateOtp, hashOtp, otpMatches, isOtpShape, phoneHash, maskPhone,
  primaryChannel, nextChannel, simulateDelivery, CHANNEL_ORDER,
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_HOUR, PHONE_REJECT_LOCK_THRESHOLD, PHONE_REJECT_LOCK_MS, PHONE_REUSE_WINDOW_DAYS,
  type OtpChannel, type NormalizedPhone, type LineType, type PhoneRejectReason,
} from '@/lib/auth/phone-otp';
import { sha256Hex } from '@/lib/key-hashing';

// ── Types ────────────────────────────────────────────────────────────────────

export type ChallengeState = 'pending' | 'verified' | 'locked' | 'abandoned' | 'overridden';

export interface OtpSend {
  id: string;
  challengeId: string;
  seq: number;
  channel: OtpChannel;
  sentAt: number;
  expiresAt: number;
  attempts: number;
  deliveryStatus: 'delivered' | 'failed';
  deliveryReason: string | null;
  latencyMs: number;
  fallbackFrom: OtpChannel | null;
  fallbackReason: string | null;
  /** Hash only — the code itself is never stored. */
  codeHash: string;
}

export interface PhoneChallenge {
  id: string;
  accountId: string;
  productId: string;
  evaluationId: string;
  conditions: RiskCondition[];
  state: ChallengeState;
  phoneHash: string | null;
  phoneMasked: string | null;
  phoneCountry: string | null;
  lineType: LineType | null;
  createdAt: number;
  verifiedAt: number | null;
  channelUsed: OtpChannel | null;
  lockedUntil: number | null;
  /** Set when an override decided the outcome. */
  overrideId: string | null;
  sends: OtpSend[];
}

export interface PhoneRejection {
  accountId: string;
  phoneHash: string;
  phoneMasked: string;
  reason: PhoneRejectReason;
  lineType: LineType;
  at: number;
}

export interface Override {
  id: string;
  accountId: string;
  action: 'allow' | 'deny';
  actorId: string;
  reason: string;
  at: number;
}

export type TrialGateEventName =
  | 'trial_risk_evaluated' | 'otp_challenge_created' | 'otp_phone_rejected' | 'otp_phone_locked' | 'otp_sent' | 'otp_fallback'
  | 'otp_verified' | 'otp_failed' | 'otp_expired' | 'otp_override' | 'trial_activated' | 'duplicate_domain_invite' | 'policy_updated';

export interface TrialGateEvent {
  id: string;
  name: TrialGateEventName;
  at: number;
  accountId: string | null;
  productId: string;
  props: Record<string, string | number | boolean | null>;
}

export interface TrialGateStats {
  evaluations: number;
  allowed: number;
  challenged: number;
  exempt: number;
  challengeRate: number;
  verified: number;
  verifiedRate: number;
  pending: number;
  locked: number;
  overrides: number;
  phoneRejections: number;
  rejectionsByReason: Record<PhoneRejectReason, number>;
  sendsByChannel: Record<OtpChannel, { sent: number; delivered: number; failed: number }>;
  fallbacks: number;
  trippedByCondition: Record<RiskCondition, number>;
  medianSecondsToVerify: number | null;
}

// ── State ────────────────────────────────────────────────────────────────────

const OTP_SECRET = 'zintlr-auth-prototype-otp-secret';
const EVENT_CAPACITY = 200;

interface ServiceState {
  policies: Map<string, TrialGatePolicy>;
  directory: DirectoryAccount[];
  evaluations: Map<string, TrialRiskEvaluation>;
  latestEvaluation: Map<string, string>;
  challenges: Map<string, PhoneChallenge>;
  challengeByAccount: Map<string, string>;
  rejections: PhoneRejection[];
  overrides: Override[];
  /** phoneHash → { accountId, at } */
  verifiedPhones: Map<string, { accountId: string; at: number }>;
  denylist: Set<string>;
  events: TrialGateEvent[];
  seq: number;
}

function fresh(): ServiceState {
  return {
    policies: new Map(), directory: seedDirectory(), evaluations: new Map(), latestEvaluation: new Map(), challenges: new Map(),
    challengeByAccount: new Map(), rejections: [], overrides: [], verifiedPhones: new Map(), denylist: new Set(), events: [], seq: 0,
  };
}
let S: ServiceState = fresh();

function nextId(prefix: string): string {
  S.seq += 1;
  return `${prefix}_${sha256Hex(`${prefix}:${S.seq}`).slice(0, 10)}`;
}

function emit(name: TrialGateEventName, productId: string, accountId: string | null, props: TrialGateEvent['props'], at: number): TrialGateEvent {
  const e: TrialGateEvent = { id: nextId('evt'), name, at, accountId, productId, props };
  S.events.unshift(e);
  if (S.events.length > EVENT_CAPACITY) S.events.length = EVENT_CAPACITY;
  return e;
}

// ── Policy ───────────────────────────────────────────────────────────────────

export function getPolicy(productId = 'zinbit'): TrialGatePolicy {
  let p = S.policies.get(productId);
  if (!p) { p = defaultTrialGatePolicy(productId); S.policies.set(productId, p); }
  return p;
}

export function updatePolicy(productId: string, body: unknown, now: number = Date.now()): { policy: TrialGatePolicy; ignored: string[] } {
  const { patch, ignored } = normalizeTrialGatePatch(body);
  const next = applyTrialGatePatch(getPolicy(productId), patch);
  S.policies.set(productId, next);
  emit('policy_updated', productId, null, { version: next.version, ignored: ignored.length }, now);
  return { policy: next, ignored };
}

// ── Directory ────────────────────────────────────────────────────────────────

export function listDirectory(): DirectoryAccount[] { return S.directory.slice(); }

function upsertSignup(profile: SignupProfile, now: number): DirectoryAccount {
  let acct = S.directory.find((a) => a.id === profile.accountId);
  if (!acct) {
    acct = { id: profile.accountId, email: profile.email, domain: emailDomain(profile.email), ip: profile.ip, state: 'trial', productId: profile.productId, createdAt: new Date(now).toISOString(), activatedAt: null };
    S.directory.push(acct);
  }
  return acct;
}

// ── Evaluate ─────────────────────────────────────────────────────────────────

export interface EvaluateInput extends SignupProfile {
  exemptions?: Exemptions;
  /** Console simulator: evaluate against the directory without registering the sign-up or activating anything. */
  simulate?: boolean;
}

export function evaluate(input: EvaluateInput, now: number = Date.now()): TrialRiskEvaluation {
  const policy = getPolicy(input.productId);
  if (!input.simulate) upsertSignup(input, now);
  const prior = S.challengeByAccount.get(input.accountId);
  const phoneVerified = prior ? S.challenges.get(prior)?.state === 'verified' : false;
  const exemptions: Exemptions = { ...(input.exemptions ?? {}), phoneVerified: (input.exemptions?.phoneVerified ?? false) || phoneVerified };
  const ev = evaluateTrialRisk(input, S.directory, policy, exemptions, now);
  if (input.simulate) return ev;
  S.evaluations.set(ev.id, ev);
  S.latestEvaluation.set(input.accountId, ev.id);
  emit('trial_risk_evaluated', input.productId, input.accountId, { decision: ev.decision, tripped: ev.tripped.join(',') || null, domain: ev.inputs.domain, ip: input.ip }, now);
  if (ev.decision !== 'challenge') markActivated(input.accountId, input.productId, ev.decision === 'exempt' ? `exempt:${ev.exemptReason}` : 'clean', null, now);
  return ev;
}

export function getEvaluation(id: string): TrialRiskEvaluation | null { return S.evaluations.get(id) ?? null; }
export function latestEvaluationFor(accountId: string): TrialRiskEvaluation | null {
  const id = S.latestEvaluation.get(accountId);
  return id ? S.evaluations.get(id) ?? null : null;
}

function markActivated(accountId: string, productId: string, method: string, channel: OtpChannel | null, now: number): void {
  const acct = S.directory.find((a) => a.id === accountId);
  if (acct && !acct.activatedAt) acct.activatedAt = new Date(now).toISOString();
  emit('trial_activated', productId, accountId, { method, channel }, now);
  // PLG: a duplicate-domain pass becomes an invite prompt for the existing workspace.
  const ev = latestEvaluationFor(accountId);
  if (ev && ev.inputs.domainMatches.length) emit('duplicate_domain_invite', productId, accountId, { domain: ev.inputs.domain, existingAccounts: ev.inputs.domainMatches.join(',') }, now);
}

// ── Challenge ────────────────────────────────────────────────────────────────

export type ChallengeError =
  | { code: 'EVALUATION_NOT_FOUND' | 'NOT_CHALLENGED' | 'ALREADY_VERIFIED' | 'PHONE_INVALID'; message: string }
  | { code: 'PHONE_LOCKED'; message: string; lockedUntil: number }
  | { code: 'PHONE_REJECTED'; message: string; reason: PhoneRejectReason; lineType: LineType; rejectionsToday: number }
  | { code: 'SEND_LIMIT'; message: string; retryAfterSeconds: number }
  | { code: 'CHALLENGE_NOT_FOUND' | 'CHALLENGE_CLOSED' | 'NO_ACTIVE_CODE' | 'CODE_INVALID_SHAPE' | 'CODE_EXPIRED' | 'ATTEMPTS_EXCEEDED'; message: string }
  | { code: 'CODE_INVALID'; message: string; attemptsLeft: number };

export type Result<T> = { ok: true; data: T } | { ok: false; error: ChallengeError };

export function getChallengeForAccount(accountId: string): PhoneChallenge | null {
  const id = S.challengeByAccount.get(accountId);
  return id ? S.challenges.get(id) ?? null : null;
}
export function getChallenge(challengeId: string): PhoneChallenge | null { return S.challenges.get(challengeId) ?? null; }

function rejectionsInWindow(accountId: string, now: number): PhoneRejection[] {
  return S.rejections.filter((r) => r.accountId === accountId && now - r.at <= PHONE_REJECT_LOCK_MS);
}

function sendCode(ch: PhoneChallenge, phone: NormalizedPhone, channel: OtpChannel, fallbackFrom: OtpChannel | null, fallbackReason: string | null, now: number): Result<OtpSend> {
  const recent = ch.sends.filter((s) => now - s.sentAt < 3_600_000);
  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    const retry = Math.ceil((recent[recent.length - OTP_MAX_SENDS_PER_HOUR].sentAt + 3_600_000 - now) / 1000);
    return { ok: false, error: { code: 'SEND_LIMIT', message: `At most ${OTP_MAX_SENDS_PER_HOUR} codes per hour per number. Try again in ${Math.ceil(retry / 60)} min.`, retryAfterSeconds: retry } };
  }
  const policy = getPolicy(ch.productId);
  const seq = ch.sends.length + 1;
  const code = generateOtp(OTP_SECRET, `${ch.id}:${seq}`);
  const delivery = simulateDelivery(channel, phone, policy.smsDegradedCountries);
  const send: OtpSend = {
    id: nextId('send'), challengeId: ch.id, seq, channel, sentAt: now, expiresAt: now + OTP_TTL_MS, attempts: 0,
    deliveryStatus: delivery.status, deliveryReason: delivery.reason, latencyMs: delivery.latencyMs,
    fallbackFrom, fallbackReason, codeHash: hashOtp(code, ch.id),
  };
  ch.sends.push(send);
  // The demo inbox holds the code for delivered sends only — mirrors what a phone would show.
  if (delivery.status === 'delivered') INBOX.set(send.id, code);
  emit('otp_sent', ch.productId, ch.accountId, { channel, seq, delivery: delivery.status, reason: delivery.reason, country: phone.iso }, now);
  if (fallbackFrom) emit('otp_fallback', ch.productId, ch.accountId, { from: fallbackFrom, to: channel, reason: fallbackReason }, now);
  return { ok: true, data: send };
}

export interface CreateChallengeInput { accountId: string; evaluationId: string; phone: string; country: string }

export function createChallenge(input: CreateChallengeInput, now: number = Date.now()): Result<{ challenge: PhoneChallenge; send: OtpSend }> {
  const ev = S.evaluations.get(input.evaluationId);
  if (!ev || ev.accountId !== input.accountId) return { ok: false, error: { code: 'EVALUATION_NOT_FOUND', message: 'Evaluate the account first.' } };
  if (ev.decision !== 'challenge') return { ok: false, error: { code: 'NOT_CHALLENGED', message: 'This account does not need a phone check.' } };
  const existing = getChallengeForAccount(input.accountId);
  if (existing?.state === 'verified') return { ok: false, error: { code: 'ALREADY_VERIFIED', message: 'This account already passed the phone check.' } };
  if (existing?.state === 'locked' && existing.lockedUntil && existing.lockedUntil > now) {
    return { ok: false, error: { code: 'PHONE_LOCKED', message: 'Too many rejected numbers. The phone check is locked for 24 hours.', lockedUntil: existing.lockedUntil } };
  }

  const phone = normalizePhone(input.phone, input.country);
  if (!phone) return { ok: false, error: { code: 'PHONE_INVALID', message: 'Enter a valid mobile number for the selected country.' } };
  const ph = phoneHash(phone.e164);
  const used = S.verifiedPhones.get(ph);
  const reusedByOther = Boolean(used && used.accountId !== input.accountId && now - used.at <= PHONE_REUSE_WINDOW_DAYS * 86_400_000);
  const policy = getPolicy(ev.productId);
  const channel = primaryChannel(phone.iso, policy.smsDegradedCountries);
  const quality = verifyPhoneQuality(phone, { reusedByOther, denylisted: S.denylist.has(ph) }, channel);

  // One challenge per account — reuse the pending one, replace an abandoned one.
  let ch = existing && existing.state === 'pending' ? existing : null;
  if (!ch) {
    ch = {
      id: nextId('chl'), accountId: input.accountId, productId: ev.productId, evaluationId: ev.id, conditions: ev.tripped, state: 'pending',
      phoneHash: null, phoneMasked: null, phoneCountry: null, lineType: null, createdAt: now, verifiedAt: null, channelUsed: null, lockedUntil: null, overrideId: null, sends: [],
    };
    S.challenges.set(ch.id, ch);
    S.challengeByAccount.set(input.accountId, ch.id);
    emit('otp_challenge_created', ev.productId, input.accountId, { conditions: ev.tripped.join(','), country: phone.iso }, now);
  }

  if (!quality.ok) {
    S.rejections.push({ accountId: input.accountId, phoneHash: ph, phoneMasked: maskPhone(phone.e164), reason: quality.reason, lineType: quality.lineType, at: now });
    const count = rejectionsInWindow(input.accountId, now).length;
    emit('otp_phone_rejected', ev.productId, input.accountId, { reason: quality.reason, lineType: quality.lineType, country: phone.iso, rejectionsToday: count }, now);
    if (count >= PHONE_REJECT_LOCK_THRESHOLD) {
      ch.state = 'locked';
      ch.lockedUntil = now + PHONE_REJECT_LOCK_MS;
      emit('otp_phone_locked', ev.productId, input.accountId, { rejections: count, lockedUntil: ch.lockedUntil }, now);
      return { ok: false, error: { code: 'PHONE_LOCKED', message: 'Too many rejected numbers. The phone check is locked for 24 hours and our Trust & Safety team has been notified.', lockedUntil: ch.lockedUntil } };
    }
    return { ok: false, error: { code: 'PHONE_REJECTED', message: quality.message, reason: quality.reason, lineType: quality.lineType, rejectionsToday: count } };
  }

  // A new number on a pending challenge invalidates earlier codes.
  if (ch.phoneHash && ch.phoneHash !== ph) ch.sends.forEach((s) => { s.expiresAt = Math.min(s.expiresAt, now); });
  ch.phoneHash = ph;
  ch.phoneMasked = maskPhone(phone.e164);
  ch.phoneCountry = phone.iso;
  ch.lineType = quality.lineType;
  PHONE_BY_CHALLENGE.set(ch.id, phone);

  const sent = sendCode(ch, phone, channel, null, null, now);
  if (!sent.ok) return sent;
  return { ok: true, data: { challenge: ch, send: sent.data } };
}

/** The normalized number for an open challenge — kept out of the challenge record so it is never serialized. */
const PHONE_BY_CHALLENGE = new Map<string, NormalizedPhone>();
const INBOX = new Map<string, string>();

export function resend(challengeId: string, channel: OtpChannel | undefined, now: number = Date.now()): Result<OtpSend> {
  const ch = S.challenges.get(challengeId);
  if (!ch) return { ok: false, error: { code: 'CHALLENGE_NOT_FOUND', message: 'Unknown challenge.' } };
  if (ch.state !== 'pending') return { ok: false, error: { code: 'CHALLENGE_CLOSED', message: `This challenge is ${ch.state}.` } };
  const phone = PHONE_BY_CHALLENGE.get(ch.id);
  if (!phone) return { ok: false, error: { code: 'NO_ACTIVE_CODE', message: 'Enter your phone number first.' } };
  const last = ch.sends[ch.sends.length - 1];
  const lastChannel: OtpChannel = last?.channel ?? primaryChannel(phone.iso, getPolicy(ch.productId).smsDegradedCountries);
  let target: OtpChannel;
  let reason: string | null = null;
  if (channel && CHANNEL_ORDER.includes(channel)) {
    target = channel;
    reason = channel === lastChannel ? null : 'user_choice';
  } else {
    const nxt = nextChannel(lastChannel);
    target = nxt ?? lastChannel;
    reason = nxt ? (last?.deliveryStatus === 'failed' ? `delivery_failed:${last.deliveryReason}` : 'no_verification_in_time') : null;
  }
  // Landlines can only take a voice call.
  if (ch.lineType === 'landline' && target !== 'voice') target = 'voice';
  // Any earlier code is invalidated by a new send.
  ch.sends.forEach((s) => { s.expiresAt = Math.min(s.expiresAt, now); });
  return sendCode(ch, phone, target, target === lastChannel ? null : lastChannel, reason, now);
}

export function verify(challengeId: string, code: string, now: number = Date.now()): Result<{ challenge: PhoneChallenge; secondsToVerify: number }> {
  const ch = S.challenges.get(challengeId);
  if (!ch) return { ok: false, error: { code: 'CHALLENGE_NOT_FOUND', message: 'Unknown challenge.' } };
  if (ch.state !== 'pending') return { ok: false, error: { code: 'CHALLENGE_CLOSED', message: `This challenge is ${ch.state}.` } };
  if (!isOtpShape(code)) return { ok: false, error: { code: 'CODE_INVALID_SHAPE', message: `Enter the ${OTP_TTL_MS && 6}-digit code.` } };
  const active = ch.sends[ch.sends.length - 1];
  if (!active) return { ok: false, error: { code: 'NO_ACTIVE_CODE', message: 'Request a code first.' } };
  if (active.expiresAt <= now) {
    emit('otp_expired', ch.productId, ch.accountId, { channel: active.channel }, now);
    return { ok: false, error: { code: 'CODE_EXPIRED', message: 'That code has expired. Request a new one.' } };
  }
  if (active.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: { code: 'ATTEMPTS_EXCEEDED', message: 'Too many attempts for this code. Request a new one.' } };
  active.attempts += 1;
  if (!otpMatches(code, ch.id, active.codeHash)) {
    const left = OTP_MAX_ATTEMPTS - active.attempts;
    emit('otp_failed', ch.productId, ch.accountId, { channel: active.channel, attemptsLeft: left }, now);
    return { ok: false, error: { code: 'CODE_INVALID', message: left > 0 ? `That code isn’t right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'That code isn’t right. Request a new one.', attemptsLeft: left } };
  }
  ch.state = 'verified';
  ch.verifiedAt = now;
  ch.channelUsed = active.channel;
  if (ch.phoneHash) S.verifiedPhones.set(ch.phoneHash, { accountId: ch.accountId, at: now });
  PHONE_BY_CHALLENGE.delete(ch.id);
  const seconds = Math.round((now - ch.createdAt) / 1000);
  emit('otp_verified', ch.productId, ch.accountId, { channel: active.channel, secondsToVerify: seconds, fallbacks: ch.sends.filter((s) => s.fallbackFrom).length }, now);
  markActivated(ch.accountId, ch.productId, 'otp', active.channel, now);
  return { ok: true, data: { challenge: ch, secondsToVerify: seconds } };
}

export function abandon(challengeId: string, now: number = Date.now()): PhoneChallenge | null {
  const ch = S.challenges.get(challengeId);
  if (!ch || ch.state !== 'pending') return ch ?? null;
  ch.state = 'abandoned';
  emit('otp_failed', ch.productId, ch.accountId, { abandoned: true, sends: ch.sends.length }, now);
  return ch;
}

// ── Overrides ────────────────────────────────────────────────────────────────

export function override(accountId: string, action: 'allow' | 'deny', actorId: string, reason: string, productId = 'zinbit', now: number = Date.now()): Result<Override> {
  const text = reason.trim();
  if (text.length < 4) return { ok: false, error: { code: 'CODE_INVALID_SHAPE', message: 'A reason (4+ characters) is required for every override.' } };
  const o: Override = { id: nextId('ovr'), accountId, action, actorId, reason: text, at: now };
  S.overrides.push(o);
  let ch = getChallengeForAccount(accountId);
  if (!ch) {
    const ev = latestEvaluationFor(accountId);
    ch = {
      id: nextId('chl'), accountId, productId: ev?.productId ?? productId, evaluationId: ev?.id ?? '', conditions: ev?.tripped ?? [], state: 'pending',
      phoneHash: null, phoneMasked: null, phoneCountry: null, lineType: null, createdAt: now, verifiedAt: null, channelUsed: null, lockedUntil: null, overrideId: null, sends: [],
    };
    S.challenges.set(ch.id, ch);
    S.challengeByAccount.set(accountId, ch.id);
  }
  ch.state = action === 'allow' ? 'verified' : 'overridden';
  ch.overrideId = o.id;
  if (action === 'allow') { ch.verifiedAt = now; markActivated(accountId, ch.productId, 'override', null, now); }
  PHONE_BY_CHALLENGE.delete(ch.id);
  emit('otp_override', ch.productId, accountId, { action, actorId, reason: text }, now);
  return { ok: true, data: o };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function listChallenges(): PhoneChallenge[] {
  return Array.from(S.challenges.values()).sort((a, b) => b.createdAt - a.createdAt);
}
export function listOverrides(): Override[] { return S.overrides.slice().reverse(); }
export function listRejections(): PhoneRejection[] { return S.rejections.slice().reverse(); }
export function listEvents(limit = 100): TrialGateEvent[] { return S.events.slice(0, limit); }

/** Sandbox only: the code a delivered send would have carried. */
export function demoInbox(challengeId: string): { sendId: string; channel: OtpChannel; code: string | null; deliveryStatus: string; deliveryReason: string | null; expiresAt: number }[] {
  const ch = S.challenges.get(challengeId);
  if (!ch) return [];
  return ch.sends.map((s) => ({ sendId: s.id, channel: s.channel, code: INBOX.get(s.id) ?? null, deliveryStatus: s.deliveryStatus, deliveryReason: s.deliveryReason, expiresAt: s.expiresAt }));
}

export function getStats(now: number = Date.now()): TrialGateStats {
  const evs = Array.from(S.evaluations.values());
  const chs = Array.from(S.challenges.values());
  const challenged = evs.filter((e) => e.decision === 'challenge').length;
  const verified = chs.filter((c) => c.state === 'verified' && !c.overrideId).length;
  const rejectionsByReason = (['voip', 'fictional', 'temp_provider', 'landline', 'reused', 'denylist'] as PhoneRejectReason[]).reduce((acc, r) => { acc[r] = S.rejections.filter((x) => x.reason === r).length; return acc; }, {} as Record<PhoneRejectReason, number>);
  const sendsByChannel = CHANNEL_ORDER.reduce((acc, c) => { acc[c] = { sent: 0, delivered: 0, failed: 0 }; return acc; }, {} as Record<OtpChannel, { sent: number; delivered: number; failed: number }>);
  let fallbacks = 0;
  chs.forEach((c) => c.sends.forEach((s) => { sendsByChannel[s.channel].sent += 1; sendsByChannel[s.channel][s.deliveryStatus] += 1; if (s.fallbackFrom) fallbacks += 1; }));
  const trippedByCondition = evs.reduce((acc, e) => { e.tripped.forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; }); return acc; }, {} as Record<RiskCondition, number>);
  const durations = chs.filter((c) => c.verifiedAt && !c.overrideId).map((c) => ((c.verifiedAt as number) - c.createdAt) / 1000).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  return {
    evaluations: evs.length,
    allowed: evs.filter((e) => e.decision === 'allow').length,
    challenged,
    exempt: evs.filter((e) => e.decision === 'exempt').length,
    challengeRate: evs.length ? Math.round((challenged / evs.length) * 100) : 0,
    verified,
    verifiedRate: challenged ? Math.round((verified / challenged) * 100) : 0,
    pending: chs.filter((c) => c.state === 'pending').length,
    locked: chs.filter((c) => c.state === 'locked' && (c.lockedUntil ?? 0) > now).length,
    overrides: S.overrides.length,
    phoneRejections: S.rejections.length,
    rejectionsByReason,
    sendsByChannel,
    fallbacks,
    trippedByCondition,
    medianSecondsToVerify: median === null ? null : Math.round(median),
  };
}

/** Classify a number without creating anything — used by the console's number checker. */
export function inspectPhone(raw: string, country: string): { normalized: NormalizedPhone | null; lineType: LineType | null; reason: string | null } {
  const p = normalizePhone(raw, country);
  if (!p) return { normalized: null, lineType: null, reason: null };
  const c = classifyLine(p);
  return { normalized: p, lineType: c.lineType, reason: c.reason };
}

/** Test/demo hook. */
export function __resetTrialGate(): void {
  S = fresh();
  PHONE_BY_CHALLENGE.clear();
  INBOX.clear();
}
