/**
 * Risk-based trial gate — single source of truth (shared auth, portable).
 *
 * Sign-up never asks for a phone. At **trial activation** the account is evaluated
 * against six risk conditions and challenged with a phone OTP only if one trips:
 *   C1 non_icp · C2 low_domain_reputation · C3 domain_unmapped · C4 small_company ·
 *   C5 duplicate_domain · C6 duplicate_ip
 * Two of them (C2, C5) are locked on for every product; the rest and their thresholds
 * are per-product policy. A verified payment method, an enterprise contract, or an
 * earlier phone verification exempts the account.
 *
 * Pure and deterministic — no I/O, no `Math.random`. Reuses the product's existing
 * resolvers so "company", "disposable" and "domain posture" mean the same thing here
 * as in the enrichment API. Designed to be lifted verbatim into the shared auth repo.
 */

import { resolveCompanyFromDomain, normalizeDomain, isValidDomain } from '@/lib/company-resolver';
import { detectDisposable } from '@/lib/disposable-detector';
import { checkDomainAuth } from '@/lib/email-domain-auth';
import { sha256Hex } from '@/lib/key-hashing';

// ── Conditions ───────────────────────────────────────────────────────────────

export type RiskCondition =
  | 'non_icp' | 'low_domain_reputation' | 'domain_unmapped' | 'small_company' | 'duplicate_domain' | 'duplicate_ip';

export interface RiskConditionSpec {
  id: RiskCondition;
  code: string;
  label: string;
  description: string;
  /** Locked conditions cannot be disabled by any product policy. */
  locked: boolean;
}

export const RISK_CONDITIONS: RiskConditionSpec[] = [
  { id: 'non_icp', code: 'C1', label: 'Non-ICP sign-up', locked: false, description: 'Free-mail or personal domain, or a company outside the ICP industries.' },
  { id: 'low_domain_reputation', code: 'C2', label: 'Low domain reputation', locked: true, description: 'Disposable or suspected-throwaway domain, registered recently, or weak SPF/DMARC posture.' },
  { id: 'domain_unmapped', code: 'C3', label: 'Domain not mapped to a company', locked: false, description: 'The company resolver finds no company behind the email domain.' },
  { id: 'small_company', code: 'C4', label: 'Small company', locked: false, description: 'Resolved headcount below the threshold.' },
  { id: 'duplicate_domain', code: 'C5', label: 'Active account on the same domain', locked: true, description: 'An active trial or paid account already exists for this email domain.' },
  { id: 'duplicate_ip', code: 'C6', label: 'Account from the same IP', locked: false, description: 'Another account was created or activated from this public IP within the window.' },
];
export const RISK_CONDITION_IDS: RiskCondition[] = RISK_CONDITIONS.map((c) => c.id);
export const LOCKED_CONDITIONS: RiskCondition[] = RISK_CONDITIONS.filter((c) => c.locked).map((c) => c.id);
const SPEC = RISK_CONDITIONS.reduce((acc, c) => { acc[c.id] = c; return acc; }, {} as Record<RiskCondition, RiskConditionSpec>);
export function conditionSpec(id: RiskCondition): RiskConditionSpec { return SPEC[id]; }

// ── Policy ───────────────────────────────────────────────────────────────────

export interface TrialGatePolicy {
  productId: string;
  conditionsEnabled: Record<RiskCondition, boolean>;
  /** C4: headcount strictly below this trips. */
  smallCompanyThreshold: number;
  /** C6: look-back window. */
  duplicateIpWindowDays: number;
  /** C2: domains younger than this trip. */
  domainAgeMinDays: number;
  /** ISO-3166 alpha-2 codes where SMS is degraded → WhatsApp becomes the primary channel. */
  smsDegradedCountries: string[];
  /** Public IPs / prefixes (e.g. "203.0.113." or "198.51.100.7") that never trip C6. */
  sharedEgressAllowlist: string[];
  /** Seconds before the UI offers the next channel. */
  fallbackAfterSeconds: number;
  /** Referral / partner codes waive C4 (early-stage partner leads). */
  referralWaivesSmallCompany: boolean;
  version: number;
}

export interface TrialGatePolicyPatch {
  conditionsEnabled?: Partial<Record<RiskCondition, boolean>>;
  smallCompanyThreshold?: number;
  duplicateIpWindowDays?: number;
  domainAgeMinDays?: number;
  smsDegradedCountries?: string[];
  sharedEgressAllowlist?: string[];
  fallbackAfterSeconds?: number;
  referralWaivesSmallCompany?: boolean;
}

