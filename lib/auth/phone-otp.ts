/**
 * Phone OTP for the trial gate — single source of truth (shared auth, portable).
 *
 * Everything about a phone check that is policy, not plumbing:
 *   - E.164 normalization with a small country table (default country inferred from IP);
 *   - the **temp-phone verifier**: line-type classification (mobile / landline / VoIP /
 *     fictional / temporary-SMS provider) plus reuse and deny-list rules, run *before*
 *     any code is sent;
 *   - OTP generation (6 digits, derived from a server secret + seed — never `Math.random`),
 *     hashing, TTL, attempt and send limits;
 *   - channels and fallback order **SMS → WhatsApp → voice**, with a per-country
 *     "SMS degraded" override that makes WhatsApp primary;
 *   - a deterministic delivery simulator the prototype uses in place of real providers
 *     (documented triggers: degraded country, national number ending in 99 → SMS
 *     carrier reject; ending in 98 → not on WhatsApp; voice always completes).
 *
 * Pure and deterministic; Edge/browser-safe (no Node APIs).
 */

import { sha256Hex, constantTimeEqual } from '@/lib/key-hashing';

// ── Countries ────────────────────────────────────────────────────────────────

export interface Country {
  iso: string;
  name: string;
  dial: string;
  /** Allowed national-number lengths. */
  national: [number, number];
}

export const COUNTRIES: Country[] = [
  { iso: 'IN', name: 'India', dial: '91', national: [10, 10] },
  { iso: 'US', name: 'United States', dial: '1', national: [10, 10] },
  { iso: 'CA', name: 'Canada', dial: '1', national: [10, 10] },
  { iso: 'GB', name: 'United Kingdom', dial: '44', national: [10, 10] },
  { iso: 'DE', name: 'Germany', dial: '49', national: [10, 11] },
  { iso: 'FR', name: 'France', dial: '33', national: [9, 9] },
  { iso: 'NL', name: 'Netherlands', dial: '31', national: [9, 9] },
  { iso: 'IE', name: 'Ireland', dial: '353', national: [9, 9] },
  { iso: 'SG', name: 'Singapore', dial: '65', national: [8, 8] },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', national: [9, 9] },
  { iso: 'AU', name: 'Australia', dial: '61', national: [9, 9] },
  { iso: 'BR', name: 'Brazil', dial: '55', national: [10, 11] },
  { iso: 'NG', name: 'Nigeria', dial: '234', national: [10, 10] },
  { iso: 'PK', name: 'Pakistan', dial: '92', national: [10, 10] },
  { iso: 'BD', name: 'Bangladesh', dial: '880', national: [10, 10] },
  { iso: 'JP', name: 'Japan', dial: '81', national: [10, 10] },
];
const BY_ISO = COUNTRIES.reduce((acc, c) => { acc[c.iso] = c; return acc; }, {} as Record<string, Country>);
export function countryByIso(iso: string): Country | null { return BY_ISO[iso.toUpperCase()] ?? null; }

const NAME_TO_ISO: Record<string, string> = {
  'india': 'IN', 'united states': 'US', 'usa': 'US', 'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB', 'germany': 'DE', 'france': 'FR',
  'netherlands': 'NL', 'ireland': 'IE', 'singapore': 'SG', 'united arab emirates': 'AE', 'australia': 'AU', 'brazil': 'BR', 'nigeria': 'NG',
  'pakistan': 'PK', 'bangladesh': 'BD', 'japan': 'JP',
};
/** Map a geolocation country name to our ISO table; unknown → India (home market). */
export function isoFromCountryName(name: string | null | undefined): string {
  return (name && NAME_TO_ISO[name.trim().toLowerCase()]) || 'IN';
}

// ── Normalization ────────────────────────────────────────────────────────────

export interface NormalizedPhone {
  e164: string;
  iso: string;
  dial: string;
  national: string;
}

/** Normalize user input to E.164. Accepts +, 00, or a national number in `defaultIso`. */
export function normalizePhone(raw: string, defaultIso: string): NormalizedPhone | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const intl = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  if (!/^\d{6,15}$/.test(digits)) return null;
  if (intl) {
    // Longest dial code first (3 → 1 digits).
    const sorted = COUNTRIES.slice().sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      if (digits.startsWith(c.dial)) {
        const national = digits.slice(c.dial.length);
        if (national.length >= c.national[0] && national.length <= c.national[1]) return { e164: `+${digits}`, iso: c.iso, dial: c.dial, national };
      }
    }
    return null;
  }
  const c = countryByIso(defaultIso) ?? BY_ISO.IN;
  const national = digits.replace(/^0+/, '');
  if (national.length < c.national[0] || national.length > c.national[1]) return null;
  return { e164: `+${c.dial}${national}`, iso: c.iso, dial: c.dial, national };
}

