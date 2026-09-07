/**
 * Field-level PII masking — single source of truth (F-313).
 *
 * The gateway already masks live-key responses for compliance; this elevates that
 * from a fixed email/phone redaction into a *governed, per-field policy*: for each
 * kind of PII the org picks a masking strategy (leave it, partially reveal it,
 * fully redact it, hash it, or tokenize it), and the gateway applies that policy to
 * live (`sk_live_`) responses — sandbox (`sk_test_`) stays unmasked for easy testing
 * (mirrors the masking split used across the product).
 *
 * Everything here is pure and deterministic (FNV, no `Math.random`) so the console
 * preview, the gateway, and the tests all agree: a given value + strategy always
 * masks to the same string. Hashes/tokens are non-reversible display artifacts, not
 * real cryptographic tokenization.
 *
 * The policy itself lives in the dedicated persisted `useMaskingPolicy` store below
 * (its own localStorage key — not the tenant store), like the other cross-cutting
 * security stores (MFA policy, login guard, encryption settings).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ── Types ────────────────────────────────────────────────────────────────────

/** The kinds of PII the masking policy governs. */
export type PiiFieldType =
  | 'email' | 'phone' | 'full_name' | 'street_address' | 'ip_address'
  | 'date_of_birth' | 'government_id' | 'linkedin_url';

/** How a field is masked. Ordered weakest → strongest for scoring. */
export type MaskStrategy = 'none' | 'partial' | 'hash' | 'tokenize' | 'redact';

export interface PiiFieldSpec {
  type: PiiFieldType;
  label: string;
  /** Regexes (lowercased key) that map a response key to this PII type. */
  keyPatterns: RegExp[];
  /** The strongest strategy an org may relax *to* (sensitive types can't be 'none'). */
  minStrategy: MaskStrategy;
  /** The shipped default (mask-by-default on live). */
  defaultStrategy: MaskStrategy;
  description: string;
}

export interface MaskingPolicy {
  /** field type → chosen strategy. */
  strategies: Record<PiiFieldType, MaskStrategy>;
  /** Master switch — masking is on for live keys by default. */
  enabled: boolean;
}

/** An untrusted partial policy update (from a PATCH body or the console). */
export interface MaskingPatch {
  enabled?: boolean;
  strategies?: Partial<Record<PiiFieldType, MaskStrategy>>;
}

export interface MaskFieldResult {
  key: string;
  type: PiiFieldType;
  strategy: MaskStrategy;
  before: string;
  after: string;
}

export interface MaskPayloadResult {
  masked: unknown;
  /** Distinct field keys that were masked (for the X-PII-Masked header + preview). */
  maskedKeys: string[];
  fields: MaskFieldResult[];
}

// ── Deterministic hashing (FNV-1a; shared style with lib/encryption) ──────────

export function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** A stable base32 token of `len` chars from a seed (non-reversible display token). */
function token(seed: string, len: number): string {
  let out = '';
  let i = 0;
  while (out.length < len) {
    let h = fnv(`${seed}:${i}`);
    for (let s = 0; s < 6 && out.length < len; s++) { out += B32[h % 32]; h = Math.floor(h / 32); }
    i++;
  }
  return out;
}

// ── Field catalog ─────────────────────────────────────────────────────────────

const MASK_ORDER: MaskStrategy[] = ['none', 'partial', 'hash', 'tokenize', 'redact'];
export function strategyRank(s: MaskStrategy): number { return MASK_ORDER.indexOf(s); }

/**
 * The PII catalog. `keyPatterns` match a response object key (lowercased). Ordered
 * so the most specific patterns win when a key could match more than one type.
 */
