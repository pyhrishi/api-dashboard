/**
 * Person demographic append (F-014) — append a contact's PROFESSIONAL demographics.
 *
 * Given an email, append the role-and-career signals a B2B team can act on:
 * seniority tier, department, job function, management level, decision-making /
 * buying role, years of experience and tenure, education, and top skills.
 *
 * Compliance-native by design: this appends *professional* demographics only.
 * Protected characteristics — age, gender, race/ethnicity, religion — are never
 * inferred or returned, and the response says so explicitly (`excluded_attributes`).
 *
 * Deterministic and coherent: the professional taxonomy (seniority, function,
 * department, management level, decision-maker) comes from the same title
 * normalizer the rest of the product uses, so a demographic append agrees with a
 * direct person lookup. No Math.random, no wall-clock.
 */

import { resolvePersonFromEmail, type Seniority } from '@/lib/person-resolver';
import { normalizeJobTitle, type JobFunction, type ManagementLevel } from '@/lib/title-normalizer';

export type BuyingRole = 'decision_maker' | 'influencer' | 'end_user' | 'gatekeeper';

export interface PersonDemographics {
  email: string;
  full_name: string;
  title: string;
  canonical_title: string;
  seniority: Seniority;
  seniority_tier: number; // 1 (IC) … 7 (C-Suite)
  department: string;
  job_function: JobFunction;
  management_level: ManagementLevel;
  is_decision_maker: boolean;
  buying_role: BuyingRole;
  years_experience: number;
  years_experience_band: string;
  years_in_role: number;
  years_at_company: number;
  education_level: string;
  field_of_study: string;
  skills: string[];
  /** 0–100 composite of tier, decision authority, and experience. */
  seniority_score: number;
  /** Protected characteristics Zinbit does NOT infer or return, by design. */
  excluded_attributes: string[];
  confidence: number;
  as_of: string;
}

const AS_OF = '2026-09-06';
const EXCLUDED = ['age', 'gender', 'race_ethnicity', 'religion', 'marital_status', 'nationality'];

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

const SENIORITY_TIER: Record<Seniority, number> = {
  'Individual Contributor': 1, 'Senior': 2, 'Lead': 3, 'Manager': 4, 'Director': 5, 'VP': 6, 'C-Suite': 7,
};
/** Typical minimum years of experience by seniority — an anchor, not an age proxy. */
const SENIORITY_MIN_YEARS: Record<Seniority, number> = {
  'Individual Contributor': 0, 'Senior': 4, 'Lead': 6, 'Manager': 8, 'Director': 11, 'VP': 14, 'C-Suite': 17,
};

const SKILLS_BY_FUNCTION: Record<JobFunction, string[]> = {
  Engineering: ['Distributed systems', 'API design', 'Cloud architecture', 'CI/CD', 'Kubernetes', 'System design', 'Observability'],
  Product: ['Roadmapping', 'Discovery', 'A/B testing', 'PRD writing', 'Stakeholder alignment', 'Analytics'],
  Design: ['Design systems', 'Prototyping', 'User research', 'Interaction design', 'Accessibility'],
  'Data & Analytics': ['SQL', 'Data modeling', 'Experimentation', 'dbt', 'ML pipelines', 'Dashboarding'],
  Sales: ['Pipeline management', 'MEDDIC', 'Negotiation', 'Account planning', 'Forecasting', 'Outbound'],
  Marketing: ['Demand gen', 'Positioning', 'SEO', 'Lifecycle marketing', 'Attribution', 'Content strategy'],
  'Customer Success': ['Onboarding', 'Renewals', 'QBRs', 'Churn analysis', 'Adoption'],
  Operations: ['Process design', 'RevOps', 'Vendor management', 'Automation', 'Capacity planning'],
  Finance: ['FP&A', 'Modeling', 'Budgeting', 'GAAP', 'Unit economics'],
  'People & HR': ['Talent acquisition', 'Comp & benefits', 'L&D', 'Employer branding'],
  Legal: ['Contracts', 'Compliance', 'Privacy (GDPR/DPDP)', 'IP', 'Risk'],
  Executive: ['Strategy', 'Org design', 'Board management', 'Capital allocation', 'GTM'],
  General: ['Project management', 'Cross-functional collaboration', 'Communication'],
};
/** Fields of study skew by function — a soft, deterministic association. */
const FIELDS_BY_FUNCTION: Record<JobFunction, string[]> = {
  Engineering: ['Computer Science', 'Electrical Engineering', 'Software Engineering'],
  Product: ['Business', 'Computer Science', 'Human-Computer Interaction'],
  Design: ['Design', 'Fine Arts', 'Human-Computer Interaction'],
  'Data & Analytics': ['Statistics', 'Computer Science', 'Mathematics'],
  Sales: ['Business', 'Communications', 'Economics'],
  Marketing: ['Marketing', 'Communications', 'Business'],
  'Customer Success': ['Business', 'Communications', 'Psychology'],
  Operations: ['Industrial Engineering', 'Business', 'Operations Research'],
  Finance: ['Finance', 'Accounting', 'Economics'],
  'People & HR': ['Human Resources', 'Psychology', 'Organizational Behavior'],
  Legal: ['Law', 'Political Science'],
  Executive: ['Business', 'Economics', 'Engineering'],
  General: ['Business', 'Liberal Arts'],
};
function experienceBand(years: number): string {
  if (years < 3) return '0–2 years';
  if (years < 6) return '3–5 years';
  if (years < 11) return '6–10 years';
  if (years < 16) return '11–15 years';
  if (years < 21) return '16–20 years';
  return '20+ years';
}