/** `+91 •••• ••42` — safe to show and store in the console. */
export function maskPhone(e164: string): string {
  if (!/^\+\d{7,15}$/.test(e164)) return '••••';
  const digits = e164.slice(1);
  const country = COUNTRIES.slice().sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
  const dial = country?.dial ?? digits.slice(0, 2);
  const nat = digits.slice(dial.length);
  return `+${dial} ${'•'.repeat(Math.max(2, nat.length - 2))}${nat.slice(-2)}`;
}

export function phoneHash(e164: string): string {
  return `sha256:${sha256Hex(`phone:${e164}`).slice(0, 16)}`;
}

// ── Temp-phone verifier ──────────────────────────────────────────────────────

export type LineType = 'mobile' | 'landline' | 'voip' | 'fictional' | 'temp_provider';
export type PhoneRejectReason = 'voip' | 'fictional' | 'temp_provider' | 'landline' | 'reused' | 'denylist';

export interface LineClassification { lineType: LineType; reason: string }

/** Publicly documented reserved / fictional / non-geographic ranges + temp-SMS heuristics. */
export function classifyLine(p: NormalizedPhone): LineClassification {
  const n = p.national;
  if (/^(\d)\1+$/.test(n)) return { lineType: 'temp_provider', reason: 'repeated-digit number — typical of receive-SMS sites' };
  if (/^(0?1234567|123456789)/.test(n)) return { lineType: 'temp_provider', reason: 'sequential digits — typical of receive-SMS sites' };
  if (p.iso === 'US' || p.iso === 'CA') {
    if (/^555/.test(n.slice(3, 6)) && /^01\d\d$/.test(n.slice(6))) return { lineType: 'fictional', reason: '555-01xx is a reserved fictional range' };
    if (/^(500|521|522|533|544|566|577|588|5[0-9]{2})/.test(n) && /^5/.test(n)) return { lineType: 'voip', reason: 'non-geographic 5xx area code (personal communications / VoIP)' };
    if (/^(?:[2-9]\d\d)(?:555)/.test(n)) return { lineType: 'fictional', reason: '555 exchange is reserved' };
  }
  if (p.iso === 'GB') {
    if (/^7700\s?9/.test(n) || /^77009/.test(n)) return { lineType: 'fictional', reason: '07700 900xxx is an Ofcom-reserved drama range' };
    if (/^70/.test(n)) return { lineType: 'voip', reason: '070 personal numbers are forwarding / virtual' };
    if (/^56/.test(n)) return { lineType: 'voip', reason: '056 is a VoIP range' };
    if (/^[12]/.test(n)) return { lineType: 'landline', reason: 'geographic landline' };
  }
  if (p.iso === 'IN') {
    if (/^99999/.test(n) || /^00000/.test(n)) return { lineType: 'temp_provider', reason: 'known receive-SMS number pattern' };
    if (/^[1-5]/.test(n)) return { lineType: 'landline', reason: 'STD-code landline' };
  }
  if (p.iso === 'DE' && /^(30|40|69|89)/.test(n)) return { lineType: 'landline', reason: 'geographic landline' };
  if (p.iso === 'FR' && /^[1-5]/.test(n)) return { lineType: 'landline', reason: 'geographic landline' };
  if (p.iso === 'AU' && /^[2378]/.test(n)) return { lineType: 'landline', reason: 'geographic landline' };
  // Deterministic carrier-lookup stand-in: ~4% of remaining numbers resolve as VoIP.
  const h = parseInt(sha256Hex(`line:${p.e164}`).slice(0, 4), 16);
  if (h % 100 < 4) return { lineType: 'voip', reason: 'carrier lookup: virtual / VoIP line' };
  return { lineType: 'mobile', reason: 'carrier lookup: mobile' };
}

export interface PhoneQualityContext {
  /** Verified another account within the reuse window. */
  reusedByOther: boolean;
  denylisted: boolean;
}

export type PhoneQuality =
  | { ok: true; lineType: LineType; reason: string }
  | { ok: false; lineType: LineType; reason: PhoneRejectReason; message: string };

const REJECT_MESSAGES: Record<PhoneRejectReason, string> = {
  voip: 'This looks like a virtual / VoIP number. Use a mobile number you control.',
  fictional: 'This number is in a reserved range that cannot receive messages.',
  temp_provider: 'This looks like a temporary number. Use a mobile number you control.',
  landline: 'Landlines cannot receive SMS or WhatsApp — use a mobile number, or choose the voice call option.',
  reused: 'This number already verified another account recently. Each account needs its own number.',
  denylist: 'This number cannot be used to verify an account.',
};

