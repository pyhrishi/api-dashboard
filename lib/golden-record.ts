/**
 * Golden-record snapshots (F-054) — version the canonical record for each entity.
 *
 * A golden record is the reconciled, trusted set of field values for one entity
 * (the output shape of F-027 reconciliation). This module builds that record
 * *as of* a point in time and packages it into an immutable, versioned snapshot
 * so a team can answer "what did we believe about this account on the day we
 * signed?" — diff any two versions field-by-field (old → new, which source drove
 * the change, confidence delta), pin a version as the record of truth, and keep
 * an auditable history.
 *
 * The field-evolution model is deterministic: each field carries a seeded change
 * event (a promotion, a relocation, a headcount jump, a funding round), so the
 * value returned for an earlier `asOf` differs from a later one in exactly the
 * fields that changed between them — which makes the version diffs real and
 * explainable. Pure — FNV-1a, no Math.random, no wall-clock (a frozen reference
 * "now"), so the same entity always produces the same history.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain, normalizeDomain, isValidDomain } from '@/lib/company-resolver';
import { zidForPerson, zidForCompany } from '@/lib/zinbit-id';

export type GoldenEntityType = 'person' | 'company';

export interface GoldenField {
  field: string;
  value: string;
  /** 0..1 — confidence in this value at capture time. */
  confidence: number;
  /** The provider/source that drove the winning value. */
  source: string;
  /** YYYY-MM-DD the value was last observed as of this record. */
  observedAt: string;
}

export interface GoldenRecord {
  entityKey: string;
  entityType: GoldenEntityType;
  zinbitId: string;
  display: string;
  fields: GoldenField[];
  /** Mean field confidence, 0..1. */
  overallConfidence: number;
  /** The point in time this record reflects (YYYY-MM-DD). */
  asOf: string;
}

export interface GoldenSnapshot {
  id: string;
  entityKey: string;
  entityType: GoldenEntityType;
  display: string;
  zinbitId: string;
  /** Monotonic per entity, starting at 1. */
  version: number;
  /** When the snapshot was taken (YYYY-MM-DD). */
  capturedAt: string;
  /** The point in time the record reflects (YYYY-MM-DD). */
  asOf: string;
  /** Content hash of the fields — identical fields ⇒ identical hash. */
  hash: string;
  fields: GoldenField[];
  overallConfidence: number;
  /** Optional human label. */
  label: string;
  /** True for the version pinned as the record of truth. */
  pinned: boolean;
  /** How the snapshot was created. */
  origin: 'seed' | 'manual';
}

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface FieldDiff {
  field: string;
  status: DiffStatus;
  before: string | null;
  after: string | null;
  sourceBefore: string | null;
  sourceAfter: string | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
}

export interface SnapshotDiff {
  fromVersion: number;
  toVersion: number;
  fields: FieldDiff[];
  changedCount: number;
  addedCount: number;
  removedCount: number;
  /** Net confidence change (after − before), −1..1. */
  confidenceDelta: number;
}

// Frozen reference "now" — the latest point any snapshot can reflect.
const REF_NOW = '2026-09-01';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Deterministic primitives ────────────────────────────────────────────────

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const B36 = (n: number) => (n >>> 0).toString(36);

