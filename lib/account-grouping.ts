/**
 * Household & account grouping (F-032) — cluster a contact list into buying accounts.
 *
 * Paste a messy list of emails and domains and get it organized into accounts: all
 * contacts at the same company roll up together, each account carries the company's
 * facts and its corporate-family context (via the hierarchy resolver, so a
 * subsidiary reads as part of its parent), and the buying committee is surfaced from
 * the roles present. Personal and unrecognized inputs are set aside, not
 * force-fit into an account.
 *
 * Deterministic and coherent: built on the shared company + hierarchy resolvers,
 * so an account's facts agree with a direct lookup. No Math.random, no wall-clock.
 */

import { resolveCompanyFromDomain, normalizeDomain } from '@/lib/company-resolver';
import { resolveCompanyHierarchy } from '@/lib/company-hierarchy';

export interface AccountMember {
  input: string;
  email: string | null;
  name: string;
  role_hint: string | null;
}

export interface CorporateFamily {
  ultimate_parent: string;
  relationship: 'standalone' | 'parent' | 'subsidiary';
  family_size: number;
}

export interface AccountGroup {
  account_id: string;
  domain: string;
  company: string;
  industry: string;
  hq: string;
  employee_band: string;
  member_count: number;
  members: AccountMember[];
  /** Distinct functional roles identifiable across the account's contacts. */
  buying_committee: string[];
  corporate_family: CorporateFamily | null;
  confidence: number;
}

export interface UngroupedInput {
  input: string;
  reason: string;
}

export interface AccountGroupingResult {
  accounts: AccountGroup[];
  ungrouped: UngroupedInput[];
  total_inputs: number;
  account_count: number;
  grouped_count: number;
  largest_account: string | null;
  as_of: string;
}

const AS_OF = '2026-09-06';

const ROLE_PATTERNS: [RegExp, string][] = [
  [/(^|[._-])(ceo|founder|owner|president|chief[._-]?exec)($|[._-])/i, 'Executive'],
  [/(^|[._-])(cto|cio|ciso|chief[._-]?tech)($|[._-])/i, 'Technology leader'],
  [/(^|[._-])(cfo|finance|controller|accountspayable|billing|ap)($|[._-])/i, 'Finance'],
  [/(^|[._-])(cmo|marketing|growth|demand|brand)($|[._-])/i, 'Marketing'],
  [/(^|[._-])(sales|revenue|ae|sdr|bdr|account[._-]?exec)($|[._-])/i, 'Sales'],
  [/(^|[._-])(eng|dev|developer|engineer|it|devops|platform|sre)($|[._-])/i, 'Engineering'],
  [/(^|[._-])(hr|people|talent|recruit)($|[._-])/i, 'People / HR'],
  [/(^|[._-])(legal|counsel|compliance|privacy)($|[._-])/i, 'Legal'],
  [/(^|[._-])(support|help|success|cs|care)($|[._-])/i, 'Customer Success'],
  [/(^|[._-])(procurement|purchasing|buyer|vendor)($|[._-])/i, 'Procurement'],
  [/(^|[._-])(info|contact|hello|admin|team|sales?ops|ops)($|[._-])/i, 'General / Shared'],
];

function roleHint(local: string): string | null {
  for (const [re, role] of ROLE_PATTERNS) if (re.test(local)) return role;
  return null;
}

function nameFromLocal(local: string): string {
  const parts = local.replace(/\d+/g, '').split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return local;
  // A single role-ish token (ceo, sales) reads better upper-cased short, else title case.
  return parts.map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(' ');
}

function accountId(domain: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) { h ^= domain.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `acct_${(h >>> 0).toString(36)}`;
}

interface Pending { members: AccountMember[] }

/** Cluster a list of email/domain contacts into buying accounts. */
export function groupIntoAccounts(inputs: string[]): AccountGroupingResult {
  const cleaned = Array.from(new Set(inputs.map((s) => String(s ?? '').trim()).filter(Boolean)));
  const byDomain = new Map<string, Pending>();
  const ungrouped: UngroupedInput[] = [];

  for (const input of cleaned) {
    let domain = '';
    let email: string | null = null;
    let local = '';
    if (input.includes('@')) {
      email = input.toLowerCase();
      const [l, d] = email.split('@');
      local = l ?? '';
      domain = normalizeDomain(d ?? '');
    } else if (/\./.test(input)) {
      domain = normalizeDomain(input);
    } else {
      ungrouped.push({ input, reason: 'Not an email or domain' });
      continue;
    }

    if (!domain) { ungrouped.push({ input, reason: 'Could not parse a domain' }); continue; }
    const company = resolveCompanyFromDomain(domain);
    if (!company) { ungrouped.push({ input, reason: 'Unrecognized company domain' }); continue; }
    if (company.is_personal_domain) { ungrouped.push({ input, reason: 'Personal mailbox — not a company account' }); continue; }

    const member: AccountMember = {
      input,
      email,
      name: email ? nameFromLocal(local) : `${company.name} (domain)`,
      role_hint: email ? roleHint(local) : null,
    };
    const bucket = byDomain.get(domain) ?? { members: [] };
    bucket.members.push(member);
    byDomain.set(domain, bucket);
  }

  const accounts: AccountGroup[] = [];
  byDomain.forEach((bucket, domain) => {
    const company = resolveCompanyFromDomain(domain)!;
    const hierarchy = resolveCompanyHierarchy(domain);
    let corporate_family: CorporateFamily | null = null;
    if (hierarchy) {
      const parent = hierarchy.nodes.find((n) => n.is_ultimate_parent);
      corporate_family = {
        ultimate_parent: parent ? parent.name : company.name,
        relationship: hierarchy.role,
        family_size: hierarchy.total_entities,
      };
    }
    const buying_committee = Array.from(new Set(bucket.members.map((m) => m.role_hint).filter((r): r is string => !!r)));
    accounts.push({
      account_id: accountId(domain),
      domain,
      company: company.name,
      industry: company.industry,
      hq: `${company.hq_city}, ${company.hq_country}`,
      employee_band: company.employee_band,
      member_count: bucket.members.length,
      members: bucket.members,
      buying_committee,
      corporate_family,
      confidence: company.confidence,
    });
  });

  accounts.sort((a, b) => b.member_count - a.member_count || a.company.localeCompare(b.company));

  return {
    accounts,
    ungrouped,
    total_inputs: cleaned.length,
    account_count: accounts.length,
    grouped_count: accounts.reduce((n, a) => n + a.member_count, 0),
    largest_account: accounts[0]?.company ?? null,
    as_of: AS_OF,
  };
}
