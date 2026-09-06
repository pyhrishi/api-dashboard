/**
 * Automated re-verification — re-check high-value fields on a rolling schedule.
 *
 * Enriched data decays: emails bounce, phones disconnect, people change jobs.
 * This module is the deterministic engine behind the re-verification center — a
 * curated pool of records with a last-verified date, a per-field-type cadence
 * (the rolling schedule), a "which records are due" calculation, and a
 * re-verification outcome for each due field (unchanged / updated / decayed)
 * with a human explanation.
 *
 * Deterministic: outcomes are seeded by (record, cycle) via FNV-1a — no
 * Math.random, no wall-clock in the outcome — so each rolling cycle is stable
 * and re-runs reproduce. Due-ness is computed against a fixed reference date,
 * coherent with the field-freshness model (F-040).
 */

export type ReverifyFieldType = 'email' | 'phone' | 'employment';
export type ReverifyOutcome = 'unchanged' | 'updated' | 'decayed';

export interface ReverifiableRecord {
  id: string;
  entity: string;
  company: string;
  fieldType: ReverifyFieldType;
  value: string;
  lastVerified: string; // ISO date
}

export interface ReverificationResult {
  recordId: string;
  entity: string;
  company: string;
  fieldType: ReverifyFieldType;
  outcome: ReverifyOutcome;
  detail: string;
  newValue?: string;
}

export interface ReVerificationRun {
  id: string;
  timestamp: number;
  checked: number;
  unchanged: number;
  updated: number;
  decayed: number;
  results: ReverificationResult[];
}

export interface ReverificationCadence {
  email: number;
  phone: number;
  employment: number;
}

export const DEFAULT_CADENCE: ReverificationCadence = { email: 30, phone: 60, employment: 90 };
export const CADENCE_BOUNDS = { min: 7, max: 180 };

/** Stable "today" for due calculation (coherent with the freshness model). */
const REVERIFY_NOW = Date.UTC(2026, 8, 6); // 2026-09-06
const FIELD_LABEL: Record<ReverifyFieldType, string> = { email: 'Email', phone: 'Direct phone', employment: 'Employment' };

export const fieldLabel = (t: ReverifyFieldType): string => FIELD_LABEL[t];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface SeedRecord {
  entity: string;
  company: string;
  fieldType: ReverifyFieldType;
  value: string;
  ageDays: number; // days since last verified
}

// Curated pool spanning field types and ages, so some are due and some aren't.
const SEED: SeedRecord[] = [
  { entity: 'Jane Doe', company: 'Acme', fieldType: 'email', value: 'jane.doe@acme.com', ageDays: 12 },
  { entity: 'Marcus Lee', company: 'Stripe', fieldType: 'email', value: 'marcus@stripe.com', ageDays: 44 },
  { entity: 'Priya Nair', company: 'Zomato', fieldType: 'email', value: 'priya.nair@zomato.in', ageDays: 61 },
  { entity: 'Tom Baker', company: 'Datadog', fieldType: 'email', value: 'tom.baker@datadoghq.com', ageDays: 8 },
  { entity: 'Sara Chen', company: 'Notion', fieldType: 'phone', value: '+1 415 555 0132', ageDays: 75 },
  { entity: 'David Kim', company: 'Vercel', fieldType: 'phone', value: '+1 206 555 0148', ageDays: 33 },
  { entity: 'Emma Watson', company: 'Airbnb', fieldType: 'phone', value: '+1 628 555 0177', ageDays: 91 },
  { entity: 'Raj Patel', company: 'Uber', fieldType: 'phone', value: '+1 312 555 0164', ageDays: 20 },
  { entity: 'Lisa Wong', company: 'Netflix', fieldType: 'employment', value: 'VP of Sales · Netflix', ageDays: 120 },
  { entity: 'Michael Chen', company: 'Figma', fieldType: 'employment', value: 'Product Lead · Figma', ageDays: 64 },
  { entity: 'Robert Johnson', company: 'Databricks', fieldType: 'employment', value: 'Eng Manager · Databricks', ageDays: 101 },
  { entity: 'Nina Rossi', company: 'Snowflake', fieldType: 'employment', value: 'Solutions Architect · Snowflake', ageDays: 38 },
  { entity: 'Omar Farouk', company: 'Twilio', fieldType: 'email', value: 'omar.farouk@twilio.com', ageDays: 96 },
  { entity: 'Grace Park', company: 'HubSpot', fieldType: 'phone', value: '+1 617 555 0119', ageDays: 52 },
  { entity: 'Ivan Petrov', company: 'Atlassian', fieldType: 'employment', value: 'Senior Recruiter · Atlassian', ageDays: 145 },
];

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The deterministic pool of re-verifiable records. */
export function generateReverifiableRecords(): ReverifiableRecord[] {
  return SEED.map((r, i) => ({
    id: `rv_${i + 1}`,
    entity: r.entity,
    company: r.company,
    fieldType: r.fieldType,
    value: r.value,
    lastVerified: iso(REVERIFY_NOW - r.ageDays * 86_400_000),
  }));
}