/** A YYYY-MM-DD change date seeded into a window (months back from REF_NOW). */
function seededDate(key: string, minMonthsBack: number, maxMonthsBack: number): string {
  const span = maxMonthsBack - minMonthsBack;
  const back = minMonthsBack + (fnv(`date:${key}`) % (span + 1));
  const total = 2026 * 12 + 8 - back; // REF_NOW = 2026-09 (month index 8)
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

const compareDate = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── Ladders for plausible "previous" values ─────────────────────────────────

const EMPLOYEE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+'];
const REVENUE_BANDS = ['<$1M', '$1M-$10M', '$10M-$50M', '$50M-$100M', '$100M-$500M', '$500M-$1B', '>$1B'];
const FUNDING_LADDER = ['Bootstrapped', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Public'];
const PRIOR_CITIES = ['San Francisco', 'Austin', 'Denver', 'Remote-first', 'New York', 'London', 'Berlin', 'Bengaluru'];

/** The element one step below `value` in a ladder (or `value` if not found / at floor). */
function priorInLadder(ladder: string[], value: string): string {
  const i = ladder.indexOf(value);
  return i > 0 ? ladder[i - 1] : value;
}

/** A prior city that isn't the current one, chosen deterministically. */
function priorCity(key: string, current: string): string {
  const options = PRIOR_CITIES.filter((c) => c !== current);
  return options[fnv(`city:${key}`) % options.length];
}

/** A prior job title, one rung down, chosen deterministically. */
function priorTitle(key: string, title: string): string {
  const t = title.trim();
  if (/^VP\b|^Vice President/i.test(t)) return t.replace(/^VP\b|^Vice President/i, 'Director').replace(/^Director,?\s*/, 'Director, ');
  if (/^Head of/i.test(t)) return t.replace(/^Head of/i, 'Lead');
  if (/^Director/i.test(t)) return t.replace(/^Director/i, 'Senior Manager');
  if (/^Senior\s/i.test(t)) return t.replace(/^Senior\s/i, '');
  if (/^Lead\s/i.test(t)) return t.replace(/^Lead\s/i, '');
  if (/^Chief|^C[A-Z]O\b/i.test(t)) return t.replace(/^Chief\s*/i, 'VP of ').replace(/\bOfficer\b/i, '').trim();
  return `Associate ${t}`;
}

// ── Field-evolution model ───────────────────────────────────────────────────

interface EvolvingField {
  field: string;
  current: string;
  previous: string | null;   // null ⇒ never changed
  changedAt: string;         // date the value became `current`
  source: string;
  baseConfidence: number;
}

function personFields(email: string): EvolvingField[] | null {
  const p = resolvePersonFromEmail(email);
  if (!p) return null;
  const key = `p:${email.toLowerCase()}`;
  return [
    { field: 'Full name', current: p.full_name, previous: null, changedAt: '2019-01-01', source: 'Professional graph', baseConfidence: 0.95 },
    { field: 'Title', current: p.title, previous: priorTitle(key, p.title), changedAt: seededDate(`${key}:title`, 6, 30), source: 'Professional graph', baseConfidence: 0.9 },
    { field: 'Seniority', current: p.seniority, previous: null, changedAt: '2019-01-01', source: 'Professional graph', baseConfidence: 0.88 },
    { field: 'Company', current: p.company, previous: null, changedAt: '2019-01-01', source: 'Company graph', baseConfidence: 0.94 },
    { field: 'Department', current: p.department, previous: null, changedAt: '2019-01-01', source: 'Professional graph', baseConfidence: 0.86 },
    { field: 'Location', current: p.location, previous: priorCity(key, p.location), changedAt: seededDate(`${key}:loc`, 4, 36), source: 'Directory match', baseConfidence: 0.8 },
    { field: 'Phone', current: p.phone || '—', previous: null, changedAt: '2019-01-01', source: 'Carrier HLR lookup', baseConfidence: p.phone_verified ? 0.9 : 0.6 },
    { field: 'Email', current: p.email, previous: null, changedAt: '2019-01-01', source: 'Deliverability check', baseConfidence: p.email_verified ? 0.97 : 0.7 },
  ];
}

function companyFields(domain: string): EvolvingField[] | null {
  const c = resolveCompanyFromDomain(domain);
  if (!c) return null;
  const key = `c:${normalizeDomain(domain)}`;
  return [
    { field: 'Legal name', current: c.legal_name, previous: null, changedAt: '2018-01-01', source: 'Domain registry', baseConfidence: 0.96 },
    { field: 'Industry', current: c.industry, previous: null, changedAt: '2018-01-01', source: 'Firmographic graph', baseConfidence: 0.9 },
    { field: 'Employees', current: c.employee_band, previous: priorInLadder(EMPLOYEE_BANDS, c.employee_band), changedAt: seededDate(`${key}:emp`, 5, 28), source: 'Workforce signals', baseConfidence: 0.82 },
    { field: 'Revenue', current: c.revenue_band, previous: priorInLadder(REVENUE_BANDS, c.revenue_band), changedAt: seededDate(`${key}:rev`, 6, 30), source: 'Financial estimates', baseConfidence: 0.72 },
    { field: 'Funding stage', current: c.funding_stage, previous: priorInLadder(FUNDING_LADDER, c.funding_stage), changedAt: seededDate(`${key}:fund`, 8, 34), source: 'Funding database', baseConfidence: c.type === 'Public' ? 0.97 : 0.8 },
    { field: 'HQ city', current: c.hq_city, previous: priorCity(key, c.hq_city), changedAt: seededDate(`${key}:hq`, 10, 40), source: 'Registry + geo-IP', baseConfidence: 0.85 },
    { field: 'Tech count', current: String(c.tech_stack.length), previous: String(Math.max(1, c.tech_stack.length - 2)), changedAt: seededDate(`${key}:tech`, 3, 20), source: 'Technographic scan', baseConfidence: 0.87 },
  ];
}

/** Resolve any identifier to its entity descriptor, or null. */
export function resolveGoldenEntity(query: string): { entityType: GoldenEntityType; entityKey: string; display: string; zinbitId: string } | null {
  const q = String(query || '').trim();
  if (!q) return null;
  if (EMAIL_RE.test(q)) {
    const p = resolvePersonFromEmail(q);
    if (!p) return null;
    return { entityType: 'person', entityKey: `person:${q.toLowerCase()}`, display: `${p.full_name}${p.company ? ` · ${p.company}` : ''}`, zinbitId: zidForPerson(p) };
  }
  const domain = normalizeDomain(q);
  if (isValidDomain(domain)) {
    const c = resolveCompanyFromDomain(domain);
    if (!c) return null;
    return { entityType: 'company', entityKey: `company:${domain}`, display: `${c.name} · ${c.domain}`, zinbitId: zidForCompany(c) };
  }
  return null;
}

/** A field's confidence decays slightly the further back the record reflects. */
function confidenceAsOf(base: number, observedAt: string, asOf: string): number {
  const monthsStale = Math.max(0, (Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7))) - (Number(observedAt.slice(0, 4)) * 12 + Number(observedAt.slice(5, 7))));
  return Math.round(Math.max(0.4, base - Math.min(0.15, monthsStale * 0.004)) * 1000) / 1000;
}

