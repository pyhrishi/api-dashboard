/**
 * Job-posting growth signals (F-016) — read a company's hiring as a growth signal.
 *
 * Given a company domain, surface what its open roles say about momentum: how many
 * positions are open, hiring velocity, implied headcount growth, which departments
 * are expanding, the specific roles being hired, locations, and seniority mix.
 * Where a company is hiring — and how fast — is one of the earliest expansion
 * indicators for prospecting and account scoring.
 *
 * Deterministic and coherent: built on the shared company resolver, and a recent
 * raise (from the funding resolver) boosts hiring velocity — so growth signals,
 * firmographics, and funding tell one story. No Math.random, no wall-clock.
 */

import { resolveCompanyFromDomain, normalizeDomain } from '@/lib/company-resolver';
import { resolveFundingForDomain } from '@/lib/funding-resolver';

export type HiringVelocity = 'surging' | 'growing' | 'steady' | 'slowing' | 'frozen';
export type GrowthTier = 'hyper-growth' | 'high-growth' | 'moderate' | 'flat';
export type DeptTrend = 'up' | 'flat' | 'down';

export interface DepartmentSignal { department: string; open: number; share_pct: number; trend: DeptTrend }
export interface RoleSignal { title: string; count: number; department: string; seniority: string }
export interface LocationSignal { city: string; country: string; open: number }
export interface SeniorityMixEntry { level: string; pct: number }

export interface JobGrowthSignals {
  domain: string;
  company: string;
  industry: string;
  open_roles: number;
  net_new_last_90d: number;
  headcount_growth_rate_pct: number;
  hiring_velocity: HiringVelocity;
  growth_tier: GrowthTier;
  /** 0–100 composite of velocity, breadth, and funding tailwind. */
  growth_score: number;
  by_department: DepartmentSignal[];
  top_roles: RoleSignal[];
  locations: LocationSignal[];
  seniority_mix: SeniorityMixEntry[];
  signals: string[];
  funding_context: string | null;
  confidence: number;
  as_of: string;
}

const AS_OF = '2026-09-06';

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
const between = (rng: () => number, lo: number, hi: number) => Math.round(lo + rng() * (hi - lo));

const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Product', 'Design', 'Customer Success', 'Operations', 'Finance', 'People & HR'];
const ROLE_TITLES: Record<string, string[]> = {
  Engineering: ['Senior Software Engineer', 'Staff Engineer', 'Engineering Manager', 'Platform Engineer', 'SRE', 'Frontend Engineer'],
  Sales: ['Account Executive', 'SDR', 'Sales Manager', 'Solutions Engineer', 'Enterprise AE'],
  Marketing: ['Growth Marketer', 'Content Lead', 'Demand Gen Manager', 'Product Marketing Manager'],
  Product: ['Product Manager', 'Senior PM', 'Group PM', 'Technical PM'],
  Design: ['Product Designer', 'Senior Designer', 'Design Lead'],
  'Customer Success': ['CSM', 'Onboarding Specialist', 'CS Manager', 'Support Engineer'],
  Operations: ['RevOps Manager', 'Business Operations', 'Program Manager'],
  Finance: ['Financial Analyst', 'FP&A Manager', 'Controller'],
  'People & HR': ['Technical Recruiter', 'People Ops Manager', 'Talent Partner'],
};
const SENIORITIES = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director'];
const CITIES: { city: string; country: string }[] = [
  { city: 'San Francisco', country: 'United States' },
  { city: 'New York', country: 'United States' },
  { city: 'London', country: 'United Kingdom' },
  { city: 'Bengaluru', country: 'India' },
  { city: 'Berlin', country: 'Germany' },
  { city: 'Remote', country: 'Global' },
];

/** Industry-weighted department emphasis (which teams dominate hiring). */
function departmentWeights(industry: string, rng: () => number): Record<string, number> {
  const w: Record<string, number> = {};
  for (const d of DEPARTMENTS) w[d] = 1 + rng();
  const tech = /soft|tech|internet|saas|comput|data|ai|cloud/i.test(industry);
  if (tech) { w.Engineering += 3; w.Product += 1.2; w.Design += 0.8; }
  else { w.Sales += 2; w.Operations += 1; }
  w.Sales += 1; // sales-led hiring is common across B2B
  return w;
}

function velocityFromScore(score: number): HiringVelocity {
  if (score >= 78) return 'surging';
  if (score >= 58) return 'growing';
  if (score >= 38) return 'steady';
  if (score >= 18) return 'slowing';
  return 'frozen';
}
function tierFromRate(rate: number): GrowthTier {
  if (rate >= 8) return 'hyper-growth';
  if (rate >= 3.5) return 'high-growth';
  if (rate >= 1) return 'moderate';
  return 'flat';
}

