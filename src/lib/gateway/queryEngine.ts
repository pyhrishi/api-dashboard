/**
 * Query filtering & sorting (F-078) — a universal query grammar for list endpoints.
 *
 * List-returning endpoints (e.g. GET /v1/companies/employees) accept two universal
 * params:
 *   filter=<field>:<op>:<value>[,<field>:<op>:<value>...]   (clauses AND together)
 *   sort=<field>[,-<field>...]                              (‘-’ = descending)
 *
 * Operators: eq ne gt gte lt lte contains startsWith endsWith in (‘in’ takes a
 * pipe-separated list, e.g. department:in:Sales|Engineering). Comparisons are
 * numeric when both sides parse as numbers, otherwise case-insensitive strings.
 *
 * Pure + deterministic — same rows + same spec → same output (sort is stable via an
 * index tiebreak). No `Math.random`, no state. Generic over plain row objects.
 */

export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in';

export const FILTER_OPS: FilterOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'in'];

export interface FilterClause { field: string; op: FilterOp; value: string; }
export interface SortClause { field: string; dir: 'asc' | 'desc'; }

export interface QuerySpec {
  filters: FilterClause[];
  sorts: SortClause[];
  errors: string[];
}

export interface QueryResult<T> {
  rows: T[];
  /** Rows remaining after filtering (before pagination). */
  matched: number;
  /** Rows before filtering. */
  total: number;
  filtersApplied: number;
  sortsApplied: number;
}

const isOp = (s: string): s is FilterOp => (FILTER_OPS as string[]).includes(s);

/** Parse a `filter=` string into clauses, collecting any malformed-clause errors. */
export function parseFilter(raw: string | undefined | null): { clauses: FilterClause[]; errors: string[] } {
  const clauses: FilterClause[] = [];
  const errors: string[] = [];
  if (!raw) return { clauses, errors };
  String(raw).split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
    // field:op:value — value may itself contain ':' (e.g. a URL), so split into 3.
    const first = part.indexOf(':');
    const second = part.indexOf(':', first + 1);
    if (first === -1 || second === -1) {
      errors.push(`Malformed filter "${part}" — expected field:op:value.`);
      return;
    }
    const field = part.slice(0, first).trim();
    const op = part.slice(first + 1, second).trim();
    const value = part.slice(second + 1).trim();
    if (!field) { errors.push(`Filter "${part}" is missing a field.`); return; }
    if (!isOp(op)) { errors.push(`Unknown filter operator "${op}" (use ${FILTER_OPS.join(', ')}).`); return; }
    clauses.push({ field, op, value });
  });
  return { clauses, errors };
}

/** Parse a `sort=` string into ordered clauses. A leading ‘-’ means descending. */
export function parseSort(raw: string | undefined | null): { clauses: SortClause[]; errors: string[] } {
  const clauses: SortClause[] = [];
  const errors: string[] = [];
  if (!raw) return { clauses, errors };
  String(raw).split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const dir: 'asc' | 'desc' = part.startsWith('-') ? 'desc' : 'asc';
    const field = (part.startsWith('-') || part.startsWith('+') ? part.slice(1) : part).trim();
    if (!field) { errors.push(`Sort clause "${part}" is missing a field.`); return; }
    clauses.push({ field, dir });
  });
  return { clauses, errors };
}

/** Parse both params into one spec. */
export function parseQuery(params: { filter?: unknown; sort?: unknown }): QuerySpec {
  const f = parseFilter(typeof params.filter === 'string' ? params.filter : undefined);
  const s = parseSort(typeof params.sort === 'string' ? params.sort : undefined);
  return { filters: f.clauses, sorts: s.clauses, errors: [...f.errors, ...s.errors] };
}

const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const bothNumeric = (a: unknown, b: string): boolean => a !== '' && a !== null && a !== undefined && !Number.isNaN(Number(a)) && b.trim() !== '' && !Number.isNaN(Number(b));

/** Does a row satisfy one filter clause? */
export function matchesClause(row: Record<string, unknown>, clause: FilterClause): boolean {
  const raw = row[clause.field];
  const left = asString(raw).toLowerCase();
  const right = clause.value.toLowerCase();
  switch (clause.op) {
    case 'eq': return bothNumeric(raw, clause.value) ? Number(raw) === Number(clause.value) : left === right;
    case 'ne': return bothNumeric(raw, clause.value) ? Number(raw) !== Number(clause.value) : left !== right;
    case 'gt': return bothNumeric(raw, clause.value) ? Number(raw) > Number(clause.value) : left > right;
    case 'gte': return bothNumeric(raw, clause.value) ? Number(raw) >= Number(clause.value) : left >= right;
    case 'lt': return bothNumeric(raw, clause.value) ? Number(raw) < Number(clause.value) : left < right;
    case 'lte': return bothNumeric(raw, clause.value) ? Number(raw) <= Number(clause.value) : left <= right;
    case 'contains': return left.includes(right);
    case 'startsWith': return left.startsWith(right);
    case 'endsWith': return left.endsWith(right);
    case 'in': return clause.value.split('|').map((v) => v.trim().toLowerCase()).includes(left);
    default: return true;
  }
}

function compare(a: unknown, b: unknown): number {
  const an = Number(a), bn = Number(b);
  const numeric = a !== '' && b !== '' && a !== null && b !== null && a !== undefined && b !== undefined && !Number.isNaN(an) && !Number.isNaN(bn);
  if (numeric) return an - bn;
  const as = asString(a).toLowerCase(), bs = asString(b).toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Filter then sort a list of rows per the spec. Pure — never mutates the input array. */
export function applyQuery<T extends Record<string, unknown>>(rows: T[], spec: QuerySpec): QueryResult<T> {
  const total = rows.length;
  let out = rows;
  if (spec.filters.length) {
    out = out.filter((row) => spec.filters.every((c) => matchesClause(row, c)));
  }
  const matched = out.length;
  if (spec.sorts.length) {
    out = out
      .map((row, i) => ({ row, i }))
      .sort((x, y) => {
        for (const s of spec.sorts) {
          const c = compare(x.row[s.field], y.row[s.field]);
          if (c !== 0) return s.dir === 'desc' ? -c : c;
        }
        return x.i - y.i; // stable
      })
      .map((w) => w.row);
  }
  return { rows: out, matched, total, filtersApplied: spec.filters.length, sortsApplied: spec.sorts.length };
}