/**
 * Build the golden record for an entity as it stood at `asOf` (default: now).
 * Returns null when the identifier resolves to no entity.
 */
export function buildGoldenRecord(query: string, asOf: string = REF_NOW): GoldenRecord | null {
  const entity = resolveGoldenEntity(query);
  if (!entity) return null;
  const evolving = entity.entityType === 'person'
    ? personFields(String(query).trim().toLowerCase())
    : companyFields(normalizeDomain(String(query)));
  if (!evolving) return null;

  const fields: GoldenField[] = evolving.map((ev) => {
    const changed = ev.previous !== null && compareDate(asOf, ev.changedAt) >= 0;
    const value = ev.previous !== null && !changed ? ev.previous : ev.current;
    // Observed date: the change date if the current value is in effect, else earlier.
    const observedAt = changed || ev.previous === null ? (ev.changedAt > asOf ? asOf : ev.changedAt) : seededDatePrevious(ev, asOf);
    return { field: ev.field, value, source: ev.source, confidence: confidenceAsOf(ev.baseConfidence, observedAt, asOf), observedAt };
  });
  const overallConfidence = fields.length === 0 ? 0
    : Math.round((fields.reduce((s, f) => s + f.confidence, 0) / fields.length) * 1000) / 1000;

  return { entityKey: entity.entityKey, entityType: entity.entityType, zinbitId: entity.zinbitId, display: entity.display, fields, overallConfidence, asOf };
}

/** Observed date for a field still holding its previous value at `asOf`. */
function seededDatePrevious(ev: EvolvingField, asOf: string): string {
  // Previous value was observed a year before it changed, floored to not exceed asOf.
  const total = Number(ev.changedAt.slice(0, 4)) * 12 + Number(ev.changedAt.slice(5, 7)) - 12;
  const d = `${Math.floor(total / 12)}-${String(((total % 12) || 12)).padStart(2, '0')}-01`;
  return d > asOf ? asOf : d;
}

/** Content hash of a record's fields (order-independent, value+source sensitive). */
export function hashRecord(fields: GoldenField[]): string {
  const norm = [...fields].sort((a, b) => a.field.localeCompare(b.field)).map((f) => `${f.field}=${f.value}@${f.source}`).join('|');
  return B36(fnv(norm)).padStart(7, '0');
}