/** Resolve hiring/growth signals for a domain. Returns null for personal/invalid domains. */
export function resolveJobGrowthSignals(rawDomain: string): JobGrowthSignals | null {
  const domain = normalizeDomain(rawDomain);
  const company = resolveCompanyFromDomain(domain);
  if (!company || company.is_personal_domain) return null;

  const seed = hash(domain);
  const rng = makeRng(seed);
  const funding = resolveFundingForDomain(domain);

  // Funding tailwind: a later stage / more raised nudges hiring up.
  const raisedM = funding ? funding.total_raised_usd / 1_000_000 : 0;
  const fundingBoost = Math.min(20, Math.round(Math.log10(Math.max(1, raisedM) + 1) * 12));

  // Base velocity score from a stable per-company signal + the funding tailwind.
  const baseScore = between(rng, 20, 80);
  const growth_score = Math.max(0, Math.min(100, baseScore + fundingBoost));
  const hiring_velocity = velocityFromScore(growth_score);

  // Open roles scale with headcount and velocity (roughly 1–9% of the org).
  const openPct = 0.01 + (growth_score / 100) * 0.08;
  const open_roles = Math.max(1, Math.round(company.employee_count * openPct));
  const headcount_growth_rate_pct = Math.round(((open_roles / Math.max(1, company.employee_count)) * 100) * 10) / 10;
  const growth_tier = tierFromRate(headcount_growth_rate_pct);
  const net_new_last_90d = Math.round(open_roles * (0.4 + rng() * 0.8));

  // Distribute open roles across departments by industry-weighted shares, using a
  // largest-remainder allocation so the parts always sum to open_roles exactly.
  const weights = departmentWeights(company.industry, rng);
  const totalW = DEPARTMENTS.reduce((s, d) => s + weights[d], 0);
  const alloc = DEPARTMENTS.map((d) => {
    const exact = (weights[d] / totalW) * open_roles;
    return { department: d, open: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = open_roles - alloc.reduce((s, a) => s + a.open, 0);
  alloc.sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0; i++, remainder--) alloc[i % alloc.length].open += 1;
  let by_department: DepartmentSignal[] = alloc
    .filter((a) => a.open > 0)
    .map((a) => ({ department: a.department, open: a.open, share_pct: 0, trend: 'flat' as DeptTrend }));
  if (by_department.length === 0) by_department = [{ department: alloc[0].department, open: open_roles, share_pct: 100, trend: 'up' }];
  const shownOpen = by_department.reduce((s, d) => s + d.open, 0) || 1;
  by_department.sort((a, b) => b.open - a.open);
  by_department.forEach((d, i) => {
    d.share_pct = Math.round((d.open / shownOpen) * 100);
    d.trend = i === 0 && hiring_velocity !== 'frozen' ? 'up' : rng() < 0.3 ? 'up' : 'flat';
  });

  // Top roles from the leading departments.
  const top_roles: RoleSignal[] = [];
  for (const d of by_department.slice(0, 4)) {
    const titles = ROLE_TITLES[d.department] ?? ['Specialist'];
    const title = pick(rng, titles);
    top_roles.push({ title, count: Math.max(1, Math.round(d.open * (0.3 + rng() * 0.5))), department: d.department, seniority: pick(rng, SENIORITIES) });
  }

  // Locations — the company HQ plus a couple of hubs, weighted to remote.
  const hubs = [...CITIES].sort(() => 0.5 - rng()).slice(0, 3);
  const locSet = [{ city: company.hq_city, country: company.hq_country }, ...hubs];
  const seenLoc = new Set<string>();
  const locations: LocationSignal[] = [];
  let locRemaining = open_roles;
  for (const l of locSet) {
    const key = `${l.city}|${l.country}`;
    if (seenLoc.has(key) || locRemaining <= 0) continue;
    seenLoc.add(key);
    const open = Math.max(1, Math.round(locRemaining * (0.25 + rng() * 0.4)));
    locations.push({ city: l.city, country: l.country, open: Math.min(open, locRemaining) });
    locRemaining -= open;
  }

  const seniority_mix: SeniorityMixEntry[] = (() => {
    const base = [between(rng, 30, 45), between(rng, 25, 35), between(rng, 15, 25), between(rng, 5, 12)];
    const labels = ['IC / Junior', 'Senior', 'Manager', 'Director+'];
    const sum = base.reduce((s, n) => s + n, 0);
    return labels.map((level, i) => ({ level, pct: Math.round((base[i] / sum) * 100) }));
  })();

  const lead = by_department[0];
  const signals: string[] = [];
  if (hiring_velocity === 'surging' || hiring_velocity === 'growing') signals.push(`${lead.department} is the fastest-growing team (${lead.share_pct}% of open roles)`);
  if (fundingBoost >= 10 && funding?.last_round) signals.push(`Hiring accelerated after a ${funding.last_round.stage} round`);
  if (headcount_growth_rate_pct >= 5) signals.push(`Implied headcount growth of ~${headcount_growth_rate_pct}% — a hyper-growth signal`);
  if (locations.some((l) => l.city === 'Remote')) signals.push('Actively opening remote roles');
  if (signals.length === 0) signals.push(`Steady hiring across ${by_department.length} departments`);

  const funding_context = funding && funding.last_round ? `${funding.funding_stage} · $${Math.round(raisedM)}M raised` : null;

  return {
    domain,
    company: company.name,
    industry: company.industry,
    open_roles,
    net_new_last_90d,
    headcount_growth_rate_pct,
    hiring_velocity,
    growth_tier,
    growth_score,
    by_department,
    top_roles,
    locations,
    seniority_mix,
    signals,
    funding_context,
    confidence: company.confidence,
    as_of: AS_OF,
  };
}
