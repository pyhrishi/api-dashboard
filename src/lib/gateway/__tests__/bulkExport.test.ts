/**
 * F-076 Bulk export endpoint — dataset, planning, serialization tests.
 * Deterministic, no network, no wall-clock.
 */
import {
  buildExportDataset,
  planExport,
  serializeCsv,
  serializeNdjson,
  serializeExport,
  exportCost,
  EXPORT_FIELDS,
  MAX_EXPORT_ROWS,
} from '@/lib/gateway/bulkExport';

describe('buildExportDataset', () => {
  it('builds deterministic company + people datasets within the cap', () => {
    const companies = buildExportDataset('companies');
    const people = buildExportDataset('people');
    expect(companies.length).toBeGreaterThan(20);
    expect(people.length).toBeGreaterThan(20);
    expect(companies.length).toBeLessThanOrEqual(MAX_EXPORT_ROWS);
    // Shapes match the declared field sets.
    expect(Object.keys(companies[0])).toEqual(expect.arrayContaining(EXPORT_FIELDS.companies));
    expect(Object.keys(people[0])).toEqual(expect.arrayContaining(EXPORT_FIELDS.people));
  });
  it('is deterministic across calls', () => {
    expect(JSON.stringify(buildExportDataset('companies'))).toBe(JSON.stringify(buildExportDataset('companies')));
  });
});

describe('planExport — filter / sort / fields / limit', () => {
  it('exports all rows with no query', () => {
    const { plan } = planExport({ entity: 'companies', format: 'ndjson' });
    expect(plan).not.toBeNull();
    expect(plan!.matched).toBe(plan!.total);
    expect(plan!.rows.length).toBe(plan!.total);
    expect(plan!.format).toBe('ndjson');
  });

  it('applies a filter clause (F-078 grammar)', () => {
    const { plan } = planExport({ entity: 'companies', filter: 'hq_country:eq:United States' });
    expect(plan).not.toBeNull();
    // Every returned row satisfies the filter (if any matched).
    plan!.rows.forEach((r) => expect(r.hq_country).toBe('United States'));
    expect(plan!.matched).toBeLessThanOrEqual(plan!.total);
  });

  it('sorts rows (grammar: field asc, -field desc)', () => {
    const asc = planExport({ entity: 'companies', sort: 'founded_year' }).plan!;
    const years = asc.rows.map((r) => Number(r.founded_year));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    const desc = planExport({ entity: 'companies', sort: '-founded_year' }).plan!;
    const dyears = desc.rows.map((r) => Number(r.founded_year));
    expect(dyears).toEqual([...dyears].sort((a, b) => b - a));
  });

  it('projects to selected fields only', () => {
    const { plan } = planExport({ entity: 'companies', fields: 'domain,name,industry' });
    expect(plan!.fields).toEqual(['domain', 'name', 'industry']);
    expect(Object.keys(plan!.rows[0])).toEqual(['domain', 'name', 'industry']);
  });

  it('warns on unknown fields and falls back when none match', () => {
    const withUnknown = planExport({ entity: 'companies', fields: 'domain,not_a_field' });
    expect(withUnknown.plan!.fields).toEqual(['domain']);
    expect(withUnknown.plan!.warnings.join(' ')).toMatch(/unknown field/i);
    const allUnknown = planExport({ entity: 'companies', fields: 'nope,nada' });
    expect(allUnknown.plan!.fields).toEqual(EXPORT_FIELDS.companies);
  });

  it('caps at the limit and notes it', () => {
    const { plan } = planExport({ entity: 'companies', limit: 5 });
    expect(plan!.rows.length).toBe(5);
    expect(plan!.warnings.join(' ')).toMatch(/capped at 5/i);
  });

  it('defaults entity to companies and format to ndjson', () => {
    const { plan } = planExport({});
    expect(plan!.entity).toBe('companies');
    expect(plan!.format).toBe('ndjson');
  });
});

describe('cost', () => {
  it('bills per row block, minimum 1', () => {
    expect(exportCost(0)).toBe(1);
    expect(exportCost(1)).toBe(1);
    expect(exportCost(50)).toBe(1);
    expect(exportCost(51)).toBe(2);
    expect(exportCost(500)).toBe(10);
  });
});

describe('serialization', () => {
  const rows = [
    { domain: 'stripe.com', name: 'Stripe', note: 'a,b' },
    { domain: 'figma.com', name: 'Figma "Inc"', note: 'x' },
  ];
  const fields = ['domain', 'name', 'note'];

  it('NDJSON is one JSON object per line', () => {
    const out = serializeNdjson(rows);
    const lines = out.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).domain).toBe('stripe.com');
  });

  it('CSV has a header and escapes commas/quotes', () => {
    const out = serializeCsv(rows, fields);
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('domain,name,note');
    expect(lines[1]).toContain('"a,b"'); // comma quoted
    expect(lines[2]).toContain('"Figma ""Inc"""'); // quotes doubled
  });

  it('serializeExport dispatches by format', () => {
    const p = planExport({ entity: 'companies', format: 'json', fields: 'domain', limit: 3 }).plan!;
    const json = serializeExport(p);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
    expect(Object.keys(parsed[0])).toEqual(['domain']);
  });
});
