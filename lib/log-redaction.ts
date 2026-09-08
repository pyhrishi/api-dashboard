/**
 * PII redaction in internal logs — single source of truth (F-322).
 *
 * The gateway writes structured log lines (stdout → SIEM). None of them may carry
 * a caller's PII or a secret. This module is the *one* redaction engine behind that
 * promise, and it runs unchanged in three places so they provably agree:
 *   - the **gateway** (`src/lib/gateway/logRedaction.ts`) — the only path to stdout;
 *   - the **console** (`/console/log-redaction`) — the Redaction Tester runs the same
 *     function in the browser, so "what would the gateway strip?" is not a guess;
 *   - the **tests** — a canary record proves every detector, every time.
 *
 * Two detectors, one catalog:
 *   - **key-based** — a field whose *name* classifies as PII (reuses the F-313
 *     `PII_CATALOG` so masking and log redaction never disagree on what PII is) or
 *     as a secret (`authorization`, `api_key`, `token`, …, plus the org's custom keys);
 *   - **value-based** — free text (URLs, messages, notes) scanned for emails, phones,
 *     government IDs (SSN, Aadhaar, PAN), payment cards (Luhn + IIN), IPs, social
 *     URLs, API keys, bearer tokens and JWTs.
 *
 * Three strategies, strongest → weakest: `drop` (`[email:redacted]`), `token`
 * (`[email:tk_9f3a1c…]` — a deterministic per-org pseudonym so the *same* email is
 * the *same* token across log lines: incidents stay traceable without the PII),
 * `partial` (F-313's partial mask). Each type has an un-relaxable floor; secrets
 * are never configurable — they become the `sha256:` key fingerprint (Key Hashing), the
 * same identity every gateway registry uses. There is no master off switch — by design.
 *
 * The engine is pure and deterministic (SHA-256 from `lib/key-hashing`, no
 * `Math.random`, no Node APIs) so it runs on Edge, in Node and in the browser. The
 * persisted policy store at the bottom is browser-only (localStorage), like the other
 * cross-cutting security stores.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { classifyKey, maskValue, type PiiFieldType } from '@/lib/pii-masking';
import { sha256Hex, keyFingerprint } from '@/lib/key-hashing';
import { API_BASE_URL } from '@/lib/api-config';

// ── Types ────────────────────────────────────────────────────────────────────

/** What log redaction detects: the F-313 PII types plus payment cards and secrets. */
export type LogPiiType = PiiFieldType | 'credit_card' | 'secret';
/** How a detected value is written to the log. Ordered weakest → strongest. */
export type LogRedactStrategy = 'partial' | 'token' | 'drop';
export type LogDetector = 'key' | 'value';
export type LogRetentionDays = 7 | 30 | 90;
export const RETENTION_OPTIONS: readonly LogRetentionDays[] = [7, 30, 90];
/** How many redacted lines the gateway keeps per org (the tail served by GET /v1/logs/redaction). */
export const TAIL_CAPACITY = 40;

export interface LogPiiSpec {
  type: LogPiiType;
  label: string;
  /** The weakest strategy an org may relax *to*. */
  minStrategy: LogRedactStrategy;
  defaultStrategy: LogRedactStrategy;
  /** False → the strategy is fixed (shown, not editable). */
  configurable: boolean;
  /** True when the type is also found inside free text, not only by field name. */
  valueDetection: boolean;
  description: string;
  /** A synthetic value used by the self-test — never real data. */
  canary: string;
}

export interface LogRedactionPolicy {
  strategies: Record<LogPiiType, LogRedactStrategy>;
  /** Field names (lowercased) always treated as secrets — merged with the built-ins. */
  customKeys: string[];
  /** Field names (lowercased) exempt from *key-based* PII classification. Values are still scanned. */
  allowKeys: string[];
  retentionDays: LogRetentionDays;
}

/** An untrusted partial update (PATCH body or console). */
export interface LogRedactionPatch {
  strategies?: Partial<Record<LogPiiType, LogRedactStrategy>>;
  customKeys?: string[];
  allowKeys?: string[];
  retentionDays?: LogRetentionDays;
}