export const POLICY_BOUNDS = {
  smallCompanyThreshold: { min: 0, max: 1000 },
  duplicateIpWindowDays: { min: 1, max: 365 },
  domainAgeMinDays: { min: 0, max: 365 },
  fallbackAfterSeconds: { min: 10, max: 120 },
} as const;

export function defaultTrialGatePolicy(productId = 'zinbit'): TrialGatePolicy {
  return {
    productId,
    conditionsEnabled: RISK_CONDITION_IDS.reduce((acc, id) => { acc[id] = true; return acc; }, {} as Record<RiskCondition, boolean>),
    smallCompanyThreshold: 100,
    duplicateIpWindowDays: 90,
    domainAgeMinDays: 90,
    smsDegradedCountries: ['NG', 'PK', 'BD'],
    sharedEgressAllowlist: [],
    fallbackAfterSeconds: 30,
    referralWaivesSmallCompany: true,
    version: 1,
  };
}

const ISO2_RE = /^[A-Z]{2}$/;
const IP_PREFIX_RE = /^(\d{1,3}\.){1,3}(\d{1,3})?$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Narrow an untrusted patch: unknown/invalid parts dropped, locked conditions kept on, numbers clamped. */
export function normalizeTrialGatePatch(body: unknown): { patch: TrialGatePolicyPatch; ignored: string[] } {
  const patch: TrialGatePolicyPatch = {};
  const ignored: string[] = [];
  if (typeof body !== 'object' || body === null) return { patch, ignored };
  const rec = body as Record<string, unknown>;
  if (typeof rec.conditionsEnabled === 'object' && rec.conditionsEnabled !== null) {
    const out: Partial<Record<RiskCondition, boolean>> = {};
    Object.entries(rec.conditionsEnabled as Record<string, unknown>).forEach(([k, v]) => {
      if (!(RISK_CONDITION_IDS as string[]).includes(k) || typeof v !== 'boolean') { ignored.push(`conditionsEnabled.${k}`); return; }
      if (LOCKED_CONDITIONS.includes(k as RiskCondition) && v === false) { ignored.push(`conditionsEnabled.${k} (locked on)`); return; }
      out[k as RiskCondition] = v;
    });
    if (Object.keys(out).length) patch.conditionsEnabled = out;
  }
  (['smallCompanyThreshold', 'duplicateIpWindowDays', 'domainAgeMinDays', 'fallbackAfterSeconds'] as const).forEach((k) => {
    if (k in rec) {
      const v = rec[k];
      if (typeof v === 'number' && Number.isFinite(v)) patch[k] = clamp(v, POLICY_BOUNDS[k].min, POLICY_BOUNDS[k].max);
      else ignored.push(k);
    }
  });
  if ('smsDegradedCountries' in rec) {
    if (Array.isArray(rec.smsDegradedCountries)) patch.smsDegradedCountries = Array.from(new Set(rec.smsDegradedCountries.filter((c): c is string => typeof c === 'string').map((c) => c.trim().toUpperCase()).filter((c) => ISO2_RE.test(c)))).slice(0, 50);
    else ignored.push('smsDegradedCountries');
  }
  if ('sharedEgressAllowlist' in rec) {
    if (Array.isArray(rec.sharedEgressAllowlist)) patch.sharedEgressAllowlist = Array.from(new Set(rec.sharedEgressAllowlist.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter((c) => IP_PREFIX_RE.test(c)))).slice(0, 100);
    else ignored.push('sharedEgressAllowlist');
  }
  if ('referralWaivesSmallCompany' in rec) {
    if (typeof rec.referralWaivesSmallCompany === 'boolean') patch.referralWaivesSmallCompany = rec.referralWaivesSmallCompany;
    else ignored.push('referralWaivesSmallCompany');
  }
  return { patch, ignored };
}

