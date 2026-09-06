import { deduplicateRecords, parseRecords } from '@/lib/entity-dedup';
import { toEnrichmentResult } from '@/data/enrichments';

describe('entity de-duplication', () => {
  it('parses a delimited "Name, Company" list', () => {
    const recs = parseRecords('John Smith, Stripe; Jane Doe, Acme');
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ name: 'John Smith', company: 'Stripe' });
    expect(recs[1]).toMatchObject({ name: 'Jane Doe', company: 'Acme' });
  });

  it('returns null when fewer than two records parse', () => {
    expect(deduplicateRecords('')).toBeNull();
    expect(deduplicateRecords('John Smith, Stripe')).toBeNull();
    expect(deduplicateRecords('   ;  ')).toBeNull();
  });

  it('collapses obvious duplicates (typos + company variants) into one cluster', () => {
    const res = deduplicateRecords('John Smith, Stripe; Jhon Smith, Stipe; J. Smith, stripe.com')!;
    expect(res.input_count).toBe(3);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].size).toBe(3);
    expect(res.clusters[0].golden.name).toBe('John Smith');
    expect(res.clusters[0].confidence).toBeGreaterThan(0.8);
  });

  it('keeps genuinely distinct entities apart', () => {
    const res = deduplicateRecords('John Smith, Stripe; Jane Doe, Acme')!;
    expect(res.unique_count).toBe(2);
    expect(res.duplicate_count).toBe(0);
    expect(res.dedup_rate).toBe(0);
    res.clusters.forEach((c) => expect(c.size).toBe(1));
  });

  it('reconciles the dedup summary with the clusters', () => {
    const res = deduplicateRecords('John Smith, Stripe; Jhon Smith, Stripe; Jane Doe, Acme; Jane Doe, Acme.com')!;
    expect(res.unique_count).toBe(res.clusters.length);
    expect(res.duplicate_count).toBe(res.input_count - res.unique_count);
    const memberTotal = res.clusters.reduce((n, c) => n + c.members.length, 0);
    expect(memberTotal).toBe(res.input_count);
    // exactly one golden per cluster
    res.clusters.forEach((c) => expect(c.members.filter((m) => m.is_golden)).toHaveLength(1));
  });

  it('elects the most complete member as the golden record', () => {
    const res = deduplicateRecords('J. Smith, Stripe; John Smith, Stripe; John Smith, Stripe')!;
    const biggest = res.clusters[0];
    expect(biggest.golden.name).toBe('John Smith');
  });

  it('is deterministic', () => {
    const input = 'John Smith, Stripe; Jhon Smith, Stipe; Jane Doe, Acme';
    expect(deduplicateRecords(input)).toEqual(deduplicateRecords(input));
  });

  it('flows through the Studio dispatch into a dedupe view-model', () => {
    const res = deduplicateRecords('John Smith, Stripe; Jhon Smith, Stipe; Jane Doe, Acme')!;
    const vm = toEnrichmentResult({ success: true, ...res });
    expect(vm).not.toBeNull();
    expect(vm!.dedupe).toBeDefined();
    expect(vm!.dedupe!.inputCount).toBe(res.input_count);
    expect(vm!.dedupe!.clusters).toHaveLength(res.clusters.length);
    expect(vm!.dedupe!.clusters.reduce((n, c) => n + c.members.length, 0)).toBe(res.input_count);
  });
});