/** One redaction that happened. Carries what was *written*, never what was removed. */
export interface RedactionFinding {
  /** JSON path of the field, e.g. `parameters.email` or `body.contacts[2].phone`. */
  path: string;
  type: LogPiiType;
  detector: LogDetector;
  strategy: LogRedactStrategy;
  /** The replacement as written to the log. */
  after: string;
}

export interface RedactLogResult {
  redacted: unknown;
  findings: RedactionFinding[];
  counts: Record<LogPiiType, number>;
  total: number;
}

export interface SelfTestCheck {
  type: LogPiiType;
  label: string;
  detector: LogDetector | 'both';
  /** How many canary occurrences were redacted. */
  redacted: number;
  /** True when the raw canary value still appears in the output — must be false. */
  survived: boolean;
  after: string;
}

export interface SelfTestResult {
  checks: SelfTestCheck[];
  leaks: number;
  passed: boolean;
}

/** A structured line exactly as the gateway wrote it (already redacted). */
export interface RedactedLogLine {
  id: string;
  at: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  requestId: string | null;
  /** Values stripped from this line. */
  findings: number;
  types: LogPiiType[];
  /** The first few replacements as written (e.g. `[email:tk_9f3a1c2b4d5e]`) — lets a reader spot the same token across lines. */
  preview: string[];
  /** The exact JSON string written to stdout. */
  line: string;
}

export interface LogRedactionMetrics {
  /** Lines written (for this org) since the gateway isolate started. */
  lines: number;
  /** Values stripped across those lines. */
  findings: number;
  byType: Record<LogPiiType, number>;
  lastLineAt: number | null;
}

