/**
 * Deterministic email → person resolver (single source of truth).
 *
 * Turns a work email into a full, *stable* person profile: the same email always
 * resolves to the same identity, with a confidence score and per-field provenance
 * (which signal produced each field). Pure and deterministic — no Date.now, no
 * Math.random — so the gateway, Explorer, CLI, and the Resolve console all agree.
 *
 * The gateway's `people-search` / `identity-resolve` mock responses are built from
 * this; the Resolve feature renders the gateway's response of the same shape.
 */

export interface ResolvedProvenance {
  /** Which profile field this signal produced (e.g. 'phone'). */
  field: string;
  /** The data source or method (e.g. 'Carrier HLR lookup'). */
  source: string;
  /** Human-readable match signal (e.g. 'MX + SMTP handshake'). */
  signal: string;
  /** Per-field confidence, 0..1. */
  confidence: number;
}

export type Seniority =
  | 'Individual Contributor'
  | 'Senior'
  | 'Lead'
  | 'Manager'
  | 'Director'
  | 'VP'
  | 'C-Suite';

export interface ResolvedPerson {
  id: string;
  email: string;
  email_verified: boolean;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  seniority: Seniority;
  department: string;
  company: string;
  company_domain: string;
  phone: string;
  phone_verified: boolean;
  location: string;
  timezone: string;
  linkedin_url: string;
  github_url: string | null;
  twitter_url: string | null;
  /** Overall confidence, 0..1. */
  confidence: number;
  is_personal_email: boolean;
  /** ISO date (yyyy-mm-dd) the record was last verified — deterministic per email. */
  last_verified: string;
  /** Distinct data sources that contributed. */
  sources: string[];
  provenance: ResolvedProvenance[];
}

// ── Deterministic primitives ────────────────────────────────────────────────
/** FNV-1a 32-bit hash → non-negative int. Stable across runtimes. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic stream from a seed. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

// ── Data pools (realistic, not lorem) ───────────────────────────────────────
const LAST_NAMES = [
  'Sharma', 'Patel', 'Reddy', 'Khan', 'Nair', 'Iyer', 'Chen', 'Kim', 'Nguyen', 'Garcia',
  'Silva', 'Müller', 'Rossi', 'Novak', 'Andersson', 'Okafor', 'Cohen', 'Fischer', 'Costa', 'Watanabe',
];
const DEPARTMENTS = ['Engineering', 'Product', 'Data', 'Marketing', 'Sales', 'Operations', 'Finance', 'Security', 'Design', 'Customer Success'] as const;
const TITLES_BY_DEPT: Record<(typeof DEPARTMENTS)[number], string[]> = {
  Engineering: ['Software Engineer', 'Senior Software Engineer', 'Staff Engineer', 'Engineering Manager', 'VP of Engineering', 'Chief Technology Officer'],
  Product: ['Product Manager', 'Senior Product Manager', 'Group PM', 'Director of Product', 'VP of Product', 'Chief Product Officer'],
  Data: ['Data Analyst', 'Data Scientist', 'Senior Data Scientist', 'Analytics Lead', 'Head of Data', 'VP of Data'],
  Marketing: ['Marketing Manager', 'Growth Lead', 'Demand Gen Manager', 'Director of Marketing', 'VP of Marketing', 'Chief Marketing Officer'],
  Sales: ['Account Executive', 'Senior AE', 'Sales Manager', 'Director of Sales', 'VP of Sales', 'Chief Revenue Officer'],
  Operations: ['Operations Analyst', 'Ops Manager', 'RevOps Lead', 'Director of Operations', 'VP of Operations', 'Chief Operating Officer'],
  Finance: ['Financial Analyst', 'Finance Manager', 'FP&A Lead', 'Director of Finance', 'VP of Finance', 'Chief Financial Officer'],
  Security: ['Security Engineer', 'Senior Security Engineer', 'Security Lead', 'Director of Security', 'VP of Security', 'Chief Information Security Officer'],
  Design: ['Product Designer', 'Senior Designer', 'Design Lead', 'Director of Design', 'VP of Design', 'Chief Design Officer'],
  'Customer Success': ['CS Manager', 'Senior CSM', 'CS Lead', 'Director of CS', 'VP of Customer Success', 'Chief Customer Officer'],
};
// Aligns index → seniority ladder with the 6-long title arrays above.
const SENIORITY_LADDER: Seniority[] = ['Individual Contributor', 'Senior', 'Lead', 'Director', 'VP', 'C-Suite'];
const LOCATIONS: Array<{ city: string; tz: string }> = [
  { city: 'San Francisco, CA', tz: 'America/Los_Angeles' },
  { city: 'New York, NY', tz: 'America/New_York' },
  { city: 'Austin, TX', tz: 'America/Chicago' },
  { city: 'London, UK', tz: 'Europe/London' },
  { city: 'Berlin, DE', tz: 'Europe/Berlin' },
  { city: 'Bengaluru, IN', tz: 'Asia/Kolkata' },
  { city: 'Singapore, SG', tz: 'Asia/Singapore' },
  { city: 'Toronto, CA', tz: 'America/Toronto' },
  { city: 'Sydney, AU', tz: 'Australia/Sydney' },
  { city: 'Amsterdam, NL', tz: 'Europe/Amsterdam' },
];
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com', 'me.com',
]);
const COMPANY_SUFFIX = ['Inc', 'Labs', 'Technologies', 'Systems', 'Global', 'Group', ''];

/** Reference "today" for deterministic freshness (matches the product's demo clock). */
const VERIFY_EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01