/** Days since a record's field was last verified. */
export function recordAgeDays(record: ReverifiableRecord, now: number = REVERIFY_NOW): number {
  return Math.max(0, Math.round((now - Date.parse(record.lastVerified)) / 86_400_000));
}

/** Is this record past its field-type cadence and due for re-verification? */
export function isDue(record: ReverifiableRecord, cadence: ReverificationCadence, now: number = REVERIFY_NOW): boolean {
  return recordAgeDays(record, now) >= cadence[record.fieldType];
}

/** The records currently due under a cadence. */
export function computeDueRecords(records: ReverifiableRecord[], cadence: ReverificationCadence, now: number = REVERIFY_NOW): ReverifiableRecord[] {
  return records.filter((r) => isDue(r, cadence, now));
}

/** Re-verify one field deterministically for a given rolling cycle. */
export function reverifyField(record: ReverifiableRecord, cycle: number): ReverificationResult {
  const r = hash(`${record.id}:${cycle}`) % 100;
  const base = { recordId: record.id, entity: record.entity, company: record.company, fieldType: record.fieldType };

  // Weighted: ~68% unchanged, ~20% updated, ~12% decayed.
  if (r < 68) {
    return { ...base, outcome: 'unchanged', detail: `Re-verified — ${fieldLabel(record.fieldType).toLowerCase()} still valid.` };
  }
  if (r < 88) {
    // Updated — the value changed but the person is still reachable.
    if (record.fieldType === 'email') {
      const handle = record.entity.toLowerCase().replace(/\s+/g, '.');
      const newValue = `${handle}@${record.company.toLowerCase().replace(/\s+/g, '')}.io`;
      return { ...base, outcome: 'updated', detail: 'Domain migrated — new corporate email on file.', newValue };
    }
    if (record.fieldType === 'phone') {
      const n = 100 + (hash(`${record.id}:num:${cycle}`) % 900);
      return { ...base, outcome: 'updated', detail: 'New direct dial detected.', newValue: `+1 415 555 ${n}` };
    }
    return { ...base, outcome: 'updated', detail: 'Role change — same company, new title.', newValue: `Director · ${record.company}` };
  }
  // Decayed — the field is no longer good.
  if (record.fieldType === 'email') return { ...base, outcome: 'decayed', detail: 'Mailbox now bounces (SMTP 550) — likely left the company.' };
  if (record.fieldType === 'phone') return { ...base, outcome: 'decayed', detail: 'Number disconnected — no longer in service.' };
  return { ...base, outcome: 'decayed', detail: 'Left the company — no current employer on file.' };
}

/** Re-verify a set of due records for a cycle, with rolled-up counts. */
export function reverifyRecords(records: ReverifiableRecord[], cycle: number): Omit<ReVerificationRun, 'id' | 'timestamp'> {
  const results = records.map((r) => reverifyField(r, cycle));
  return {
    checked: results.length,
    unchanged: results.filter((r) => r.outcome === 'unchanged').length,
    updated: results.filter((r) => r.outcome === 'updated').length,
    decayed: results.filter((r) => r.outcome === 'decayed').length,
    results,
  };
}
