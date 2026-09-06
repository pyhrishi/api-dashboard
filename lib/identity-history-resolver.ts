/**
 * Historical identity graph (F-035) — how a person's identity changed over time.
 *
 * Given an email, reconstruct the contact's identity timeline: the companies they
 * worked at, the emails and titles they held, and the transitions between them
 * (job change, promotion, relocation, email change) — all tied together by their
 * persistent Zinbit ID, so the same person is one identity across a career of
 * changing addresses. This is what keeps a CRM record from going stale: you can
 * see that jane@oldco.com is the same person as j.doe@newco.com.
 *
 * Deterministic and coherent: the current state is the resolved person, and the
 * history is generated backwards from it (seniority decreasing into the past,
 * function preserved). Built on the shared person resolver + Zinbit ID. No
 * Math.random, no wall-clock in the shape of the timeline.
 */

import { resolvePersonFromEmail, type Seniority } from '@/lib/person-resolver';
import { zidForPerson } from '@/lib/zinbit-id';

export type TransitionType = 'job_change' | 'promotion' | 'relocation' | 'email_change' | 'company_rebrand';

export interface IdentityState {
  id: string;
  period_start: string; // YYYY-MM
  period_end: string | null; // null = current
  is_current: boolean;
  email: string;
  company: string;
  domain: string;
  title: string;
  seniority: Seniority;
  location: string;
  duration_months: number;
}

export interface IdentityTransition {
  at: string; // YYYY-MM
  type: TransitionType;
  from: string; // state id
  to: string; // state id
  detail: string;
}

export interface IdentityHistory {
  zinbit_id: string;
  subject_email: string;
  current_state_id: string;
  /** Chronological, newest (current) first. */
  states: IdentityState[];
  transitions: IdentityTransition[];
  span_years: number;
  employer_count: number;
  confidence: number;
  as_of: string;
}

const NOW = { year: 2026, month: 9 };

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
const between = (rng: () => number, lo: number, hi: number) => Math.floor(lo + rng() * (hi - lo + 1));

/** Subtract `months` from a {year,month} and format as YYYY-MM. */
function minusMonths(y: number, m: number, months: number): { year: number; month: number; iso: string } {
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, iso: `${year}-${String(month).padStart(2, '0')}` };
}