/** Shape of `GET /v1/logs/redaction`. */
export interface LogRedactionReport {
  org: string;
  policy: LogRedactionPolicy;
  strength: number;
  metrics: LogRedactionMetrics;
  tail: RedactedLogLine[];
  selfTest: SelfTestResult;
  posture: typeof LOG_REDACTION_POSTURE;
  generatedAt: number;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const STRATEGY_ORDER: LogRedactStrategy[] = ['partial', 'token', 'drop'];
export function strategyRank(s: LogRedactStrategy): number { return STRATEGY_ORDER.indexOf(s); }
export const ALL_STRATEGIES: readonly LogRedactStrategy[] = STRATEGY_ORDER;

/**
 * Ordered by scan priority: secrets and IDs first so a later, looser pattern never
 * sees text an earlier one should have consumed (e.g. an IP is not a phone).
 */
export const LOG_PII_CATALOG: LogPiiSpec[] = [
  {
    type: 'secret', label: 'Secrets & credentials', minStrategy: 'drop', defaultStrategy: 'drop', configurable: false, valueDetection: true,
    description: 'API keys, bearer tokens, JWTs, passwords, cookies — written as their sha256: fingerprint (the same identity Key Hashing uses) so a leaked key is identifiable, never recoverable.',
    canary: 'sk_live_canary0000000000000001',
  },
  {
    type: 'credit_card', label: 'Payment card', minStrategy: 'drop', defaultStrategy: 'drop', configurable: false, valueDetection: true,
    description: '13–19 digit PANs with a valid issuer prefix and Luhn checksum.',
    canary: '4111 1111 1111 1111',
  },
  {
    type: 'government_id', label: 'Government ID', minStrategy: 'drop', defaultStrategy: 'drop', configurable: false, valueDetection: true,
    description: 'SSN, Aadhaar and PAN formats, plus any field named like an ID.',
    canary: '123-45-6789',
  },
  {
    type: 'date_of_birth', label: 'Date of birth', minStrategy: 'drop', defaultStrategy: 'drop', configurable: false, valueDetection: false,
    description: 'Fields named like a birth date. Dates in free text are not treated as PII.',
    canary: '1987-03-14',
  },
  {
    type: 'email', label: 'Email address', minStrategy: 'partial', defaultStrategy: 'token', configurable: true, valueDetection: true,
    description: 'Any email, in a field or inside a URL or message.',
    canary: 'jordan.rivera@northwind.io',
  },
  {
    type: 'ip_address', label: 'IP address', minStrategy: 'partial', defaultStrategy: 'token', configurable: true, valueDetection: true,
    description: 'IPv4 source addresses.',
    canary: '198.51.100.24',
  },
  {
    type: 'phone', label: 'Phone number', minStrategy: 'partial', defaultStrategy: 'token', configurable: true, valueDetection: true,
    description: 'E.164 and formatted numbers with 10–15 digits; dates and timestamps are excluded.',
    canary: '+1 415 555 0142',
  },
  {
    type: 'linkedin_url', label: 'Social profile', minStrategy: 'partial', defaultStrategy: 'partial', configurable: true, valueDetection: true,
    description: 'LinkedIn / X profile URLs.',
    canary: 'https://linkedin.com/in/jordanrivera',
  },
  {
    type: 'full_name', label: 'Full name', minStrategy: 'partial', defaultStrategy: 'token', configurable: true, valueDetection: false,
    description: 'Fields named like a personal name. Names in free text are out of scope (no NER).',
    canary: 'Jordan Rivera',
  },
  {
    type: 'street_address', label: 'Street address', minStrategy: 'partial', defaultStrategy: 'token', configurable: true, valueDetection: false,
    description: 'Street-level address fields (city/country are not PII).',
    canary: '2100 Market St',
  },
];

const SPEC_BY_TYPE = LOG_PII_CATALOG.reduce((acc, s) => { acc[s.type] = s; return acc; }, {} as Record<LogPiiType, LogPiiSpec>);
export function logPiiSpec(type: LogPiiType): LogPiiSpec { return SPEC_BY_TYPE[type]; }
export const LOG_PII_TYPES: readonly LogPiiType[] = LOG_PII_CATALOG.map((s) => s.type);

export function isLogStrategyAllowed(type: LogPiiType, to: LogRedactStrategy): boolean {
  const spec = SPEC_BY_TYPE[type];
  if (!spec) return false;
  if (!spec.configurable) return to === spec.minStrategy;
  return strategyRank(to) >= strategyRank(spec.minStrategy);
}

// ── Policy ───────────────────────────────────────────────────────────────────

export function defaultLogPolicy(): LogRedactionPolicy {
  const strategies = LOG_PII_CATALOG.reduce((acc, s) => { acc[s.type] = s.defaultStrategy; return acc; }, {} as Record<LogPiiType, LogRedactStrategy>);
  return { strategies, customKeys: [], allowKeys: [], retentionDays: 30 };
}

const KEY_NAME_RE = /^[a-z0-9_.:-]{1,64}$/;
export const MAX_CUSTOM_KEYS = 32;

/** Normalize a list of field names: lowercased, trimmed, deduped, valid, capped. */
export function normalizeKeyList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  input.forEach((v) => {
    if (typeof v !== 'string') return;
    const k = v.trim().toLowerCase();
    if (KEY_NAME_RE.test(k) && !out.includes(k)) out.push(k);
  });
  return out.slice(0, MAX_CUSTOM_KEYS);
}

/** Fill any missing parts from defaults and clamp every strategy to its floor. */
export function normalizeLogPolicy(partial: LogRedactionPatch | undefined): LogRedactionPolicy {
  const base = defaultLogPolicy();
  if (!partial) return base;
  const strategies = { ...base.strategies };
  if (partial.strategies) {
    LOG_PII_CATALOG.forEach((spec) => {
      const chosen = partial.strategies?.[spec.type];
      if (chosen && STRATEGY_ORDER.includes(chosen)) {
        strategies[spec.type] = isLogStrategyAllowed(spec.type, chosen) ? chosen : spec.minStrategy;
      }
    });
  }
  const allowKeys = normalizeKeyList(partial.allowKeys ?? base.allowKeys)
    // An allowlist can never exempt a secret-shaped field.
    .filter((k) => !isSecretKeyName(k, []));
  return {
    strategies,
    customKeys: normalizeKeyList(partial.customKeys ?? base.customKeys),
    allowKeys,
    retentionDays: RETENTION_OPTIONS.includes(partial.retentionDays as LogRetentionDays) ? (partial.retentionDays as LogRetentionDays) : base.retentionDays,
  };
}