export const PII_CATALOG: PiiFieldSpec[] = [
  {
    type: 'email', label: 'Email address', keyPatterns: [/email/, /e_?mail/],
    minStrategy: 'partial', defaultStrategy: 'partial',
    description: 'Work and personal email addresses.',
  },
  {
    type: 'phone', label: 'Phone number', keyPatterns: [/phone/, /mobile/, /telephone/],
    minStrategy: 'partial', defaultStrategy: 'partial',
    description: 'Direct-dial and mobile numbers.',
  },
  {
    type: 'government_id', label: 'Government ID', keyPatterns: [/ssn/, /social_?security/, /passport/, /national_?id/, /tax_?id/],
    minStrategy: 'redact', defaultStrategy: 'redact',
    description: 'SSN, passport, national/tax IDs — never returned in the clear.',
  },
  {
    type: 'date_of_birth', label: 'Date of birth', keyPatterns: [/date_?of_?birth/, /\bdob\b/, /birth_?date/],
    minStrategy: 'redact', defaultStrategy: 'redact',
    description: 'Full date of birth.',
  },
  {
    type: 'street_address', label: 'Street address', keyPatterns: [/street/, /address_?line/, /\baddress\b/],
    minStrategy: 'partial', defaultStrategy: 'partial',
    description: 'Street-level postal address (city/country are not masked).',
  },
  {
    type: 'ip_address', label: 'IP address', keyPatterns: [/ip_?address/, /\bip\b/, /client_?ip/],
    minStrategy: 'none', defaultStrategy: 'partial',
    description: 'Source IP addresses.',
  },
  {
    type: 'full_name', label: 'Full name', keyPatterns: [/full_?name/, /\bname\b/, /first_?name/, /last_?name/],
    minStrategy: 'none', defaultStrategy: 'partial',
    description: 'Personal names (company names are not masked).',
  },
  {
    type: 'linkedin_url', label: 'Social profile', keyPatterns: [/linkedin/, /twitter/, /social_?url/, /profile_?url/],
    minStrategy: 'none', defaultStrategy: 'none',
    description: 'Public social-profile URLs.',
  },
];

const CATALOG_BY_TYPE: Record<PiiFieldType, PiiFieldSpec> =
  PII_CATALOG.reduce((acc, s) => { acc[s.type] = s; return acc; }, {} as Record<PiiFieldType, PiiFieldSpec>);

export function fieldSpec(type: PiiFieldType): PiiFieldSpec { return CATALOG_BY_TYPE[type]; }

/** Can this field's strategy be lowered to `to`? (Respects `minStrategy` floor.) */
export function isStrategyAllowed(type: PiiFieldType, to: MaskStrategy): boolean {
  const spec = CATALOG_BY_TYPE[type];
  if (!spec) return false;
  return strategyRank(to) >= strategyRank(spec.minStrategy);
}

/** Match a response key to a PII type, or null if it isn't PII. */
export function classifyKey(key: string): PiiFieldType | null {
  const k = key.toLowerCase();
  for (const spec of PII_CATALOG) {
    if (spec.keyPatterns.some((re) => re.test(k))) return spec.type;
  }
  return null;
}

// ── Default policy ─────────────────────────────────────────────────────────────

export function defaultPolicy(): MaskingPolicy {
  const strategies = PII_CATALOG.reduce((acc, s) => { acc[s.type] = s.defaultStrategy; return acc; }, {} as Record<PiiFieldType, MaskStrategy>);
  return { enabled: true, strategies };
}

/** Fill any missing types from defaults and clamp each strategy to its floor. */
export function normalizePolicy(partial: MaskingPatch | undefined): MaskingPolicy {
  const base = defaultPolicy();
  if (!partial) return base;
  const strategies = { ...base.strategies };
  if (partial.strategies) {
    for (const spec of PII_CATALOG) {
      const chosen = partial.strategies[spec.type];
      if (chosen && MASK_ORDER.includes(chosen)) {
        strategies[spec.type] = isStrategyAllowed(spec.type, chosen) ? chosen : spec.minStrategy;
      }
    }
  }
  return { enabled: partial.enabled ?? base.enabled, strategies };
}

/**
 * Narrow an untrusted PATCH body into a clean patch — unknown fields/strategies and
 * below-floor choices are dropped (never thrown), so a sync can't corrupt the policy.
 */
export function normalizeMaskingPatch(body: unknown): MaskingPatch {
  const out: MaskingPatch = {};
  if (typeof body !== 'object' || body === null) return out;
  const rec = body as Record<string, unknown>;
  if (typeof rec.enabled === 'boolean') out.enabled = rec.enabled;
  if (typeof rec.strategies === 'object' && rec.strategies !== null) {
    const strat: Partial<Record<PiiFieldType, MaskStrategy>> = {};
    const src = rec.strategies as Record<string, unknown>;
    for (const spec of PII_CATALOG) {
      const v = src[spec.type];
      if (typeof v === 'string' && (MASK_ORDER as string[]).includes(v) && isStrategyAllowed(spec.type, v as MaskStrategy)) {
        strat[spec.type] = v as MaskStrategy;
      }
    }
    if (Object.keys(strat).length) out.strategies = strat;
  }
  return out;
}

// ── Value masking ───────────────────────────────────────────────────────────

function maskEmail(v: string): string {
  const at = v.indexOf('@');
  if (at < 1) return maskPartial(v);
  const name = v.slice(0, at);
  const domain = v.slice(at + 1);
  const head = name.length <= 2
    ? `${name[0]}${'•'.repeat(Math.max(1, name.length))}`
    : `${name[0]}${'•'.repeat(3)}${name[name.length - 1]}`;
  return `${head}@${domain}`;
}

