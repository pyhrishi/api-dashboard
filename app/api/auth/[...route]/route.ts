import { NextRequest, NextResponse } from 'next/server';
import {
  evaluate, createChallenge, resend, verify, abandon, getChallengeForAccount, getChallenge, override, getPolicy, updatePolicy,
  listChallenges, listOverrides, listRejections, listEvents, listDirectory, getStats, demoInbox, inspectPhone,
  type ChallengeError, type Result,
} from '@/lib/auth/trial-gate-service';
import { SIGNUP_PERSONAS } from '@/lib/auth/trial-gate';
import { COUNTRIES, isoFromCountryName } from '@/lib/auth/phone-otp';
import { resolveCompanyFromIp } from '@/lib/ip-resolver';

/**
 * Shared-auth routes for the risk-based trial gate (prototype of the auth repo's
 * public surface). Deliberately outside `/api/v1` — these are identity calls, not
 * billed enrichment. Envelope matches the gateway: `{ success, data | error, metadata }`.
 *
 *   POST  /auth/trial/evaluate               { accountId, productId?, email, company, ip?, referralCode?, exemptions? }
 *   POST  /auth/phone/challenge              { accountId, evaluationId, phone, country }
 *   POST  /auth/phone/resend                 { challengeId, channel? }
 *   POST  /auth/phone/verify                 { challengeId, code }
 *   POST  /auth/phone/abandon                { challengeId }
 *   GET   /auth/phone/challenge/:accountId
 *   POST  /auth/phone/inspect                { phone, country }            (number checker, creates nothing)
 *   POST  /auth/phone/override               { accountId, action, reason, actorId? }
 *   GET|PATCH /auth/policy/:productId
 *   GET   /auth/challenges · /auth/overrides · /auth/rejections · /auth/events · /auth/directory · /auth/stats · /auth/personas · /auth/countries
 *   GET   /auth/demo/inbox/:challengeId       (sandbox: the code a delivered send carried)
 */
export const dynamic = 'force-dynamic';

const STATUS: Record<ChallengeError['code'], number> = {
  EVALUATION_NOT_FOUND: 404, NOT_CHALLENGED: 409, ALREADY_VERIFIED: 409, PHONE_INVALID: 400, PHONE_LOCKED: 429, PHONE_REJECTED: 422,
  SEND_LIMIT: 429, CHALLENGE_NOT_FOUND: 404, CHALLENGE_CLOSED: 409, NO_ACTIVE_CODE: 409, CODE_INVALID_SHAPE: 400, CODE_EXPIRED: 410,
  ATTEMPTS_EXCEEDED: 429, CODE_INVALID: 400,
};

const headers = { 'Cache-Control': 'no-store' };
const meta = () => ({ requestId: `auth_${Date.now().toString(36)}`, timestamp: Date.now() });
const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data, metadata: meta() }, { status, headers });
const fail = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  NextResponse.json({ success: false, error: { code, message, ...(details ? { details } : {}) }, metadata: meta() }, { status, headers });
const fromResult = <T,>(r: Result<T>, okStatus = 200) => {
  if (r.ok) return ok(r.data, okStatus);
  const { code, message, ...rest } = r.error;
  return fail(STATUS[code], code, message, Object.keys(rest).length ? (rest as Record<string, unknown>) : undefined);
};

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { const b = await request.json(); return b && typeof b === 'object' ? (b as Record<string, unknown>) : null; } catch { return null; }
}
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function clientIp(request: NextRequest, fallback: string): string {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip') ?? '';
  return fallback || (ip && ip !== '::1' && ip !== '127.0.0.1' ? ip : '203.0.113.7');
}

