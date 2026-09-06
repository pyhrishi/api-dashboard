/**
 * Bulk export endpoint (F-076) — stream a filtered dataset out as NDJSON / CSV / JSON.
 *
 * One call to pull a whole filtered slice of your enriched data into a warehouse or
 * spreadsheet: pick an entity (companies or people), narrow it with the same filter
 * and sort grammar as the Query endpoint (F-078), select just the columns you want
 * (F-062 field selection), and choose a format. NDJSON streams row-by-row so the
 * response is memory-flat regardless of size; CSV and JSON are serialized for
 * spreadsheets and quick loads.
 *
 * The dataset is built deterministically from the shared company/person resolvers,
 * so an export always agrees with a direct lookup. Pure — no `Math.random`, no
 * wall-clock; the route layer handles streaming, billing, and headers.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { parseQuery, applyQuery, type QuerySpec } from '@/lib/gateway/queryEngine';
import { parseFields } from '@/lib/gateway/fieldSelection';

export type ExportEntity = 'companies' | 'people';
export type ExportFormat = 'ndjson' | 'csv' | 'json';

export const EXPORT_ENTITIES: ExportEntity[] = ['companies', 'people'];
export const EXPORT_FORMATS: ExportFormat[] = ['ndjson', 'csv', 'json'];

/** Hard ceiling on rows per export (streaming stays flat, but we cap for the demo). */
export const MAX_EXPORT_ROWS = 500;
/** Rows billed per credit. */
const ROWS_PER_CREDIT = 50;

/** The selectable columns per entity (drives the console + validation). */
export const EXPORT_FIELDS: Record<ExportEntity, string[]> = {
  companies: ['domain', 'name', 'industry', 'sub_industry', 'type', 'employee_band', 'revenue_band', 'funding_stage', 'hq_city', 'hq_country', 'founded_year', 'confidence'],
  people: ['email', 'full_name', 'title', 'seniority', 'department', 'company', 'company_domain', 'location', 'email_verified', 'confidence'],
};

// Curated rosters — real, varied domains/emails so filters and sorts are meaningful.
const COMPANY_DOMAINS = [
  'stripe.com', 'datadoghq.com', 'shopify.com', 'notion.so', 'figma.com', 'vercel.com',
  'zomato.in', 'airbnb.com', 'uber.com', 'lyft.com', 'dropbox.com', 'slack.com',
  'twilio.com', 'segment.com', 'snowflake.com', 'databricks.com', 'confluent.io',
  'hashicorp.com', 'gitlab.com', 'atlassian.com', 'asana.com', 'monday.com',
  'zapier.com', 'airtable.com', 'retool.com', 'linear.app', 'plaid.com', 'brex.com',
  'ramp.com', 'mercury.com', 'rippling.com', 'gusto.com', 'carta.com', 'anduril.com',
  'palantir.com', 'cloudflare.com', 'fastly.com', 'netlify.com', 'sentry.io',
  'launchdarkly.com', 'pagerduty.com', 'okta.com', 'auth0.com', 'onelogin.com',
  'zendesk.com', 'intercom.com', 'front.com', 'gong.io',
];

const PERSON_EMAILS = [
  'jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in', 'sam.lee@datadoghq.com',
  'ana.silva@shopify.com', 'kenji.watanabe@notion.so', 'olivia.brown@figma.com',
  'liam.murphy@vercel.com', 'noah.kim@airbnb.com', 'emma.garcia@uber.com',
  'lucas.martin@dropbox.com', 'mia.wong@slack.com', 'ethan.davis@twilio.com',
  'sophia.rossi@segment.com', 'aiden.patel@snowflake.com', 'chloe.nguyen@databricks.com',
  'james.oconnor@confluent.io', 'harper.singh@hashicorp.com', 'benjamin.cohen@gitlab.com',
  'amelia.jones@atlassian.com', 'william.chen@asana.com', 'ava.hernandez@monday.com',
  'daniel.kim@zapier.com', 'ella.schmidt@airtable.com', 'henry.ford@retool.com',
  'grace.liu@linear.app', 'jack.wilson@plaid.com', 'zoe.taylor@brex.com',
  'leo.anderson@ramp.com', 'nora.dubois@mercury.com', 'owen.clark@rippling.com',
  'ruby.evans@gusto.com', 'max.fischer@carta.com', 'iris.novak@cloudflare.com',
  'felix.meyer@fastly.com', 'luna.costa@netlify.com', 'theo.roux@sentry.io',
  'clara.weber@okta.com', 'hugo.morel@zendesk.com', 'stella.park@intercom.com',
];

function flattenCompany(domain: string): Record<string, unknown> | null {
  const c = resolveCompanyFromDomain(domain);
  if (!c) return null;
  return {
    domain: c.domain, name: c.name, industry: c.industry, sub_industry: c.sub_industry,
    type: c.type, employee_band: c.employee_band, revenue_band: c.revenue_band,
    funding_stage: c.funding_stage, hq_city: c.hq_city, hq_country: c.hq_country,
    founded_year: c.founded_year, confidence: c.confidence,
  };
}