function toCompanyName(domainRoot: string, rng: () => number): string {
  const base = domainRoot
    .split(/[-.]/)
    .map((p) => cap(p))
    .join(' ')
    .trim();
  const suffix = pick(rng, COMPANY_SUFFIX);
  return suffix ? `${base} ${suffix}` : base;
}

function isoDaysBefore(epochMs: number, days: number): string {
  const d = new Date(epochMs - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a work email into a full, deterministic person profile.
 * Returns `null` only for structurally invalid input (no '@' with local+domain).
 */
export function resolvePersonFromEmail(rawEmail: string): ResolvedPerson | null {
  const email = String(rawEmail || '').trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1 || !email.slice(at + 1).includes('.')) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const domainRoot = domain.split('.').slice(0, -1).join('.') || domain;
  const isPersonal = PERSONAL_DOMAINS.has(domain);

  const seed = hashString(email);
  const rng = makeRng(seed);

  // Name — parse from the local part when it carries separators, else derive.
  const parts = local.split(/[._\-+]/).filter(Boolean);
  const firstRaw = parts[0] || local;
  const first = cap(firstRaw.replace(/[^a-z]/gi, '')) || 'Alex';
  const last = parts.length > 1 ? cap(parts[1].replace(/[^a-z]/gi, '')) || pick(rng, LAST_NAMES) : pick(rng, LAST_NAMES);
  const fullName = `${first} ${last}`;

  // Role
  const department = pick(rng, DEPARTMENTS);
  const rung = Math.floor(rng() * 6); // 0..5 aligned to ladder + title arrays
  const title = TITLES_BY_DEPT[department][rung];
  const seniority = SENIORITY_LADDER[rung];

  // Location
  const loc = pick(rng, LOCATIONS);

  // Company
  const company = isPersonal ? 'Independent' : toCompanyName(domainRoot, rng);
  const companyDomain = isPersonal ? domain : domain;

  // Phone — deterministic, plausible.
  const areaSeed = seed % 900 + 100;
  const midSeed = (seed >> 4) % 900 + 100;
  const lineSeed = (seed >> 8) % 9000 + 1000;
  const phone = `+1 (${areaSeed}) ${midSeed}-${lineSeed}`;

  // Social handles
  const handle = `${first}${last}`.toLowerCase();
  const linkedin = `https://www.linkedin.com/in/${handle}-${(seed % 900 + 100)}`;
  const hasGithub = department === 'Engineering' || department === 'Data' || rng() > 0.6;
  const github = hasGithub ? `https://github.com/${first.toLowerCase()}${(seed % 90 + 10)}` : null;
  const hasTwitter = rng() > 0.55;
  const twitter = hasTwitter ? `https://x.com/${first.toLowerCase()}_${last.toLowerCase()}` : null;

  // Verification + confidence — corporate + parseable name + reachable ⇒ higher.
  const emailVerified = !isPersonal || rng() > 0.3;
  const phoneVerified = rng() > 0.35;
  let confidence = 0.55;
  if (!isPersonal) confidence += 0.18;
  if (parts.length > 1) confidence += 0.1; // structured name
  if (emailVerified) confidence += 0.08;
  if (phoneVerified) confidence += 0.06;
  confidence += rng() * 0.05;
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);

  const lastVerified = isoDaysBefore(VERIFY_EPOCH, seed % 45);

  const provenance: ResolvedProvenance[] = [
    { field: 'email', source: 'SMTP verification', signal: `MX + mailbox handshake on ${domain}`, confidence: emailVerified ? 0.98 : 0.72 },
    { field: 'full_name', source: parts.length > 1 ? 'Directory match' : 'Local-part inference', signal: parts.length > 1 ? 'Corporate directory record' : 'Derived from email handle', confidence: parts.length > 1 ? 0.94 : 0.7 },
    { field: 'company', source: isPersonal ? 'Freemail classifier' : 'Domain registry', signal: isPersonal ? 'Personal mailbox provider' : `WHOIS + org record for ${domain}`, confidence: isPersonal ? 0.6 : 0.95 },
    { field: 'title', source: 'Professional graph', signal: `${department} profile match`, confidence: 0.86 },
    { field: 'phone', source: 'Carrier HLR lookup', signal: phoneVerified ? 'Active line, carrier-confirmed' : 'Historical association', confidence: phoneVerified ? 0.91 : 0.64 },
    { field: 'linkedin_url', source: 'Social graph', signal: 'Handle + employer cross-match', confidence: 0.88 },
  ];
  const sources = Array.from(new Set(provenance.map((p) => p.source)));

  return {
    id: `person_${seed.toString(36).padStart(7, '0')}`,
    email,
    email_verified: emailVerified,
    first_name: first,
    last_name: last,
    full_name: fullName,
    title,
    seniority,
    department,
    company,
    company_domain: companyDomain,
    phone,
    phone_verified: phoneVerified,
    location: loc.city,
    timezone: loc.tz,
    linkedin_url: linkedin,
    github_url: github,
    twitter_url: twitter,
    confidence,
    is_personal_email: isPersonal,
    last_verified: lastVerified,
    sources,
    provenance,
  };
}
