import { resolveStreamRow, normalizeStreamInputs, kindForEndpoint, MAX_STREAM_INPUTS } from '@/lib/gateway/streamEnrich';

describe('streaming inline enrichment (F-020)', () => {
  it('classifies the operation into people vs companies', () => {
    expect(kindForEndpoint('people-search')).toBe('people');
    expect(kindForEndpoint('company-enrich')).toBe('companies');
    expect(kindForEndpoint('firmographic-append')).toBe('companies');
  });

  it('normalizes inputs from an array or a delimited string', () => {
    expect(normalizeStreamInputs(['a@b.com', ' c@d.com '])).toEqual(['a@b.com', 'c@d.com']);
    expect(normalizeStreamInputs('a@b.com\nc@d.com, e@f.com')).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
    expect(normalizeStreamInputs('["a@b.com","c@d.com"]')).toEqual(['a@b.com', 'c@d.com']);
    expect(normalizeStreamInputs(42)).toEqual([]);
    expect(MAX_STREAM_INPUTS).toBe(500);
  });

  it('resolves a person row to matched with output and a bounded latency', () => {
    const r = resolveStreamRow('people', 'marcus@stripe.com', 0);
    expect(r.type).toBe('row');
    expect(r.status).toBe('matched');
    expect(r.output?.email).toBe('marcus@stripe.com');
    expect(r.latency_ms).toBeGreaterThanOrEqual(35);
    expect(r.latency_ms).toBeLessThan(90);
  });

  it('marks a non-email people row as a per-row error, not a crash', () => {
    const r = resolveStreamRow('people', 'not-an-email', 3);
    expect(r.status).toBe('error');
    expect(r.error).toBe('INVALID_EMAIL');
  });

  it('resolves a company row by domain', () => {
    const r = resolveStreamRow('companies', 'stripe.com', 0);
    expect(r.status).toBe('matched');
    expect(r.output?.domain).toBe('stripe.com');
  });

  it('is deterministic — same input, same row (latency included)', () => {
    expect(resolveStreamRow('people', 'sarah@datadoghq.com', 5)).toEqual(resolveStreamRow('people', 'sarah@datadoghq.com', 5));
  });

  it('flags an empty input as an error row', () => {
    const r = resolveStreamRow('people', '   ', 1);
    expect(r.status).toBe('error');
    expect(r.error).toBe('EMPTY_INPUT');
  });
});
