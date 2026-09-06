import { fuzzyMatch, jaroWinkler } from '@/lib/fuzzy-matcher';

describe('probabilistic fuzzy matching — jaroWinkler', () => {
  it('scores identical strings 1 and unrelated strings low', () => {
    expect(jaroWinkler('john', 'john')).toBe(1);
    expect(jaroWinkler('apple', 'orange')).toBeLessThan(0.7);
  });
  it('scores typos and transpositions high (prefix-weighted)', () => {
    expect(jaroWinkler('john', 'jhon')).toBeGreaterThan(0.9);
    expect(jaroWinkler('stripe', 'stipe')).toBeGreaterThan(0.9);
    expect(jaroWinkler('michael', 'micheal')).toBeGreaterThan(0.9);
  });
});

describe('probabilistic fuzzy matching — fuzzyMatch', () => {
  it('returns null only when the name is empty', () => {
    expect(fuzzyMatch('', 'Stripe')).toBeNull();
    expect(fuzzyMatch('John Smith', 'Stripe')).not.toBeNull();
  });

  it('is deterministic per query', () => {
    expect(fuzzyMatch('Jhon Smith', 'Stipe')).toEqual(fuzzyMatch('Jhon Smith', 'Stipe'));
  });

  it('corrects a typo\'d name + company to the canonical, with a strong verdict', () => {
    const r = fuzzyMatch('Jhon Smith', 'Stipe')!;
    expect(r.interpreted.name).toBe('John Smith');
    expect(r.interpreted.company).toBe('Stripe');
    expect(r.verdict).toBe('strong');
    expect(r.best_match?.email).toBe('john.smith@stripe.com');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('expands a nickname to its formal name', () => {
    const r = fuzzyMatch('Bob Johnson', 'Datadog')!;
    expect(r.interpreted.name).toBe('Robert Johnson');
    expect(r.best_match?.company).toBe('Datadog');
  });

  it('drops confidence to weak/no-match when the company cannot be reconciled', () => {
    const r = fuzzyMatch('Zxqw Vbnm', 'Nowhere Incorporated')!;
    expect(['weak', 'no_match']).toContain(r.verdict);
    expect(r.best_match ? r.best_match.company_similarity : 0).toBeLessThan(0.5);
  });

  it('ranks candidates by probability, best first, and gives a full breakdown', () => {
    const r = fuzzyMatch('Micheal Chen', 'notion')!;
    expect(r.candidates.length).toBeGreaterThan(1);
    for (let i = 1; i < r.candidates.length; i++) {
      expect(r.candidates[i - 1].match_probability).toBeGreaterThanOrEqual(r.candidates[i].match_probability);
    }
    expect(r.best_match).toEqual(r.candidates[0]);
    r.candidates.forEach((c) => {
      expect(c.name_similarity).toBeGreaterThanOrEqual(0);
      expect(c.match_probability).toBeLessThanOrEqual(1);
    });
    expect(r.provenance.length).toBeGreaterThan(0);
  });

  it('exposes best_match as null on a no_match verdict', () => {
    const r = fuzzyMatch('X', 'Q Z')!;
    if (r.verdict === 'no_match') expect(r.best_match).toBeNull();
    else expect(r.best_match).not.toBeNull();
  });
});
