/**
 * Phone append & verification — deterministic mock (single source of truth).
 *
 * Given an email, appends a plausible phone number and enriches it with the
 * verification depth real carriers expose: line type, live status, carrier,
 * region, Do-Not-Call (DNC) standing, and a reachability score. Fully
 * deterministic per email (same input → same output) so the UI never flickers
 * on re-render. Builds on `resolvePersonFromEmail` for the base identity.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';

export type PhoneLineType = 'mobile' | 'direct_dial' | 'landline' | 'voip';
export type PhoneVerificationStatus = 'verified' | 'unverified' | 'unreachable';

export interface PhoneProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface PhoneVerification {
  email: string;
  /** E.164-style number, e.g. "+1 (415) 555-0132". */
  phone: string;
  /** National format, e.g. "(415) 555-0132". */
  phone_national: string;
  line_type: PhoneLineType;
  /** True only when the line is carrier-confirmed live. */
  verified: boolean;
  verification_status: PhoneVerificationStatus;
  carrier: string;
  /** ISO country code, e.g. "US" / "IN". */
  country: string;
  /** Human region, e.g. "California, US". */
  region: string;
  /** On a national Do-Not-Call registry — do not auto-dial. */
  dnc: boolean;
  /** Convenience inverse of `dnc` — safe to dial. */
  dnc_safe: boolean;
  /** Likelihood the line is reachable right now, 0..1. */
  reachability: number;
  /** Overall confidence in the appended number, 0..1. */
  confidence: number;
  /** ISO date the number was last verified. */
  last_verified: string;
  provenance: PhoneProvenance[];
}

/** FNV-1a — small deterministic string hash (distinct stream from the resolver's). */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MOBILE_CARRIERS = ['Verizon Wireless', 'AT&T Mobility', 'T-Mobile US', 'Airtel', 'Jio', 'Vodafone Idea'];
const FIXED_CARRIERS = ['Comcast Business', 'BT Group', 'Tata Teleservices'];
const LINE_TYPES: PhoneLineType[] = ['mobile', 'direct_dial', 'mobile', 'landline', 'voip', 'mobile'];
const REGIONS: { country: string; region: string }[] = [
  { country: 'US', region: 'California, US' },
  { country: 'US', region: 'New York, US' },
  { country: 'IN', region: 'Karnataka, IN' },
  { country: 'IN', region: 'Maharashtra, IN' },
  { country: 'GB', region: 'England, GB' },
  { country: 'US', region: 'Texas, US' },
];

const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));

export function verifyPhoneForEmail(rawEmail: string): PhoneVerification | null {
  const person = resolvePersonFromEmail(rawEmail);
  if (!person) return null;

  const email = rawEmail.trim().toLowerCase();
  const h = hash(email);

  const line_type = LINE_TYPES[h % LINE_TYPES.length];
  const isFixed = line_type === 'landline' || line_type === 'voip';
  const carrier = isFixed
    ? FIXED_CARRIERS[(h >>>3) % FIXED_CARRIERS.length]
    : MOBILE_CARRIERS[(h >>>3) % MOBILE_CARRIERS.length];
  const { country, region } = REGIONS[(h >>>6) % REGIONS.length];

  const verified = person.phone_verified;
  const dnc = ((h >>>9) % 100) < 12; // ~12% land on a DNC registry
  const reachability = verified
    ? clamp01(0.72 + ((h >>>11) % 24) / 100)
    : clamp01(0.5 - ((h >>>11) % 30) / 100);
  const verification_status: PhoneVerificationStatus = verified
    ? 'verified'
    : reachability < 0.35
      ? 'unreachable'
      : 'unverified';

  const phone_national = person.phone.replace(/^\+\d+\s*/, '');
  const lineWords = line_type.replace('_', ' ');

  return {
    email,
    phone: person.phone,
    phone_national,
    line_type,
    verified,
    verification_status,
    carrier,
    country,
    region,
    dnc,
    dnc_safe: !dnc,
    reachability,
    confidence: person.confidence,
    last_verified: person.last_verified,
    provenance: [
      {
        field: 'phone',
        source: 'Carrier HLR lookup',
        signal: verified
          ? `Active ${lineWords} line, ${carrier}-confirmed`
          : 'Number allocated; live status unconfirmed',
        confidence: verified ? 0.95 : 0.6,
      },
      {
        field: 'line_type',
        source: 'Number intelligence',
        signal: `${lineWords} block operated by ${carrier}`,
        confidence: 0.9,
      },
      {
        field: 'dnc',
        source: 'DNC registry check',
        signal: dnc ? 'Listed on a national Do-Not-Call registry' : 'Not on any Do-Not-Call registry',
        confidence: 0.97,
      },
    ],
  };
}
