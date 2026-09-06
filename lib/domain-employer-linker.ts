/**
 * Domain-to-employer linking (F-037) — link a domain to the real employer entity.
 *
 * Given a domain or an email, classify the domain (corporate, personal ESP,
 * disposable, subsidiary/brand, educational, government, parked) and — when it's an
 * employer domain — link it to the employing company. A subsidiary or brand domain
 * is resolved up to the ultimate parent employer, so a contact at a regional entity
 * attributes to the right account. Non-employer domains (a free mailbox, a
 * disposable address) are called out honestly instead of guessing a company.
 *
 * Deterministic and coherent: built on the shared company + hierarchy resolvers and
 * the disposable detector, so the employer link agrees with a direct company
 * lookup. No Math.random, no wall-clock.
 */

import { resolveCompanyFromDomain, normalizeDomain } from '@/lib/company-resolver';
import { resolveCompanyHierarchy } from '@/lib/company-hierarchy';
import { detectDisposable } from '@/lib/disposable-detector';

export type DomainType = 'corporate' | 'subsidiary' | 'personal_esp' | 'disposable' | 'educational' | 'government' | 'parked' | 'unknown';
export type EmployerRelationship = 'primary' | 'subsidiary';

export interface EmployerLink {
  name: string;
  canonical_domain: string;
  industry: string;
  employee_band: string;
  relationship: EmployerRelationship;
}

export interface DomainEmployerResult {
  domain: string;
  input_email: string | null;
  domain_type: DomainType;
  is_employer_domain: boolean;
  employer: EmployerLink | null;
  confidence: number;
  signals: string[];
  guidance: string;
  as_of: string;
}

const AS_OF = '2026-09-06';

function extractDomain(input: string): { domain: string; email: string | null } {
  const v = String(input || '').trim().toLowerCase();
  if (v.includes('@')) return { domain: normalizeDomain(v.split('@')[1] ?? ''), email: v };
  return { domain: normalizeDomain(v), email: null };
}

/** Link a domain (or email) to its employer. Returns null for an unparseable input. */
export function linkDomainToEmployer(input: string): DomainEmployerResult | null {
  const { domain, email } = extractDomain(input);
  if (!domain || !/\./.test(domain)) return null;

  const signals: string[] = [];
  const base = (type: DomainType, is_employer_domain: boolean, employer: EmployerLink | null, confidence: number, guidance: string): DomainEmployerResult => ({
    domain, input_email: email, domain_type: type, is_employer_domain, employer, confidence, signals, guidance, as_of: AS_OF,
  });

  // Disposable / throwaway addresses are never an employer.
  const disposable = detectDisposable(`probe@${domain}`);
  if (disposable?.is_disposable) {
    signals.push('Disposable / throwaway email domain');
    return base('disposable', false, null, 0.95, 'Disposable domain — do not attribute to an employer or add to a CRM.');
  }

  // Educational / government TLDs.
  if (/(\.edu|\.edu\.[a-z]{2}|\.ac\.[a-z]{2})$/.test(domain)) {
    const c = resolveCompanyFromDomain(domain);
    signals.push('Educational institution TLD');
    return base('educational', true, c ? { name: c.name, canonical_domain: c.domain, industry: 'Education', employee_band: c.employee_band, relationship: 'primary' } : null, 0.85, 'Educational institution — the domain is the employer, not a corporate account.');
  }
  if (/(\.gov|\.gov\.[a-z]{2}|\.mil)$/.test(domain)) {
    const c = resolveCompanyFromDomain(domain);
    signals.push('Government TLD');
    return base('government', true, c ? { name: c.name, canonical_domain: c.domain, industry: 'Government', employee_band: c.employee_band, relationship: 'primary' } : null, 0.85, 'Government entity — the domain is the employer.');
  }

  const company = resolveCompanyFromDomain(domain);
  if (!company) {
    signals.push('Domain did not resolve to a known organization');
    return base('parked', false, null, 0.4, 'No organization resolved for this domain — it may be parked, new, or unregistered.');
  }

  // Free / personal mailbox providers carry no employer.
  if (company.is_personal_domain) {
    signals.push('Free / personal mailbox provider');
    return base('personal_esp', false, null, 0.9, 'Personal mailbox — the employer cannot be derived from the domain. Supply a work email or a company hint to attribute this contact.');
  }

  // A corporate domain — resolve whether it's a primary or a subsidiary/brand domain.
  const hierarchy = resolveCompanyHierarchy(domain);
  if (hierarchy && hierarchy.role === 'subsidiary') {
    const parent = hierarchy.nodes.find((n) => n.is_ultimate_parent);
    signals.push(`Subsidiary/brand domain — rolls up to ${parent ? parent.name : 'a parent company'}`);
    signals.push(`Direct entity: ${company.name}`);
    return base('subsidiary', true, {
      name: parent ? parent.name : company.name,
      canonical_domain: parent ? parent.domain : company.domain,
      industry: company.industry,
      employee_band: company.employee_band,
      relationship: 'subsidiary',
    }, Math.round(company.confidence * 100) / 100, `Attributed to the parent employer${parent ? ` (${parent.name})` : ''}; the contact's direct entity is ${company.name}.`);
  }

  signals.push('Primary corporate domain');
  if (hierarchy && hierarchy.role === 'parent') signals.push(`Ultimate parent of ${hierarchy.total_entities - 1} subsidiaries`);
  return base('corporate', true, {
    name: company.name,
    canonical_domain: company.domain,
    industry: company.industry,
    employee_band: company.employee_band,
    relationship: 'primary',
  }, Math.round(company.confidence * 100) / 100, `Employer: ${company.name}. This is the company's primary corporate domain.`);
}
