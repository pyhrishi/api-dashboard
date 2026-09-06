/**
 * Cross-field validation — deterministic record consistency checks.
 *
 * Resolves a person and runs rules that catch *impossible or improbable
 * combinations across fields* — the classic "title says VP but seniority says
 * Junior" problem — that single-field validation misses: email ↔ company
 * domain, title ↔ seniority, phone ↔ HQ geo, and name ↔ email local-part.
 * Pure and deterministic (no `Math.random`). Builds on the person, company,
 * phone, and title resolvers so every check reflects the real resolved record.
 */

import { resolvePersonFromEmail, type Seniority } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { verifyPhoneForEmail } from '@/lib/phone-verifier';
import { normalizeJobTitle } from '@/lib/title-normalizer';

export type RuleStatus = 'pass' | 'warn' | 'fail';
export type ValidationVerdict = 'consistent' | 'minor_issues' | 'inconsistent';

export interface ValidationRule {
  rule: string;
  label: string;
  status: RuleStatus;
  detail: string;
}

export interface ValidationProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface RecordValidation {
  email: string;
  subject: string;
  verdict: ValidationVerdict;
  integrity_score: number;
  consistent: boolean;
  rules: ValidationRule[];
  confidence: number;
  last_verified: string;
  provenance: ValidationProvenance[];
}

/** Ordered seniority ladder for measuring how far a title drifts from the record. */
const SENIORITY_ORDER: Seniority[] = ['Individual Contributor', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Suite'];
const ISO_TO_COUNTRY: Record<string, string> = { US: 'United States', IN: 'India', GB: 'United Kingdom' };

export function validateRecord(rawEmail: string): RecordValidation | null {
  const person = resolvePersonFromEmail(rawEmail);
  if (!person) return null;

  const email = rawEmail.trim().toLowerCase();
  const emailDomain = email.split('@')[1] ?? '';
  const localPart = email.split('@')[0] ?? '';
  const rules: ValidationRule[] = [];

  // 1. Email ↔ company domain
  if (person.is_personal_email) {
    rules.push({ rule: 'email_company_domain', label: 'Email ↔ company', status: 'warn', detail: `Personal email (${emailDomain}); company "${person.company}" is inferred, not domain-matched.` });
  } else if (emailDomain === person.company_domain) {
    rules.push({ rule: 'email_company_domain', label: 'Email ↔ company', status: 'pass', detail: `Email domain matches the company domain (${person.company_domain}).` });
  } else {
    rules.push({ rule: 'email_company_domain', label: 'Email ↔ company', status: 'fail', detail: `Email domain ${emailDomain} does not match company domain ${person.company_domain}.` });
  }

  // 2. Title ↔ seniority (ladder distance: 0 = pass, 1 = warn, 2+ = fail/impossible)
  const norm = normalizeJobTitle(person.title);
  const normSen = norm?.seniority;
  if (!normSen) {
    rules.push({ rule: 'title_seniority', label: 'Title ↔ seniority', status: 'warn', detail: `Could not classify "${person.title}" to cross-check ${person.seniority}.` });
  } else {
    const dist = Math.abs(SENIORITY_ORDER.indexOf(normSen) - SENIORITY_ORDER.indexOf(person.seniority));
    if (dist === 0) rules.push({ rule: 'title_seniority', label: 'Title ↔ seniority', status: 'pass', detail: `"${person.title}" is consistent with ${person.seniority}.` });
    else if (dist === 1) rules.push({ rule: 'title_seniority', label: 'Title ↔ seniority', status: 'warn', detail: `"${person.title}" reads as ${normSen}, one rung off the recorded ${person.seniority}.` });
    else rules.push({ rule: 'title_seniority', label: 'Title ↔ seniority', status: 'fail', detail: `"${person.title}" implies ${normSen} but the record says ${person.seniority} — an impossible combination.` });
  }

  // 3. Phone geo ↔ company HQ
  const phone = verifyPhoneForEmail(email);
  const company = resolveCompanyFromDomain(person.company_domain);
  if (phone && company) {
    const phoneCountry = ISO_TO_COUNTRY[phone.country] ?? phone.country;
    if (phoneCountry === company.hq_country) {
      rules.push({ rule: 'geo_consistency', label: 'Phone ↔ HQ geo', status: 'pass', detail: `Phone and company HQ are both in ${company.hq_country}.` });
    } else {
      rules.push({ rule: 'geo_consistency', label: 'Phone ↔ HQ geo', status: 'warn', detail: `Phone is registered in ${phoneCountry} but the company HQ is in ${company.hq_country}.` });
    }
  }

  // 4. Name ↔ email local-part
  const nameParts = person.full_name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  const nameMatch = nameParts.some((p) => localPart.includes(p));
  rules.push(nameMatch
    ? { rule: 'name_email', label: 'Name ↔ email', status: 'pass', detail: `Local-part "${localPart}" reflects the name.` }
    : { rule: 'name_email', label: 'Name ↔ email', status: 'warn', detail: `Local-part "${localPart}" doesn't clearly reflect "${person.full_name}".` });

  const weight = (s: RuleStatus) => (s === 'pass' ? 1 : s === 'warn' ? 0.6 : 0);
  const integrity_score = Math.round((rules.reduce((n, r) => n + weight(r.status), 0) / rules.length) * 100);
  const hasFail = rules.some((r) => r.status === 'fail');
  const hasWarn = rules.some((r) => r.status === 'warn');
  const verdict: ValidationVerdict = hasFail ? 'inconsistent' : hasWarn ? 'minor_issues' : 'consistent';
  const passed = rules.filter((r) => r.status === 'pass').length;

  return {
    email,
    subject: person.full_name,
    verdict,
    integrity_score,
    consistent: !hasFail,
    rules,
    confidence: 0.95,
    last_verified: person.last_verified,
    provenance: [
      { field: 'validation', source: 'Cross-field rule engine', signal: `${passed}/${rules.length} consistency checks passed`, confidence: 0.95 },
    ],
  };
}