/** Diff two field sets (before → after) into a per-field change list. */
export function diffFields(before: GoldenField[], after: GoldenField[]): FieldDiff[] {
  const names = Array.from(new Set([...before.map((f) => f.field), ...after.map((f) => f.field)]));
  const b = new Map(before.map((f) => [f.field, f]));
  const a = new Map(after.map((f) => [f.field, f]));
  return names.map((field) => {
    const bf = b.get(field);
    const af = a.get(field);
    let status: DiffStatus;
    if (bf && !af) status = 'removed';
    else if (!bf && af) status = 'added';
    else if (bf && af && (bf.value !== af.value || bf.source !== af.source)) status = 'changed';
    else status = 'unchanged';
    return {
      field, status,
      before: bf ? bf.value : null,
      after: af ? af.value : null,
      sourceBefore: bf ? bf.source : null,
      sourceAfter: af ? af.source : null,
      confidenceBefore: bf ? bf.confidence : null,
      confidenceAfter: af ? af.confidence : null,
    };
  });
}

/** Diff two snapshots (by their fields), from the lower version to the higher. */
export function diffSnapshots(from: GoldenSnapshot, to: GoldenSnapshot): SnapshotDiff {
  const fields = diffFields(from.fields, to.fields);
  return {
    fromVersion: from.version,
    toVersion: to.version,
    fields,
    changedCount: fields.filter((f) => f.status === 'changed').length,
    addedCount: fields.filter((f) => f.status === 'added').length,
    removedCount: fields.filter((f) => f.status === 'removed').length,
    confidenceDelta: Math.round((to.overallConfidence - from.overallConfidence) * 1000) / 1000,
  };
}

export function makeSnapshotId(entityKey: string, version: number): string {
  return `snap_${B36(fnv(entityKey)).slice(0, 6)}_v${version}`;
}

/** Package a golden record into an immutable snapshot. */
export function snapshotFromRecord(rec: GoldenRecord, version: number, capturedAt: string, origin: 'seed' | 'manual', label = '', pinned = false): GoldenSnapshot {
  return {
    id: makeSnapshotId(rec.entityKey, version),
    entityKey: rec.entityKey,
    entityType: rec.entityType,
    display: rec.display,
    zinbitId: rec.zinbitId,
    version,
    capturedAt,
    asOf: rec.asOf,
    hash: hashRecord(rec.fields),
    fields: rec.fields,
    overallConfidence: rec.overallConfidence,
    label,
    pinned,
    origin,
  };
}

// ── Seed history ────────────────────────────────────────────────────────────

// Demo entities that get a pre-built version chain so diffs are meaningful on
// first load. Kept aligned to the identities used across the console.
const SEED_ENTITIES: { query: string; asOfDates: string[]; captureDates: string[]; labels: string[] }[] = [
  { query: 'stripe.com', asOfDates: ['2024-01-01', '2025-03-01', '2026-09-01'], captureDates: ['2024-01-15', '2025-03-10', '2026-09-01'], labels: ['Initial dossier', 'Renewal review', ''] },
  { query: 'datadoghq.com', asOfDates: ['2024-06-01', '2026-09-01'], captureDates: ['2024-06-05', '2026-09-01'], labels: ['Onboarding', ''] },
  { query: 'jane.doe@acme.com', asOfDates: ['2024-02-01', '2025-08-01', '2026-09-01'], captureDates: ['2024-02-01', '2025-08-01', '2026-09-01'], labels: ['First contact', 'Deal signed', ''] },
];

/** Build the seeded snapshot chains for the demo entities (idempotent input). */
export function generateSeedSnapshots(): GoldenSnapshot[] {
  const out: GoldenSnapshot[] = [];
  SEED_ENTITIES.forEach((e) => {
    e.asOfDates.forEach((asOf, i) => {
      const rec = buildGoldenRecord(e.query, asOf);
      if (!rec) return;
      const version = i + 1;
      const isLatest = i === e.asOfDates.length - 1;
      out.push(snapshotFromRecord(rec, version, e.captureDates[i], 'seed', e.labels[i] || '', isLatest));
    });
  });
  return out;
}