function buyingRoleFor(level: ManagementLevel, isDecisionMaker: boolean, fn: JobFunction): BuyingRole {
  if (level === 'Executive') return 'decision_maker';
  if (isDecisionMaker) return 'influencer';
  if (fn === 'Operations' || fn === 'Finance' || fn === 'Legal') return 'gatekeeper';
  return 'end_user';
}

/** Education skews higher for more technical functions and higher seniority. */
function educationFor(rng: () => number, fn: JobFunction, tier: number): string {
  const technical = fn === 'Engineering' || fn === 'Data & Analytics' || fn === 'Legal';
  const roll = rng() + (technical ? 0.15 : 0) + (tier >= 6 ? 0.15 : 0);
  if (roll > 1.15) return 'PhD';
  if (roll > 0.85) return tier >= 5 ? 'MBA' : "Master's";
  if (roll > 0.35) return "Bachelor's";
  return pick(rng, ['Associate', "Bachelor's"]);
}

/**
 * Append professional demographics for an email. Returns null for personal or
 * unresolvable emails (no corporate role to profile).
 */
export function appendDemographics(rawEmail: string): PersonDemographics | null {
  const person = resolvePersonFromEmail(rawEmail);
  if (!person || person.is_personal_email) return null;

  const norm = normalizeJobTitle(person.title);
  const seniority = person.seniority;
  const tier = SENIORITY_TIER[seniority] ?? 1;
  const fn: JobFunction = norm?.function ?? 'General';
  const department = norm?.department ?? person.department;
  const managementLevel: ManagementLevel = norm?.management_level ?? 'Individual contributor';
  const isDecisionMaker = norm?.is_decision_maker ?? tier >= 4;

  const seed = hash(person.email);
  const rng = makeRng(seed);

  const minYears = SENIORITY_MIN_YEARS[seniority] ?? 0;
  const years_experience = minYears + Math.floor(rng() * 6); // spread above the anchor
  const years_at_company = Math.max(1, Math.min(years_experience, 1 + Math.floor(rng() * Math.min(9, years_experience + 1))));
  const years_in_role = Math.max(1, Math.min(years_at_company, 1 + Math.floor(rng() * 4)));

  const skillPool = SKILLS_BY_FUNCTION[fn] ?? SKILLS_BY_FUNCTION.General;
  const skillCount = 3 + Math.floor(rng() * 3);
  const skills: string[] = [];
  const usedIdx = new Set<number>();
  while (skills.length < Math.min(skillCount, skillPool.length)) {
    const i = Math.floor(rng() * skillPool.length);
    if (usedIdx.has(i)) continue;
    usedIdx.add(i);
    skills.push(skillPool[i]);
  }

  const education_level = educationFor(rng, fn, tier);
  const field_of_study = pick(rng, FIELDS_BY_FUNCTION[fn] ?? FIELDS_BY_FUNCTION.General);
  const buying_role = buyingRoleFor(managementLevel, isDecisionMaker, fn);

  // Composite 0–100: tier (up to 60) + decision authority (20) + experience (20).
  const seniority_score = Math.min(100, Math.round((tier / 7) * 60 + (isDecisionMaker ? 20 : 0) + Math.min(20, years_experience)));

  return {
    email: person.email,
    full_name: person.full_name,
    title: person.title,
    canonical_title: norm?.canonical_title ?? person.title,
    seniority,
    seniority_tier: tier,
    department,
    job_function: fn,
    management_level: managementLevel,
    is_decision_maker: isDecisionMaker,
    buying_role,
    years_experience,
    years_experience_band: experienceBand(years_experience),
    years_in_role,
    years_at_company,
    education_level,
    field_of_study,
    skills,
    seniority_score,
    excluded_attributes: [...EXCLUDED],
    confidence: person.confidence,
    as_of: AS_OF,
  };
}