/** The gate that runs before any OTP is sent. Landlines are allowed only via voice. */
export function verifyPhoneQuality(p: NormalizedPhone, ctx: PhoneQualityContext, channel: OtpChannel = 'sms'): PhoneQuality {
  const cls = classifyLine(p);
  if (ctx.denylisted) return { ok: false, lineType: cls.lineType, reason: 'denylist', message: REJECT_MESSAGES.denylist };
  if (cls.lineType === 'voip' || cls.lineType === 'fictional' || cls.lineType === 'temp_provider') {
    return { ok: false, lineType: cls.lineType, reason: cls.lineType, message: REJECT_MESSAGES[cls.lineType] };
  }
  if (cls.lineType === 'landline' && channel !== 'voice') return { ok: false, lineType: 'landline', reason: 'landline', message: REJECT_MESSAGES.landline };
  if (ctx.reusedByOther) return { ok: false, lineType: cls.lineType, reason: 'reused', message: REJECT_MESSAGES.reused };
  return { ok: true, lineType: cls.lineType, reason: cls.reason };
}

// ── OTP ──────────────────────────────────────────────────────────────────────

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 3;
export const PHONE_REJECT_LOCK_THRESHOLD = 3;
export const PHONE_REJECT_LOCK_MS = 24 * 3_600_000;
export const PHONE_REUSE_WINDOW_DAYS = 180;

/** 6 digits derived from a server secret + a unique seed (challenge id + send sequence). */
export function generateOtp(secret: string, seed: string): string {
  const h = sha256Hex(`otp:${secret}:${seed}`);
  return String(parseInt(h.slice(0, 12), 16) % 1_000_000).padStart(OTP_LENGTH, '0');
}

export function hashOtp(code: string, salt: string): string {
  return sha256Hex(`otp-hash:${salt}:${code}`);
}

export function otpMatches(code: string, salt: string, storedHash: string): boolean {
  return constantTimeEqual(hashOtp(code.trim(), salt), storedHash);
}

export function isOtpShape(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim());
}

// ── Channels + fallback ──────────────────────────────────────────────────────

export type OtpChannel = 'sms' | 'whatsapp' | 'voice';
export const CHANNEL_ORDER: OtpChannel[] = ['sms', 'whatsapp', 'voice'];
export const CHANNEL_LABEL: Record<OtpChannel, string> = { sms: 'SMS', whatsapp: 'WhatsApp', voice: 'Voice call' };

export function nextChannel(current: OtpChannel): OtpChannel | null {
  const i = CHANNEL_ORDER.indexOf(current);
  return i >= 0 && i < CHANNEL_ORDER.length - 1 ? CHANNEL_ORDER[i + 1] : null;
}

/** SMS unless the destination country is on the degraded list — then WhatsApp leads. */
export function primaryChannel(iso: string, smsDegradedCountries: string[]): OtpChannel {
  return smsDegradedCountries.includes(iso.toUpperCase()) ? 'whatsapp' : 'sms';
}

export interface DeliveryOutcome {
  status: 'delivered' | 'failed';
  /** Provider-style reason on failure. */
  reason: string | null;
  latencyMs: number;
}

/**
 * Provider stand-in. Deterministic and documented so demos are repeatable:
 *   - SMS fails in a degraded country or when the national number ends in 99 (carrier reject);
 *   - WhatsApp fails when the national number ends in 98 (number not on WhatsApp);
 *   - voice always completes.
 */
export function simulateDelivery(channel: OtpChannel, p: NormalizedPhone, smsDegradedCountries: string[]): DeliveryOutcome {
  const jitter = parseInt(sha256Hex(`lat:${channel}:${p.e164}`).slice(0, 3), 16) % 900;
  if (channel === 'sms') {
    if (smsDegradedCountries.includes(p.iso)) return { status: 'failed', reason: `SMS delivery degraded in ${p.iso} (carrier filtering)`, latencyMs: 4_000 + jitter };
    if (p.national.endsWith('99')) return { status: 'failed', reason: 'carrier rejected message (30008)', latencyMs: 2_500 + jitter };
    return { status: 'delivered', reason: null, latencyMs: 1_200 + jitter };
  }
  if (channel === 'whatsapp') {
    if (p.national.endsWith('98')) return { status: 'failed', reason: 'recipient is not a WhatsApp user (131026)', latencyMs: 1_800 + jitter };
    return { status: 'delivered', reason: null, latencyMs: 900 + jitter };
  }
  return { status: 'delivered', reason: null, latencyMs: 6_000 + jitter };
}