/** Narrow an untrusted PATCH body into a clean patch — invalid parts are dropped, never thrown. */
export function normalizeLogRedactionPatch(body: unknown): LogRedactionPatch {
  const out: LogRedactionPatch = {};
  if (typeof body !== 'object' || body === null) return out;
  const rec = body as Record<string, unknown>;
  if (typeof rec.strategies === 'object' && rec.strategies !== null) {
    const strat: Partial<Record<LogPiiType, LogRedactStrategy>> = {};
    const src = rec.strategies as Record<string, unknown>;
    LOG_PII_CATALOG.forEach((spec) => {
      const v = src[spec.type];
      if (typeof v === 'string' && (STRATEGY_ORDER as string[]).includes(v) && isLogStrategyAllowed(spec.type, v as LogRedactStrategy)) {
        strat[spec.type] = v as LogRedactStrategy;
      }
    });
    if (Object.keys(strat).length) out.strategies = strat;
  }
  if (Array.isArray(rec.customKeys)) out.customKeys = normalizeKeyList(rec.customKeys);
  if (Array.isArray(rec.allowKeys)) out.allowKeys = normalizeKeyList(rec.allowKeys).filter((k) => !isSecretKeyName(k, []));
  if (RETENTION_OPTIONS.includes(rec.retentionDays as LogRetentionDays)) out.retentionDays = rec.retentionDays as LogRetentionDays;
  return out;
}

/** 0–100: how much of the catalog is at its strongest strategy. */
export function logPolicyStrength(policy: LogRedactionPolicy): number {
  const max = strategyRank('drop');
  const sum = LOG_PII_CATALOG.reduce((s, spec) => s + strategyRank(policy.strategies[spec.type] ?? spec.defaultStrategy), 0);
  return Math.round((sum / (LOG_PII_CATALOG.length * max)) * 100);
}

export function strengthLabel(strength: number): 'Strict' | 'Balanced' | 'Permissive' {
  return strength >= 85 ? 'Strict' : strength >= 60 ? 'Balanced' : 'Permissive';
}

/**
 * The policy the console enforces = the persisted store policy + the org's Logs privacy
 * keys (always-redacted). One helper so every console surface computes the same thing.
 */
export function effectiveLogPolicy(store: LogRedactionPolicy, privacyKeys: readonly string[]): LogRedactionPolicy {
  const privacy = normalizeKeyList(Array.from(privacyKeys));
  return normalizeLogPolicy({
    strategies: store.strategies,
    customKeys: Array.from(new Set([...store.customKeys, ...privacy])),
    allowKeys: store.allowKeys,
    retentionDays: store.retentionDays,
  });
}

/** Only admins change the org's log-redaction policy. */
export function canEditLogRedaction(role: ConsoleRole | undefined): boolean {
  return role === 'admin';
}

// ── Key-based classification ─────────────────────────────────────────────────

const SECRET_KEY_PATTERNS: RegExp[] = [
  /authorization/, /api[_-]?key/, /apikey/, /^x-api-key$/, /token/, /secret/, /password/, /passwd/,
  /cookie/, /credential/, /private[_-]?key/, /client[_-]?secret/, /session[_-]?id/,
];

export function isSecretKeyName(key: string, customKeys: string[]): boolean {
  const k = key.toLowerCase();
  return customKeys.includes(k) || SECRET_KEY_PATTERNS.some((re) => re.test(k));
}

/** Classify a field name → the PII type it carries, honouring the policy's custom + allow lists. */
export function classifyLogKey(key: string, policy: LogRedactionPolicy): LogPiiType | null {
  const k = key.toLowerCase();
  if (isSecretKeyName(k, policy.customKeys)) return 'secret';
  if (/card[_-]?number|\bpan\b|credit[_-]?card|\bcc[_-]?num/.test(k)) return 'credit_card';
  const pii = classifyKey(k);
  if (!pii) return null;
  if (policy.allowKeys.includes(k) && SPEC_BY_TYPE[pii].configurable) return null;
  return pii;
}

