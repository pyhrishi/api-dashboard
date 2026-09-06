/**
 * Field selection / sparse responses (F-062).
 *
 * A universal `fields` query parameter lets a caller ask for only the attributes
 * they need — `?fields=phone,carrier` or `?fields=name,company.domain`. The
 * gateway projects the response down to exactly those fields, which:
 *   - shrinks the payload (bandwidth + parse time),
 *   - costs less (a sparse request is discounted — pay for what you pull), and
 *   - pulls less PII (data-minimization by default — a compliance win).
 *
 * This module is the single source of truth for parsing the parameter, projecting
 * the data, and pricing a sparse request. Pure + deterministic — no I/O, no
 * Math.random — so the gateway and any preview surface can share it.
 */

/** How many fields a "full" enrichment record nominally carries, for pricing. */
export const SPARSE_NOMINAL_FIELDS = 8;
/** The most a sparse request is ever discounted. */
export const SPARSE_MAX_DISCOUNT_PCT = 50;
/** Hard cap on how many fields a single request may name. */
export const MAX_SELECTED_FIELDS = 50;

const FIELD_RE = /^[a-zA-Z0-9_.-]+$/;

/**
 * Parse the raw `fields` value into a clean, de-duplicated, ordered list.
 * Comma-separated; whitespace trimmed; empties and malformed tokens dropped;
 * capped at MAX_SELECTED_FIELDS.
 */
export function parseFields(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(',')) {
    const f = part.trim();
    if (!f || !FIELD_RE.test(f) || seen.has(f)) continue;
    seen.add(f);
    out.push(f);
    if (out.length >= MAX_SELECTED_FIELDS) break;
  }
  return out;
}

export interface FieldProjection {
  /** The projected data (same shape family as the input — object or array of objects). */
  data: unknown;
  /** Top-level keys available before projection. */
  available: string[];
  /** Top-level keys kept. */
  selected: string[];
  /** Top-level keys dropped. */
  omitted: string[];
  /** Whether projection actually ran against a projectable object/array. */
  applied: boolean;
}

function topKeys(v: unknown): string[] {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v as Record<string, unknown>)
    : [];
}

/** Project a single object down to the requested fields (supports one level of `a.b` nesting). */
function projectOne(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const dot = f.indexOf('.');
    if (dot === -1) {
      if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
      continue;
    }
    const head = f.slice(0, dot);
    const tail = f.slice(dot + 1);
    const nested = obj[head];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedObj = nested as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(nestedObj, tail)) {
        const cur = (out[head] && typeof out[head] === 'object' && !Array.isArray(out[head])
          ? out[head]
          : {}) as Record<string, unknown>;
        cur[tail] = nestedObj[tail];
        out[head] = cur;
      }
    }
  }
  return out;
}

/**
 * Project `data` down to `fields`. Handles a single object or an array of objects
 * (each element is projected). Non-projectable input (primitive, null) is returned
 * unchanged with `applied: false`.
 */
export function projectFields(data: unknown, fields: string[]): FieldProjection {
  if (!fields.length) {
    const keys = topKeys(data);
    return { data, available: keys, selected: keys, omitted: [], applied: false };
  }
  const topSelected = new Set(fields.map((f) => f.split('.')[0]));

  if (Array.isArray(data)) {
    const available = topKeys(data[0]);
    const projected = data.map((el) =>
      el && typeof el === 'object' && !Array.isArray(el)
        ? projectOne(el as Record<string, unknown>, fields)
        : el,
    );
    const selected = available.filter((k) => topSelected.has(k));
    const omitted = available.filter((k) => !topSelected.has(k));
    return { data: projected, available, selected, omitted, applied: available.length > 0 };
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const available = Object.keys(obj);
    const projected = projectOne(obj, fields);
    const selected = available.filter((k) => topSelected.has(k));
    const omitted = available.filter((k) => !topSelected.has(k));
    return { data: projected, available, selected, omitted, applied: true };
  }

  return { data, available: [], selected: [], omitted: [], applied: false };
}

/**
 * The discount (0–SPARSE_MAX_DISCOUNT_PCT) applied to a request that names
 * `requestedCount` fields. Fewer fields → bigger discount; a full-width request
 * (>= SPARSE_NOMINAL_FIELDS) is never discounted. Deterministic.
 */
export function sparseDiscountPct(requestedCount: number): number {
  if (requestedCount <= 0 || requestedCount >= SPARSE_NOMINAL_FIELDS) return 0;
  const raw = Math.round((1 - requestedCount / SPARSE_NOMINAL_FIELDS) * 100);
  return Math.min(SPARSE_MAX_DISCOUNT_PCT, raw);
}

/** Apply the sparse discount to a base credit cost, never charging below 1 credit. */
export function applySparseDiscount(baseCost: number, requestedCount: number): { cost: number; discountPct: number } {
  const discountPct = sparseDiscountPct(requestedCount);
  if (discountPct <= 0) return { cost: baseCost, discountPct: 0 };
  const cost = Math.max(1, Math.round(baseCost * (1 - discountPct / 100)));
  return { cost, discountPct };
}

/** UTF-8 byte length of a string, without relying on TextEncoder (jest-safe). */
function utf8Len(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; } // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

/** Byte size of a JSON payload — used to report the payload reduction. */
export function payloadBytes(data: unknown): number {
  try {
    return utf8Len(JSON.stringify(data ?? null));
  } catch {
    return 0;
  }
}