export function applyTrialGatePatch(policy: TrialGatePolicy, patch: TrialGatePolicyPatch): TrialGatePolicy {
  const conditionsEnabled = { ...policy.conditionsEnabled, ...(patch.conditionsEnabled ?? {}) };
  LOCKED_CONDITIONS.forEach((c) => { conditionsEnabled[c] = true; });
  return {
    ...policy,
    conditionsEnabled,
    smallCompanyThreshold: patch.smallCompanyThreshold ?? policy.smallCompanyThreshold,
    duplicateIpWindowDays: patch.duplicateIpWindowDays ?? policy.duplicateIpWindowDays,
    domainAgeMinDays: patch.domainAgeMinDays ?? policy.domainAgeMinDays,
    smsDegradedCountries: patch.smsDegradedCountries ?? policy.smsDegradedCountries,
    sharedEgressAllowlist: patch.sharedEgressAllowlist ?? policy.sharedEgressAllowlist,
    fallbackAfterSeconds: patch.fallbackAfterSeconds ?? policy.fallbackAfterSeconds,
    referralWaivesSmallCompany: patch.referralWaivesSmallCompany ?? policy.referralWaivesSmallCompany,
    version: policy.version + 1,
  };
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export type AccountState = 'trial' | 'paid' | 'churned';

/** What the shared directory knows about an existing account (any Zintlr product). */
export interface DirectoryAccount {
  id: string;
  email: string;
  domain: string;
  ip: string;
  state: AccountState;
  productId: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface SignupProfile {
  accountId: string;
  email: string;
  company: string;
  ip: string;
  referralCode?: string;
  productId: string;
}

export interface Exemptions {
  paymentVerified?: boolean;
  enterpriseContract?: boolean;
  phoneVerified?: boolean;
}

export interface RiskInputs {
  domain: string;
  freeProvider: boolean;
  personalDomain: boolean;
  disposableVerdict: 'disposable' | 'suspected' | 'trusted' | 'unknown';
  domainAgeDays: number | null;
  domainAuthGrade: string | null;
  companyName: string | null;
  headcount: number | null;
  industry: string | null;
  icpIndustry: boolean | null;
  /** Ids of active accounts on the same domain. */
  domainMatches: string[];
  /** Ids of accounts from the same IP within the window. */
  ipMatches: string[];
  ipAllowlisted: boolean;
  referral: boolean;
}

export interface ConditionResult {
  id: RiskCondition;
  code: string;
  label: string;
  enabled: boolean;
  tripped: boolean;
  /** Plain-English evidence, safe to show to the user. */
  evidence: string;
}

export type GateDecision = 'allow' | 'challenge' | 'exempt';

export interface TrialRiskEvaluation {
  id: string;
  accountId: string;
  productId: string;
  evaluatedAt: number;
  decision: GateDecision;
  exemptReason: 'payment_verified' | 'enterprise_contract' | 'phone_verified' | null;
  conditions: ConditionResult[];
  /** Enabled conditions that tripped — the reason for a challenge. */
  tripped: RiskCondition[];
  inputs: RiskInputs;
  policyVersion: number;
}

// ── Deterministic helpers ────────────────────────────────────────────────────

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? normalizeDomain(email.slice(at + 1)) : '';
}

/** Registration age of a domain, in days — deterministic per domain (WHOIS stand-in). */
export function domainAgeDays(domain: string): number {
  const h = parseInt(sha256Hex(`whois:${domain}`).slice(0, 8), 16);
  // Skew towards established domains: 70% 1–12 years, 30% 5–365 days.
  return h % 10 < 3 ? 5 + (h % 360) : 365 + (h % (365 * 11));
}

const ICP_INDUSTRY_RE = /software|saas|fintech|financ|payment|bank|data|analytic|technolog|internet|information|marketing|sales|cloud|security|hr tech|recruit|martech|adtech|e-?commerce|insur/i;
/** ICP industries per docs/product/icp-and-personas.md (B2B SaaS, sales-tech, fintech, data teams). */
export function isIcpIndustry(industry: string | null | undefined): boolean {
  return Boolean(industry && ICP_INDUSTRY_RE.test(industry));
}

export function ipAllowlisted(ip: string, allowlist: string[]): boolean {
  return allowlist.some((p) => (p.endsWith('.') ? ip.startsWith(p) : ip === p));
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export function evaluateTrialRisk(
  profile: SignupProfile,
  directory: DirectoryAccount[],
  policy: TrialGatePolicy,
  exemptions: Exemptions = {},
  now: number = Date.now(),
): TrialRiskEvaluation {
  const domain = emailDomain(profile.email);
  const disposable = detectDisposable(profile.email);
  const company = isValidDomain(domain) ? resolveCompanyFromDomain(domain) : null;
  const personalDomain = Boolean(company?.is_personal_domain) || Boolean(disposable?.is_free_provider);
  const resolvedCompany = company && !company.is_personal_domain ? company : null;
  const auth = isValidDomain(domain) ? checkDomainAuth(domain) : null;
  const age = isValidDomain(domain) ? domainAgeDays(domain) : null;
  const windowMs = policy.duplicateIpWindowDays * 86_400_000;
  const others = directory.filter((a) => a.id !== profile.accountId);
  const domainMatches = personalDomain ? [] : others.filter((a) => a.domain === domain && a.state !== 'churned').map((a) => a.id);
  const allow = ipAllowlisted(profile.ip, policy.sharedEgressAllowlist);
  const ipMatches = allow ? [] : others.filter((a) => a.ip === profile.ip && now - Date.parse(a.activatedAt ?? a.createdAt) <= windowMs).map((a) => a.id);
  const referral = Boolean(profile.referralCode && profile.referralCode.trim());

  const inputs: RiskInputs = {
    domain,
    freeProvider: Boolean(disposable?.is_free_provider),
    personalDomain,
    disposableVerdict: disposable?.verdict ?? 'unknown',
    domainAgeDays: age,
    domainAuthGrade: auth?.grade ?? null,
    companyName: resolvedCompany?.name ?? null,
    headcount: resolvedCompany?.employee_count ?? null,
    industry: resolvedCompany?.industry ?? null,
    icpIndustry: resolvedCompany ? isIcpIndustry(resolvedCompany.industry) : null,
    domainMatches,
    ipMatches,
    ipAllowlisted: allow,
    referral,
  };

  const checks: Record<RiskCondition, { tripped: boolean; evidence: string }> = {
    non_icp: personalDomain
      ? { tripped: true, evidence: `${domain} is a personal / free-mail domain` }
      : resolvedCompany && !inputs.icpIndustry
        ? { tripped: true, evidence: `${resolvedCompany.name} is in ${resolvedCompany.industry}, outside the ICP industries` }
        : { tripped: false, evidence: resolvedCompany ? `${resolvedCompany.name} · ${resolvedCompany.industry}` : 'no company to assess' },
    low_domain_reputation: (() => {
      if (!isValidDomain(domain)) return { tripped: true, evidence: 'not a valid domain' };
      if (disposable && disposable.verdict !== 'trusted') return { tripped: true, evidence: `${domain} looks ${disposable.verdict} (${disposable.category})` };
      if (age !== null && age < policy.domainAgeMinDays) return { tripped: true, evidence: `${domain} registered ${age} days ago (< ${policy.domainAgeMinDays})` };
      if (auth && (auth.grade === 'None' || (auth.grade === 'Weak' && auth.spoofable))) return { tripped: true, evidence: `mail posture ${auth.grade} — spoofable (SPF/DMARC)` };
      return { tripped: false, evidence: `registered ${age ?? '—'} days · posture ${auth?.grade ?? '—'}` };
    })(),
    domain_unmapped: resolvedCompany
      ? { tripped: false, evidence: `mapped to ${resolvedCompany.name}` }
      : { tripped: !personalDomain, evidence: personalDomain ? 'personal domain (assessed by C1)' : `no company found for ${domain}` },
    small_company: resolvedCompany && resolvedCompany.employee_count < policy.smallCompanyThreshold
      ? (referral && policy.referralWaivesSmallCompany
        ? { tripped: false, evidence: `${resolvedCompany.employee_count} people — waived by referral code` }
        : { tripped: true, evidence: `${resolvedCompany.employee_count} people (< ${policy.smallCompanyThreshold})` })
      : { tripped: false, evidence: resolvedCompany ? `${resolvedCompany.employee_count} people` : 'no headcount to assess' },
    duplicate_domain: domainMatches.length
      ? { tripped: true, evidence: `${domainMatches.length} active account${domainMatches.length === 1 ? '' : 's'} already on ${domain}` }
      : { tripped: false, evidence: personalDomain ? 'not checked for personal domains' : 'first account on this domain' },
    duplicate_ip: ipMatches.length
      ? { tripped: true, evidence: `${ipMatches.length} account${ipMatches.length === 1 ? '' : 's'} from ${profile.ip} in ${policy.duplicateIpWindowDays} days` }
      : { tripped: false, evidence: allow ? `${profile.ip} is on the shared-egress allow-list` : `no other account from ${profile.ip}` },
  };

  const conditions: ConditionResult[] = RISK_CONDITIONS.map((spec) => ({
    id: spec.id, code: spec.code, label: spec.label,
    enabled: policy.conditionsEnabled[spec.id],
    tripped: checks[spec.id].tripped,
    evidence: checks[spec.id].evidence,
  }));
  const tripped = conditions.filter((c) => c.enabled && c.tripped).map((c) => c.id);

  let decision: GateDecision = tripped.length ? 'challenge' : 'allow';
  let exemptReason: TrialRiskEvaluation['exemptReason'] = null;
  if (decision === 'challenge') {
    if (exemptions.paymentVerified) { decision = 'exempt'; exemptReason = 'payment_verified'; }
    else if (exemptions.enterpriseContract) { decision = 'exempt'; exemptReason = 'enterprise_contract'; }
    else if (exemptions.phoneVerified) { decision = 'exempt'; exemptReason = 'phone_verified'; }
  }

  return {
    id: `eval_${sha256Hex(`${profile.accountId}:${now}:${policy.version}`).slice(0, 12)}`,
    accountId: profile.accountId,
    productId: profile.productId,
    evaluatedAt: now,
    decision,
    exemptReason,
    conditions,
    tripped,
    inputs,
    policyVersion: policy.version,
  };
}

/** Plain-English one-liner for the challenge screen. */
export function explainChallenge(ev: TrialRiskEvaluation): string {
  if (ev.decision !== 'challenge') return 'No phone check needed.';
  const labels = ev.tripped.map((id) => SPEC[id].label.toLowerCase());
  return labels.length === 1 ? `We need a quick phone check because of: ${labels[0]}.` : `We need a quick phone check because of: ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`;
}

// ── Seeded directory + personas (deterministic demo data) ────────────────────

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T09:00:00Z');

/** Existing Zintlr accounts across products — what the duplicate checks look at. */
export function seedDirectory(): DirectoryAccount[] {
  const mk = (id: string, email: string, ip: string, state: AccountState, productId: string, daysAgo: number, activated: boolean): DirectoryAccount => ({
    id, email, domain: emailDomain(email), ip, state, productId,
    createdAt: new Date(T0 - daysAgo * DAY).toISOString(),
    activatedAt: activated ? new Date(T0 - daysAgo * DAY + 3_600_000).toISOString() : null,
  });
  return [
    mk('acct_nw_001', 'ops@northwind.io', '198.51.100.24', 'paid', 'zinbit', 210, true),
    mk('acct_ml_001', 'rahul@meridianlabs.in', '203.0.113.42', 'trial', 'zinbit', 12, true),
    mk('acct_hz_001', 'data@helioz.ai', '192.0.2.77', 'paid', 'zintlr-intent', 95, true),
    mk('acct_ct_001', 'ceo@contoso-trading.com', '198.51.100.90', 'churned', 'zinbit', 400, true),
    mk('acct_fx_001', 'kavya.s@gmail.com', '203.0.113.42', 'trial', 'zinbit', 3, false),
    mk('acct_bl_001', 'growth@bluefin-payments.com', '192.0.2.10', 'paid', 'zintlr-context', 60, true),
    mk('acct_ak_001', 'dev@arkline.dev', '203.0.113.150', 'trial', 'zinbit', 1, true),
  ];
}

export interface SignupPersona {
  id: string;
  label: string;
  blurb: string;
  profile: Omit<SignupProfile, 'accountId' | 'productId'>;
}

/** Simulator presets — each exercises a different condition mix. */
export const SIGNUP_PERSONAS: SignupPersona[] = [
  { id: 'clean_icp', label: 'Clean ICP developer', blurb: 'Work email at an established fintech; no duplicates.', profile: { email: 'anita.rao@zerodha.com', company: 'Zerodha', ip: '198.51.100.201' } },
  { id: 'free_mail', label: 'Free-mail sign-up', blurb: 'Gmail address — non-ICP; no company to map.', profile: { email: 'kavya.s+dev@gmail.com', company: 'Personal', ip: '203.0.113.9' } },
  { id: 'dup_domain', label: 'Second person, same company', blurb: 'meridianlabs.in already has an active trial.', profile: { email: 'priya.nair@meridianlabs.in', company: 'Meridian Labs', ip: '203.0.113.77' } },
  { id: 'dup_ip', label: 'Same IP as an existing account', blurb: '203.0.113.42 created two accounts in the last 90 days.', profile: { email: 'sam@quietharbor.co', company: 'Quiet Harbor', ip: '203.0.113.42' } },
  { id: 'disposable', label: 'Disposable domain', blurb: 'Temporary mailbox — low reputation.', profile: { email: 'x9f2@mailinator.com', company: 'Test Co', ip: '192.0.2.200' } },
  { id: 'referral', label: 'Small team with a partner code', blurb: 'Under 100 people, but a referral code waives C4.', profile: { email: 'dev@arkline.dev', company: 'Arkline', ip: '203.0.113.151', referralCode: 'APOLLO2026' } },
];