// ── Value-based detection ────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const LINKEDIN_RE = /https?:\/\/(?:[a-z]{2,3}\.)?(?:linkedin\.com\/in\/|twitter\.com\/|x\.com\/)[A-Za-z0-9_-]+\/?/g;
const SECRET_VALUE_RE = /sk_(?:live|test)_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/-]{16,}=*|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const GOV_ID_RE = /\b\d{3}-\d{2}-\d{4}\b|\b\d{4}\s\d{4}\s\d{4}\b|\b[A-Z]{5}\d{4}[A-Z]\b/g;
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
const PHONE_RE = /\(?\+?\d{1,4}\)?(?:[\s.-]\d{2,5}){2,4}\b|\+\d{10,15}\b/g;

/** Luhn checksum over the digits of a candidate. */
export function luhnValid(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Visa, Mastercard (incl. 2-series), Amex, Discover, RuPay, JCB, Diners. */
function hasCardPrefix(candidate: string): boolean {
  const d = candidate.replace(/\D/g, '');
  return /^(4|5[1-5]|2[2-7]|3[47]|6011|65|60|81|82|35|3[068])/.test(d);
}

function isCard(candidate: string): boolean {
  return hasCardPrefix(candidate) && luhnValid(candidate);
}

function isPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '').length;
  if (digits < 10 || digits > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(candidate)) return false;      // ISO date prefix
  if (/^\d{2}[-./]\d{2}[-./]\d{4}/.test(candidate)) return false; // dd-mm-yyyy
  return true;
}

interface ValueDetector { type: LogPiiType; re: RegExp; accept?: (m: string) => boolean }
const VALUE_DETECTORS: ValueDetector[] = [
  { type: 'secret', re: SECRET_VALUE_RE },
  { type: 'credit_card', re: CARD_RE, accept: isCard },
  { type: 'government_id', re: GOV_ID_RE },
  { type: 'email', re: EMAIL_RE },
  { type: 'linkedin_url', re: LINKEDIN_RE },
  { type: 'ip_address', re: IPV4_RE },
  { type: 'phone', re: PHONE_RE, accept: isPhone },
];

// ── Rendering ────────────────────────────────────────────────────────────────

function normalizeForToken(value: string, type: LogPiiType): string {
  if (type === 'email') return value.trim().toLowerCase();
  if (type === 'phone') return value.replace(/\D/g, '');
  return value.trim();
}

/** A stable, per-org pseudonym: same value → same token; different org → different token. */
export function correlationToken(value: string, type: LogPiiType, orgSalt: string): string {
  return `tk_${sha256Hex(`${orgSalt}:${type}:${normalizeForToken(value, type)}`).slice(0, 12)}`;
}

/** The exact replacement written for one value. */
export function renderRedaction(value: string, type: LogPiiType, strategy: LogRedactStrategy, orgSalt: string): string {
  if (type === 'secret') {
    const raw = value.replace(/^Bearer\s+/i, '');
    return `[secret:${keyFingerprint(raw)}]`;
  }
  switch (strategy) {
    case 'drop': return `[${type}:redacted]`;
    case 'token': return `[${type}:${correlationToken(value, type, orgSalt)}]`;
    case 'partial': {
      if (type === 'credit_card') return `[credit_card:redacted]`;
      return `[${type}:${maskValue(value, type, 'partial')}]`;
    }
    default: return `[${type}:redacted]`;
  }
}

function strategyFor(type: LogPiiType, policy: LogRedactionPolicy): LogRedactStrategy {
  const spec = SPEC_BY_TYPE[type];
  const chosen = policy.strategies[type] ?? spec.defaultStrategy;
  return isLogStrategyAllowed(type, chosen) ? chosen : spec.minStrategy;
}

// ── Engine ───────────────────────────────────────────────────────────────────

function emptyCounts(): Record<LogPiiType, number> {
  return LOG_PII_CATALOG.reduce((acc, s) => { acc[s.type] = 0; return acc; }, {} as Record<LogPiiType, number>);
}

/**
 * Scan free text and replace every detected value. Returns the redacted text and
 * one finding per match (with the given path).
 */
