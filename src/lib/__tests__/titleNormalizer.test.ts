import { normalizeJobTitle } from '@/lib/title-normalizer';

describe('job title normalization', () => {
  it('returns null for empty input', () => {
    expect(normalizeJobTitle('')).toBeNull();
    expect(normalizeJobTitle('   ')).toBeNull();
  });

  it('is deterministic', () => {
    expect(normalizeJobTitle('VP, Eng')).toEqual(normalizeJobTitle('VP, Eng'));
  });

  it('normalizes a VP engineering title', () => {
    const t = normalizeJobTitle('VP, Engineering');
    expect(t).not.toBeNull();
    if (!t) return;
    expect(t.seniority).toBe('VP');
    expect(t.function).toBe('Engineering');
    expect(t.canonical_title).toBe('VP, Engineering');
    expect(t.management_level).toBe('Executive');
    expect(t.is_decision_maker).toBe(true);
  });

  it('expands a C-suite abbreviation to its full title', () => {
    const t = normalizeJobTitle('CTO');
    expect(t?.seniority).toBe('C-Suite');
    expect(t?.canonical_title).toBe('Chief Technology Officer');
    expect(t?.is_decision_maker).toBe(true);
  });

  it('maps "Head of X" to Director and preserves the head-of phrasing', () => {
    const t = normalizeJobTitle('Head of Growth');
    expect(t?.seniority).toBe('Director');
    expect(t?.function).toBe('Marketing');
    // "Growth" normalizes to the Marketing function — that is the point of the feature.
    expect(t?.canonical_title).toBe('Head of Marketing');
    expect(t?.management_level).toBe('People manager');
  });

  it('normalizes a messy senior IC title', () => {
    const t = normalizeJobTitle('Sr. Software Engineer II');
    expect(t?.seniority).toBe('Senior');
    expect(t?.function).toBe('Engineering');
    expect(t?.canonical_title).toBe('Senior Software Engineer');
    expect(t?.management_level).toBe('Individual contributor');
    expect(t?.is_decision_maker).toBe(false);
  });

  it('classifies an IC sales title', () => {
    const t = normalizeJobTitle('Account Executive');
    expect(t?.seniority).toBe('Individual Contributor');
    expect(t?.function).toBe('Sales');
    expect(t?.canonical_title).toBe('Account Executive');
  });

  it('degrades gracefully on an unrecognized title (low confidence, defaults)', () => {
    const t = normalizeJobTitle('Chief Vibes Wrangler');
    expect(t).not.toBeNull();
    if (!t) return;
    // "Chief" still reads as C-Suite; no function keyword → Executive/default.
    expect(t.seniority).toBe('C-Suite');
    const gibberish = normalizeJobTitle('qwerty asdf');
    expect(gibberish?.function).toBe('General');
    expect(gibberish?.confidence).toBeLessThan(0.6);
  });

  it('surfaces the lexicon tokens as signals', () => {
    const t = normalizeJobTitle('Senior Data Scientist');
    expect(t?.matched_signals.map((s) => s.field)).toEqual(
      expect.arrayContaining(['seniority', 'function', 'management_level'])
    );
    expect(t?.function).toBe('Data & Analytics');
  });
});