function flattenPerson(email: string): Record<string, unknown> | null {
  const p = resolvePersonFromEmail(email);
  if (!p) return null;
  return {
    email: p.email, full_name: p.full_name, title: p.title, seniority: p.seniority,
    department: p.department, company: p.company, company_domain: p.company_domain,
    location: p.location, email_verified: p.email_verified, confidence: p.confidence,
  };
}

/** The full deterministic dataset for an entity (capped at MAX_EXPORT_ROWS). */
export function buildExportDataset(entity: ExportEntity): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const source = entity === 'companies' ? COMPANY_DOMAINS : PERSON_EMAILS;
  for (let i = 0; i < source.length && rows.length < MAX_EXPORT_ROWS; i++) {
    const row = entity === 'companies' ? flattenCompany(source[i]) : flattenPerson(source[i]);
    if (row) rows.push(row);
  }
  return rows;
}

/** Credits an export of `rowCount` rows costs (billed per row block, min 1). */
export function exportCost(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / ROWS_PER_CREDIT));
}

export interface ExportPlan {
  entity: ExportEntity;
  format: ExportFormat;
  /** Filtered + sorted + limited rows, projected to `fields`. */
  rows: Record<string, unknown>[];
  /** The columns each row is projected to. */
  fields: string[];
  /** Rows in the full dataset before filtering. */
  total: number;
  /** Rows after filtering (before the limit). */
  matched: number;
  /** Credits this export costs. */
  cost: number;
  contentType: string;
  filename: string;
  warnings: string[];
}

export interface ExportRequest {
  entity?: string;
  filter?: string | null;
  sort?: string | null;
  fields?: string | null;
  format?: string | null;
  limit?: string | number | null;
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  ndjson: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

function coerceEntity(raw: string | undefined): ExportEntity {
  return raw === 'people' ? 'people' : 'companies';
}
function coerceFormat(raw: string | null | undefined): ExportFormat {
  const f = String(raw ?? 'ndjson').toLowerCase();
  return (EXPORT_FORMATS as string[]).includes(f) ? (f as ExportFormat) : 'ndjson';
}

/** Project a flat row to the requested fields (order preserved). */
function project(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  fields.forEach((f) => { if (f in row) out[f] = row[f]; });
  return out;
}

/**
 * Plan a bulk export: build the dataset, apply the filter/sort (F-078 grammar),
 * project to the selected fields (F-062), and cap at the limit. Pure — the caller
 * streams/serializes `rows`.
 */
export function planExport(req: ExportRequest): { plan: ExportPlan | null; error: string | null } {
  const entity = coerceEntity(req.entity);
  const format = coerceFormat(req.format);
  const warnings: string[] = [];

  const dataset = buildExportDataset(entity);
  const total = dataset.length;

  const spec: QuerySpec = parseQuery({ filter: req.filter ?? undefined, sort: req.sort ?? undefined });
  if (spec.errors.length) warnings.push(...spec.errors);
  const queried = applyQuery(dataset, spec);
  const matched = queried.rows.length;

  // Fields: requested (validated against the entity's columns) or all.
  const available = EXPORT_FIELDS[entity];
  const requested = parseFields(req.fields ?? null);
  let fields = requested.length ? requested.filter((f) => available.includes(f)) : [...available];
  if (requested.length && fields.length === 0) {
    warnings.push('No requested fields matched this entity; exporting all columns.');
    fields = [...available];
  }
  const unknownReq = requested.filter((f) => !available.includes(f));
  if (unknownReq.length) warnings.push(`Ignored unknown field(s): ${unknownReq.join(', ')}.`);

  // Limit.
  let limit = MAX_EXPORT_ROWS;
  if (req.limit != null && req.limit !== '') {
    const n = Number(req.limit);
    if (!Number.isFinite(n) || n <= 0) warnings.push('Invalid limit ignored.');
    else limit = Math.min(MAX_EXPORT_ROWS, Math.floor(n));
  }
  if (matched > limit) warnings.push(`Result capped at ${limit} of ${matched} matched rows.`);

  const rows = queried.rows.slice(0, limit).map((r) => project(r, fields));
  const cost = exportCost(rows.length);

  return {
    plan: {
      entity, format, rows, fields, total, matched, cost,
      contentType: CONTENT_TYPE[format],
      filename: `zinbit_${entity}_export.${format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'ndjson'}`,
      warnings,
    },
    error: null,
  };
}

// ── Serialization ────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV (header + rows) using `fields` as the column order. */
export function serializeCsv(rows: Record<string, unknown>[], fields: string[]): string {
  const header = fields.map(csvCell).join(',');
  const body = rows.map((r) => fields.map((f) => csvCell(r[f])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

/** Serialize rows to NDJSON (one JSON object per line). */
export function serializeNdjson(rows: Record<string, unknown>[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
}

/** Serialize a plan's rows to its format (used for CSV/JSON; NDJSON streams instead). */
export function serializeExport(plan: ExportPlan): string {
  if (plan.format === 'csv') return serializeCsv(plan.rows, plan.fields);
  if (plan.format === 'json') return JSON.stringify(plan.rows, null, 0);
  return serializeNdjson(plan.rows);
}
