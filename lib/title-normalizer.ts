/**
 * Job title normalization — deterministic parser (single source of truth).
 *
 * Maps a raw, messy job title ("Sr. SWE II", "VP, Eng", "Head of Growth") to a
 * canonical title plus a normalized seniority, function, department, and
 * management level, with the lexicon tokens that produced each. Pure parsing —
 * deterministic by construction, no randomness. Seniority aligns with the
 * `Seniority` ladder in `lib/person-resolver.ts` so the taxonomy is one system.
 */

import type { Seniority } from '@/lib/person-resolver';

export type JobFunction =
  | 'Engineering'
  | 'Product'
  | 'Design'
  | 'Data & Analytics'
  | 'Sales'
  | 'Marketing'
  | 'Customer Success'
  | 'Operations'
  | 'Finance'
  | 'People & HR'
  | 'Legal'
  | 'Executive'
  | 'General';

export type ManagementLevel = 'Individual contributor' | 'People manager' | 'Executive';

export interface TitleSignal {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface TitleNormalization {
  input: string;
  canonical_title: string;
  seniority: Seniority;
  function: JobFunction;
  department: string;
  management_level: ManagementLevel;
  /** True for Manager and above — useful for lead routing / scoring. */
  is_decision_maker: boolean;
  confidence: number;
  matched_signals: TitleSignal[];
}

// Seniority lexicon — highest precedence first; first match wins.
const SENIORITY_RULES: { level: Seniority; re: RegExp }[] = [
  { level: 'VP', re: /\b(svp|evp|vp|vice[-\s]?president)\b/ },
  { level: 'C-Suite', re: /\b(ceo|cto|cfo|coo|cmo|cio|ciso|cpo|cro|cdo|chief|founder|co[-\s]?founder|owner|president)\b/ },
  { level: 'Director', re: /\b(director|head[-\s]of|dir)\b/ },
  { level: 'Manager', re: /\b(manager|mgr|supervisor)\b/ },
  { level: 'Lead', re: /\b(lead|principal|staff|architect)\b/ },
  { level: 'Senior', re: /\b(senior|sr|snr)\b/ },
];

// Function lexicon — first match wins.
const FUNCTION_RULES: { fn: JobFunction; re: RegExp }[] = [
  { fn: 'Engineering', re: /\b(engineer|engineering|developer|dev|swe|software|devops|sre|infrastructure|backend|front[-\s]?end|full[-\s]?stack|programmer|qa|sdet)\b/ },
  { fn: 'Data & Analytics', re: /\b(data|analytics|analyst|machine[-\s]?learning|\bml\b|\bai\b|scientist|statistician|bi)\b/ },
  { fn: 'Product', re: /\b(product|pm)\b/ },
  { fn: 'Design', re: /\b(design|designer|ux|ui|creative)\b/ },
  { fn: 'Sales', re: /\b(sales|account executive|ae|business development|bd|bdr|sdr|revenue|quota|partnerships)\b/ },
  { fn: 'Marketing', re: /\b(marketing|growth|demand[-\s]?gen|seo|content|communications|pr|brand|social media)\b/ },
  { fn: 'Customer Success', re: /\b(customer success|success|support|customer experience|cx|csm|onboarding|account manager)\b/ },
  { fn: 'Operations', re: /\b(operations|ops|logistics|supply chain|procurement|program manager|pmo)\b/ },
  { fn: 'Finance', re: /\b(finance|financial|accounting|accountant|controller|treasury|fp&a|audit)\b/ },
  { fn: 'People & HR', re: /\b(hr|human resources|people|talent|recruit|recruiter|recruiting)\b/ },
  { fn: 'Legal', re: /\b(legal|counsel|attorney|lawyer|compliance|paralegal)\b/ },
];

const CHIEF_TITLES: Record<string, string> = {
  ceo: 'Chief Executive Officer',
  cto: 'Chief Technology Officer',
  cfo: 'Chief Financial Officer',
  coo: 'Chief Operating Officer',
  cmo: 'Chief Marketing Officer',
  cio: 'Chief Information Officer',
  ciso: 'Chief Information Security Officer',
  cpo: 'Chief Product Officer',
  cro: 'Chief Revenue Officer',
  cdo: 'Chief Data Officer',
};

const FN_TO_CHIEF: Partial<Record<JobFunction, string>> = {
  Engineering: 'Chief Technology Officer',
  'Data & Analytics': 'Chief Data Officer',
  Product: 'Chief Product Officer',
  Sales: 'Chief Revenue Officer',
  Marketing: 'Chief Marketing Officer',
  Finance: 'Chief Financial Officer',
  Operations: 'Chief Operating Officer',
  'People & HR': 'Chief People Officer',
  Legal: 'Chief Legal Officer',
};

const IC_ROLE: Record<JobFunction, string> = {
  Engineering: 'Software Engineer',
  Product: 'Product Manager',
  Design: 'Designer',
  'Data & Analytics': 'Data Analyst',
  Sales: 'Account Executive',
  Marketing: 'Marketing Specialist',
  'Customer Success': 'Customer Success Specialist',
  Operations: 'Operations Specialist',
  Finance: 'Financial Analyst',
  'People & HR': 'HR Specialist',
  Legal: 'Legal Counsel',
  Executive: 'Executive',
  General: 'Specialist',
};

function firstMatch<T>(rules: { value: T; re: RegExp }[], text: string): { value: T; token: string } | null {
  for (const r of rules) {
    const m = r.re.exec(text);
    if (m) return { value: r.value, token: (m[1] ?? m[0]).trim() };
  }
  return null;
}

function buildCanonical(seniority: Seniority, fn: JobFunction, chiefToken: string | null, headOf: boolean): string {
  switch (seniority) {
    case 'C-Suite':
      if (chiefToken && CHIEF_TITLES[chiefToken]) return CHIEF_TITLES[chiefToken];
      return FN_TO_CHIEF[fn] ?? 'Chief Executive Officer';
    case 'VP':
      return fn === 'General' || fn === 'Executive' ? 'Vice President' : `VP, ${fn}`;
    case 'Director':
      if (fn === 'General' || fn === 'Executive') return 'Director';
      return headOf ? `Head of ${fn}` : `Director, ${fn}`;
    case 'Manager':
      return fn === 'General' || fn === 'Executive' ? 'Manager' : `${fn} Manager`;
    case 'Lead':
      return fn === 'General' || fn === 'Executive' ? 'Team Lead' : `${fn} Lead`;
    case 'Senior':
      return `Senior ${IC_ROLE[fn]}`;
    default:
      return IC_ROLE[fn];
  }
}

export function normalizeJobTitle(raw: string): TitleNormalization | null {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  // Lower-case; collapse separators to spaces for matching (keep '&' for fp&a).
  const text = input.toLowerCase().replace(/[/|,]/g, ' ').replace(/\s+/g, ' ').trim();

  const senHit = firstMatch(SENIORITY_RULES.map((r) => ({ value: r.level, re: r.re })), text);
  const fnHit = firstMatch(FUNCTION_RULES.map((r) => ({ value: r.fn, re: r.re })), text);

  const seniority: Seniority = senHit?.value ?? 'Individual Contributor';
  let fn: JobFunction = fnHit?.value ?? 'General';

  // A generic C-suite title with no function reads as Executive, not General.
  const chiefMatch = /\b(ceo|cto|cfo|coo|cmo|cio|ciso|cpo|cro|cdo)\b/.exec(text);
  const chiefToken = chiefMatch ? chiefMatch[1] : null;
  if (seniority === 'C-Suite' && fn === 'General') fn = 'Executive';

  const headOf = /\bhead[-\s]of\b/.test(text);
  const canonical_title = buildCanonical(seniority, fn, chiefToken, headOf);

  let management_level: ManagementLevel = 'Individual contributor';
  if (seniority === 'C-Suite' || seniority === 'VP') management_level = 'Executive';
  else if (seniority === 'Director' || seniority === 'Manager') management_level = 'People manager';

  const is_decision_maker = ['Manager', 'Director', 'VP', 'C-Suite'].includes(seniority);

  let confidence = 0.55;
  if (senHit) confidence += 0.22;
  if (fnHit) confidence += 0.2;
  confidence = Math.min(0.98, Math.round(confidence * 100) / 100);

  const department = fn === 'Executive' ? 'Executive' : fn === 'General' ? 'Unclassified' : fn;

  const matched_signals: TitleSignal[] = [
    {
      field: 'seniority',
      source: 'Title lexicon',
      signal: senHit ? `Matched "${senHit.token}" → ${seniority}` : `No seniority keyword; defaulted to ${seniority}`,
      confidence: senHit ? 0.95 : 0.5,
    },
    {
      field: 'function',
      source: 'Function lexicon',
      signal: fnHit ? `Matched "${fnHit.token}" → ${fn}` : `No function keyword; defaulted to ${fn}`,
      confidence: fnHit ? 0.9 : 0.5,
    },
    {
      field: 'management_level',
      source: 'Role heuristics',
      signal: `${seniority} ⇒ ${management_level}${is_decision_maker ? ' · decision-maker' : ''}`,
      confidence: 0.88,
    },
  ];

  return {
    input,
    canonical_title,
    seniority,
    function: fn,
    department,
    management_level,
    is_decision_maker,
    confidence,
    matched_signals,
  };
}