export function redactString(text: string, policy: LogRedactionPolicy, orgSalt: string, path = '$'): { text: string; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  let out = text;
  VALUE_DETECTORS.forEach((det) => {
    det.re.lastIndex = 0;
    out = out.replace(det.re, (m) => {
      if (det.accept && !det.accept(m)) return m;
      const strategy = strategyFor(det.type, policy);
      const after = renderRedaction(m, det.type, strategy, orgSalt);
      findings.push({ path, type: det.type, detector: 'value', strategy, after });
      return after;
    });
  });
  return { text: out, findings };
}

/**
 * Redact a whole log record (any JSON-like value). Pure — the input is never
 * mutated; the result is a deep clone with every detected value replaced.
 */
export function redactLogRecord(record: unknown, policy: LogRedactionPolicy, orgSalt: string): RedactLogResult {
  const findings: RedactionFinding[] = [];
  const counts = emptyCounts();

  const scalar = (value: string, path: string, keyType: LogPiiType | null): string => {
    if (keyType) {
      const strategy = strategyFor(keyType, policy);
      const after = renderRedaction(value, keyType, strategy, orgSalt);
      findings.push({ path, type: keyType, detector: 'key', strategy, after });
      return after;
    }
    const r = redactString(value, policy, orgSalt, path);
    findings.push(...r.findings);
    return r.text;
  };

  const walk = (node: unknown, path: string, keyType: LogPiiType | null): unknown => {
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') return scalar(node, path, keyType);
    if (typeof node === 'number') {
      // Numbers are only redacted when their *field name* says they are PII (phone: 14155550142).
      return keyType ? scalar(String(node), path, keyType) : node;
    }
    if (typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item, i) => walk(item, `${path}[${i}]`, keyType));
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(src).forEach((key) => {
      const childPath = path === '$' ? key : `${path}.${key}`;
      const kt = classifyLogKey(key, policy);
      out[key] = walk(src[key], childPath, kt);
    });
    return out;
  };

  const redacted = walk(record, '$', null);
  findings.forEach((f) => { counts[f.type] += 1; });
  return { redacted, findings, counts, total: findings.length };
}

// ── Canary self-test ─────────────────────────────────────────────────────────

/** A realistic gateway log context built entirely from synthetic values. */
export const CANARY_RECORD: Record<string, unknown> = {
  requestId: 'req_canary_0001',
  method: 'GET',
  url: `${API_BASE_URL}/v1/people/phone?email=jordan.rivera@northwind.io`,
  ip: '198.51.100.24',
  parameters: { email: 'jordan.rivera@northwind.io', full_name: 'Jordan Rivera' },
  headers: { authorization: 'Bearer sk_live_canary0000000000000001', 'x-api-key': 'sk_test_canary0000000000000002' },
  body: {
    phone: '+1 415 555 0142',
    street_address: '2100 Market St',
    date_of_birth: '1987-03-14',
    government_id: '123-45-6789',
    card: '4111 1111 1111 1111',
    linkedin_url: 'https://linkedin.com/in/jordanrivera',
    note: 'Reach Jordan at +91 98765 43210, PAN ABCDE1234F, Aadhaar 2345 6789 0123.',
  },
  status: 200,
  durationMs: 142,
};

/** Run the canary through the engine and prove nothing survives. */
export function selfTest(policy: LogRedactionPolicy, orgSalt: string): SelfTestResult {
  const result = redactLogRecord(CANARY_RECORD, policy, orgSalt);
  const out = JSON.stringify(result.redacted).toLowerCase();
  const checks: SelfTestCheck[] = LOG_PII_CATALOG.map((spec) => {
    const hits = result.findings.filter((f) => f.type === spec.type);
    const detectors = new Set(hits.map((h) => h.detector));
    const detector: LogDetector | 'both' = detectors.size === 2 ? 'both' : detectors.has('value') ? 'value' : 'key';
    return {
      type: spec.type,
      label: spec.label,
      detector,
      redacted: hits.length,
      survived: out.includes(spec.canary.toLowerCase()),
      after: hits[0]?.after ?? '—',
    };
  });
  const leaks = checks.filter((c) => c.survived || c.redacted === 0).length;
  return { checks, leaks, passed: leaks === 0 };
}

// ── Posture ──────────────────────────────────────────────────────────────────