const SENIORITY_LADDER: Seniority[] = ['Individual Contributor', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Suite'];

const PRIOR_EMPLOYERS: { name: string; domain: string }[] = [
  { name: 'Nimbus Software', domain: 'nimbussoftware.com' },
  { name: 'Cobalt Labs', domain: 'cobaltlabs.io' },
  { name: 'Meridian Analytics', domain: 'meridiananalytics.com' },
  { name: 'Vertex Systems', domain: 'vertexsystems.com' },
  { name: 'Harbor Digital', domain: 'harbordigital.com' },
  { name: 'Kestrel Data', domain: 'kestreldata.io' },
  { name: 'Anvil Cloud', domain: 'anvilcloud.com' },
  { name: 'Lumen Works', domain: 'lumenworks.co' },
  { name: 'Perch Technologies', domain: 'perchtech.com' },
  { name: 'Riverstone Group', domain: 'riverstone.io' },
];

const PRIOR_CITIES = ['Austin, US', 'Denver, US', 'Chicago, US', 'Boston, US', 'Toronto, CA', 'Dublin, IE', 'Bengaluru, IN', 'Remote'];

const singular = (dept: string) => dept.replace(/s$/, '').replace(/ & .*/, '');

function titleFor(seniority: Seniority, dept: string): string {
  const d = dept || 'Operations';
  switch (seniority) {
    case 'C-Suite': return `Head of ${d}`;
    case 'VP': return `VP, ${d}`;
    case 'Director': return `Director of ${d}`;
    case 'Manager': return `${d} Manager`;
    case 'Lead': return `${d} Lead`;
    case 'Senior': return `Senior ${singular(d)} Specialist`;
    default: return `${singular(d)} Associate`;
  }
}

function emailForName(first: string, last: string, domain: string): string {
  const l = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
  return `${l || 'contact'}@${domain}`;
}

/** Reconstruct a contact's identity timeline. Returns null for personal/unresolvable emails. */
export function resolveIdentityHistory(rawEmail: string): IdentityHistory | null {
  const person = resolvePersonFromEmail(rawEmail);
  if (!person || person.is_personal_email) return null;

  const seed = hash(person.email);
  const rng = makeRng(seed);
  const zinbit_id = zidForPerson(person);
  const dept = person.department || 'Operations';
  const currentIdx = Math.max(0, SENIORITY_LADDER.indexOf(person.seniority));

  // How many prior roles: more senior people have longer histories.
  const priorCount = Math.min(currentIdx, between(rng, currentIdx >= 4 ? 2 : 1, currentIdx >= 4 ? 4 : 2));

  const states: IdentityState[] = [];
  const transitions: IdentityTransition[] = [];

  // Current state (anchored to the resolved person).
  const currentTenure = between(rng, 12, 60);
  const currentStart = minusMonths(NOW.year, NOW.month, currentTenure);
  const currentId = `state_${(seed % 100000).toString(36)}0`;
  states.push({
    id: currentId,
    period_start: currentStart.iso,
    period_end: null,
    is_current: true,
    email: person.email,
    company: person.company,
    domain: person.company_domain,
    title: person.title,
    seniority: person.seniority,
    location: person.location,
    duration_months: currentTenure,
  });

  // Walk backwards through prior roles.
  let cursor = currentStart; // this role started here → the prior role ended here
  let prevState = states[0];
  const usedEmployers = new Set<string>();
  const [first, last] = [person.first_name, person.last_name];
  for (let k = 1; k <= priorCount; k++) {
    const seniority = SENIORITY_LADDER[Math.max(0, currentIdx - k)];
    const employer = (() => {
      let e = pick(rng, PRIOR_EMPLOYERS);
      let guard = 0;
      while (usedEmployers.has(e.domain) && guard++ < 10) e = pick(rng, PRIOR_EMPLOYERS);
      usedEmployers.add(e.domain);
      return e;
    })();
    const duration = between(rng, 14, 48);
    const start = minusMonths(cursor.year, cursor.month, duration);
    const location = rng() < 0.4 ? pick(rng, PRIOR_CITIES) : prevState.location;
    const email = emailForName(first, last, employer.domain);
    const state: IdentityState = {
      id: `state_${(seed % 100000).toString(36)}${k}`,
      period_start: start.iso,
      period_end: cursor.iso,
      is_current: false,
      email,
      company: employer.name,
      domain: employer.domain,
      title: titleFor(seniority, dept),
      seniority,
      location,
      duration_months: duration,
    };
    states.push(state);

    // Transition from this (older) state → the next (newer) state.
    const promoted = SENIORITY_LADDER.indexOf(prevState.seniority) > SENIORITY_LADDER.indexOf(seniority);
    transitions.push({
      at: cursor.iso,
      type: promoted ? 'promotion' : 'job_change',
      from: state.id,
      to: prevState.id,
      detail: promoted
        ? `Left ${state.company} for ${prevState.company}, stepping up to ${prevState.seniority}`
        : `Moved from ${state.company} to ${prevState.company}`,
    });
    if (state.location !== prevState.location) {
      transitions.push({ at: cursor.iso, type: 'relocation', from: state.id, to: prevState.id, detail: `Relocated ${state.location} → ${prevState.location}` });
    }
    transitions.push({ at: cursor.iso, type: 'email_change', from: state.id, to: prevState.id, detail: `${state.email} → ${prevState.email}` });

    cursor = start;
    prevState = state;
  }

  const oldest = states[states.length - 1];
  const spanMonths = (NOW.year * 12 + NOW.month) - (Number(oldest.period_start.slice(0, 4)) * 12 + Number(oldest.period_start.slice(5, 7)));
  const employerDomains = new Set(states.map((s) => s.domain));

  return {
    zinbit_id,
    subject_email: person.email,
    current_state_id: currentId,
    states,
    transitions: transitions.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    span_years: Math.round((spanMonths / 12) * 10) / 10,
    employer_count: employerDomains.size,
    confidence: person.confidence,
    as_of: `${NOW.year}-${String(NOW.month).padStart(2, '0')}`,
  };
}