export async function GET(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b, c] = params.route;
  if (a === 'phone' && b === 'challenge' && c) return ok(getChallengeForAccount(c));
  if (a === 'policy') return ok(getPolicy(b || 'zinbit'));
  if (a === 'challenges') return ok(listChallenges());
  if (a === 'overrides') return ok(listOverrides());
  if (a === 'rejections') return ok(listRejections());
  if (a === 'events') return ok(listEvents(Number(request.nextUrl.searchParams.get('limit') ?? 100) || 100));
  if (a === 'directory') return ok(listDirectory());
  if (a === 'stats') return ok(getStats());
  if (a === 'personas') return ok(SIGNUP_PERSONAS);
  if (a === 'countries') return ok(COUNTRIES);
  if (a === 'demo' && b === 'inbox' && c) {
    const ch = getChallenge(c);
    if (!ch) return fail(404, 'CHALLENGE_NOT_FOUND', 'Unknown challenge.');
    return ok({ sandbox: true, note: 'Prototype only — no SMS/WhatsApp/voice provider is wired. Production never exposes codes.', messages: demoInbox(c) });
  }
  return fail(404, 'NOT_FOUND', 'Unknown auth route.');
}

export async function POST(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b] = params.route;
  const rec = await body(request);
  if (!rec) return fail(400, 'VALIDATION_ERROR', 'Send a JSON object.');

  if (a === 'trial' && b === 'evaluate') {
    const email = str(rec.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'VALIDATION_ERROR', 'A valid email is required.');
    const ip = clientIp(request, str(rec.ip));
    const accountId = str(rec.accountId) || `acct_${email.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;
    const ex = rec.exemptions && typeof rec.exemptions === 'object' ? (rec.exemptions as Record<string, unknown>) : {};
    const ev = evaluate({
      accountId, email, company: str(rec.company), ip, referralCode: str(rec.referralCode) || undefined, productId: str(rec.productId) || 'zinbit',
      exemptions: { paymentVerified: ex.paymentVerified === true, enterpriseContract: ex.enterpriseContract === true, phoneVerified: ex.phoneVerified === true },
      simulate: rec.simulate === true,
    });
    const geo = resolveCompanyFromIp(ip);
    return ok({ evaluation: ev, suggestedCountry: isoFromCountryName(geo?.country) });
  }
  if (a === 'phone' && b === 'challenge') {
    return fromResult(createChallenge({ accountId: str(rec.accountId), evaluationId: str(rec.evaluationId), phone: str(rec.phone), country: str(rec.country) || 'IN' }), 201);
  }
  if (a === 'phone' && b === 'resend') {
    const ch = str(rec.channel);
    return fromResult(resend(str(rec.challengeId), ch === 'sms' || ch === 'whatsapp' || ch === 'voice' ? ch : undefined));
  }
  if (a === 'phone' && b === 'verify') return fromResult(verify(str(rec.challengeId), str(rec.code)));
  if (a === 'phone' && b === 'abandon') return ok(abandon(str(rec.challengeId)));
  if (a === 'phone' && b === 'inspect') return ok(inspectPhone(str(rec.phone), str(rec.country) || 'IN'));
  if (a === 'phone' && b === 'override') {
    const action = str(rec.action);
    if (action !== 'allow' && action !== 'deny') return fail(400, 'VALIDATION_ERROR', "action must be 'allow' or 'deny'.");
    return fromResult(override(str(rec.accountId), action, str(rec.actorId) || 'support', str(rec.reason), str(rec.productId) || 'zinbit'), 201);
  }
  return fail(404, 'NOT_FOUND', 'Unknown auth route.');
}

export async function PATCH(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b] = params.route;
  if (a !== 'policy') return fail(404, 'NOT_FOUND', 'Unknown auth route.');
  const rec = await body(request);
  if (!rec) return fail(400, 'VALIDATION_ERROR', 'Send a JSON object of policy fields: { conditionsEnabled, smallCompanyThreshold, duplicateIpWindowDays, domainAgeMinDays, smsDegradedCountries, sharedEgressAllowlist, fallbackAfterSeconds, referralWaivesSmallCompany }.');
  return ok(updatePolicy(b || 'zinbit', rec));
}
