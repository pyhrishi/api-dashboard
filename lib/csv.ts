/**
 * Small, dependency-free CSV utilities for Bulk Enrichment Jobs.
 * Handles quoted fields, escaped quotes (""), CRLF, a UTF-8 BOM, and auto-detects
 * comma / semicolon / tab delimiters. Deterministic and side-effect free.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  candidates.forEach(d => {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  });
  return best;
}

/** Parse CSV text into header + row objects. Empty lines are dropped; short rows are padded with ''. */
export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(clean);
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === d) { record.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { record.push(field); records.push(record); record = []; field = ''; continue; }
    field += ch;
  }
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }

  const nonEmpty = records.filter(r => r.some(c => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [], delimiter: d };

  const headers = nonEmpty[0].map((h, i) => (h.trim() || `column_${i + 1}`));
  const rows = nonEmpty.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
  return { headers, rows, delimiter: d };
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV using an explicit column order. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const head = columns.map(escapeCell).join(',');
  const body = rows.map(r => columns.map(c => escapeCell(r[c])).join(','));
  return [head, ...body].join('\r\n');
}

/** Flatten a nested object into dot-path keys; arrays become JSON strings. */
export function flattenObject(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === null || value === undefined) { if (prefix) out[prefix] = ''; return out; }
  if (Array.isArray(value)) { out[prefix || 'value'] = JSON.stringify(value); return out; }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      flattenObject(v, prefix ? `${prefix}.${k}` : k, out);
    });
    return out;
  }
  out[prefix || 'value'] = value;
  return out;
}

/** Best-effort auto-mapping of endpoint parameters to CSV headers by name similarity. */
export function autoMapColumns(paramNames: string[], headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string[]> = {
    email: ['email', 'emailaddress', 'workemail', 'mail', 'e-mail'],
    phone: ['phone', 'phonenumber', 'mobile', 'tel', 'telephone'],
    domain: ['domain', 'website', 'companydomain', 'url', 'site'],
    linkedin_url: ['linkedin', 'linkedinurl', 'profile', 'profileurl', 'li'],
    cin: ['cin', 'companyid', 'registrationnumber'],
    din: ['din', 'directorid'],
    query: ['query', 'search', 'q'],
  };
  const mapping: Record<string, string> = {};
  paramNames.forEach(p => {
    const wanted = [norm(p), ...(aliases[p] ?? []).map(norm)];
    const hit = headers.find(h => wanted.includes(norm(h))) ?? headers.find(h => norm(h).includes(norm(p)) || norm(p).includes(norm(h)));
    if (hit) mapping[p] = hit;
  });
  return mapping;
}