function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  return `•••‑•••‑${digits.slice(-4)}`;
}

function maskPartial(v: string): string {
  if (v.length <= 2) return '•'.repeat(v.length || 1);
  if (v.length <= 4) return `${v[0]}${'•'.repeat(v.length - 1)}`;
  return `${v.slice(0, 2)}${'•'.repeat(Math.max(3, v.length - 4))}${v.slice(-2)}`;
}

/** Apply a strategy to one value for a given PII type. Deterministic. */
export function maskValue(value: string, type: PiiFieldType, strategy: MaskStrategy): string {
  switch (strategy) {
    case 'none': return value;
    case 'redact': return '•••••••';
    case 'hash': return `sha256:${token(`hash:${type}:${value}`, 12)}`;
    case 'tokenize': return `tok_${token(`tok:${type}:${value}`, 16)}`;
    case 'partial':
      if (type === 'email') return maskEmail(value);
      if (type === 'phone') return maskPhone(value);
      return maskPartial(value);
    default: return value;
  }
}

/**
 * Walk a payload and mask every string value whose key classifies as PII, per the
 * policy. Returns the masked clone plus the list of masked keys/fields. Pure — the
 * input is never mutated.
 */
export function maskPayload(payload: unknown, policy: MaskingPolicy): MaskPayloadResult {
  const fields: MaskFieldResult[] = [];
  const maskedKeys = new Set<string>();
  if (!policy.enabled || payload == null) return { masked: payload, maskedKeys: [], fields };

  const clone: unknown = JSON.parse(JSON.stringify(payload));

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object' || node === null) return;
    const rec = node as Record<string, unknown>;
    for (const key in rec) {
      const value = rec[key];
      if (typeof value === 'string') {
        const type = classifyKey(key);
        if (type) {
          const strategy = policy.strategies[type] ?? fieldSpec(type).defaultStrategy;
          if (strategy !== 'none') {
            const after = maskValue(value, type, strategy);
            if (after !== value) {
              rec[key] = after;
              maskedKeys.add(key);
              fields.push({ key, type, strategy, before: value, after });
            }
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        walk(value);
      }
    }
  };

  walk(clone);
  return { masked: clone, maskedKeys: Array.from(maskedKeys), fields };
}

/** How strong a policy is, 0–100 (avg strategy rank across the catalog, if enabled). */
export function policyStrength(policy: MaskingPolicy): number {
  if (!policy.enabled) return 0;
  const max = strategyRank('redact');
  const sum = PII_CATALOG.reduce((s, spec) => s + strategyRank(policy.strategies[spec.type] ?? spec.defaultStrategy), 0);
  return Math.round((sum / (PII_CATALOG.length * max)) * 100);
}

// ── A representative sample record for the console preview ────────────────────

export const SAMPLE_RECORD: Record<string, unknown> = {
  full_name: 'Jordan Rivera',
  email: 'jordan.rivera@northwind.io',
  phone: '+1 415 555 0142',
  linkedin_url: 'https://linkedin.com/in/jordanrivera',
  company: 'Northwind Traders',
  title: 'VP of Engineering',
  location: { city: 'San Francisco', country: 'US', ip_address: '198.51.100.24', street_address: '2100 Market St' },
  date_of_birth: '1987-03-14',
  government_id: '123-45-6789',
};

// ── Persisted policy store (own key, not the tenant store) ────────────────────

export interface MaskingPolicyState {
  enabled: boolean;
  strategies: Record<PiiFieldType, MaskStrategy>;
  setEnabled: (enabled: boolean) => void;
  setStrategy: (type: PiiFieldType, strategy: MaskStrategy) => void;
  resetPolicy: () => void;
  policy: () => MaskingPolicy;
}

export const useMaskingPolicy = create<MaskingPolicyState>()(
  persist(
    (set, get) => ({
      ...defaultPolicy(),
      setEnabled: (enabled) => set({ enabled }),
      setStrategy: (type, strategy) => set((s) => {
        // Enforce the floor in the store, not just the UI.
        if (!isStrategyAllowed(type, strategy)) return {};
        return { strategies: { ...s.strategies, [type]: strategy } };
      }),
      resetPolicy: () => set(defaultPolicy()),
      policy: () => ({ enabled: get().enabled, strategies: get().strategies }),
    }),
    { name: 'zinbit-pii-masking', storage: createJSONStorage(() => localStorage) },
  ),
);