export const LOG_REDACTION_POSTURE = {
  /** Where internal lines go. */
  sinks: ['stdout (structured JSON)', 'SIEM forwarder'] as const,
  /** Redaction happens before the line is serialized — there is no unredacted copy. */
  redactBeforeWrite: true,
  /** Cannot be disabled — floors are enforced in the engine, the store and the gateway. */
  masterSwitch: false,
  /** Request IDs and trace IDs are never redacted so incidents stay traceable. */
  preservesRequestId: true,
  /** Tokens are deterministic per org: same value → same token, across lines and days. */
  correlationTokens: 'sha256(org-salt : type : value) → tk_ + 12 hex',
  /** Secrets are written as the same sha256: fingerprint the key registries (Key Hashing) use. */
  secretsAsFingerprint: true,
  /** Applies to sandbox and live traffic alike — these are our logs, not the caller's response. */
  environments: 'sandbox + live',
  detectors: LOG_PII_CATALOG.length,
};

// ── Persisted policy store (own key, not the tenant store) ───────────────────

export type ConsoleRole = 'admin' | 'developer' | 'billing';

/**
 * Every mutation takes the acting role first and is a no-op for non-admins — the
 * store enforces RBAC itself, not only the UI (mirrors the gateway's floor clamping).
 */
export interface LogRedactionPolicyState extends LogRedactionPolicy {
  setStrategy: (role: ConsoleRole | undefined, type: LogPiiType, strategy: LogRedactStrategy) => void;
  addCustomKey: (role: ConsoleRole | undefined, key: string) => boolean;
  removeCustomKey: (role: ConsoleRole | undefined, key: string) => void;
  addAllowKey: (role: ConsoleRole | undefined, key: string) => boolean;
  removeAllowKey: (role: ConsoleRole | undefined, key: string) => void;
  setRetention: (role: ConsoleRole | undefined, days: LogRetentionDays) => void;
  resetPolicy: (role: ConsoleRole | undefined) => void;
  policy: () => LogRedactionPolicy;
}

export const useLogRedactionPolicy = create<LogRedactionPolicyState>()(
  persist(
    (set, get) => ({
      ...defaultLogPolicy(),
      setStrategy: (role, type, strategy) => set((s) => {
        // Enforce RBAC + the floor in the store, not only in the UI.
        if (!canEditLogRedaction(role) || !isLogStrategyAllowed(type, strategy)) return {};
        return { strategies: { ...s.strategies, [type]: strategy } };
      }),
      addCustomKey: (role, key) => {
        if (!canEditLogRedaction(role)) return false;
        const [k] = normalizeKeyList([key]);
        if (!k || get().customKeys.includes(k) || get().customKeys.length >= MAX_CUSTOM_KEYS) return false;
        set((s) => ({ customKeys: [...s.customKeys, k], allowKeys: s.allowKeys.filter((a) => a !== k) }));
        return true;
      },
      removeCustomKey: (role, key) => set((s) => (canEditLogRedaction(role) ? { customKeys: s.customKeys.filter((k) => k !== key.toLowerCase()) } : {})),
      addAllowKey: (role, key) => {
        if (!canEditLogRedaction(role)) return false;
        const [k] = normalizeKeyList([key]);
        if (!k || isSecretKeyName(k, get().customKeys) || get().allowKeys.includes(k) || get().allowKeys.length >= MAX_CUSTOM_KEYS) return false;
        set((s) => ({ allowKeys: [...s.allowKeys, k] }));
        return true;
      },
      removeAllowKey: (role, key) => set((s) => (canEditLogRedaction(role) ? { allowKeys: s.allowKeys.filter((k) => k !== key.toLowerCase()) } : {})),
      setRetention: (role, days) => { if (canEditLogRedaction(role) && RETENTION_OPTIONS.includes(days)) set({ retentionDays: days }); },
      resetPolicy: (role) => { if (canEditLogRedaction(role)) set(defaultLogPolicy()); },
      policy: () => {
        const s = get();
        return { strategies: s.strategies, customKeys: s.customKeys, allowKeys: s.allowKeys, retentionDays: s.retentionDays };
      },
    }),
    { name: 'zinbit-log-redaction', storage: createJSONStorage(() => localStorage) },
  ),
);
