import { scoreCompleteness, isFieldPopulated } from '@/lib/completeness-scorer';

describe('completeness scoring — isFieldPopulated', () => {
  it('treats real values as populated', () => {
    ['Jane Doe', 'stripe.com', '8,000 · 1K-5K', '$1.2B raised', 'IND', 'San Francisco · PST'].forEach((v) =>
      expect(isFieldPopulated(v)).toBe(true));
  });
  it('treats placeholders and punctuation-only values as empty', () => {
    ['', '   ', '—', '-', '– · –', 'N/A', 'n/a', 'null', 'undefined', 'Unknown', 'None'].forEach((v) =>
      expect(isFieldPopulated(v)).toBe(false));
  });
});

describe('completeness scoring — scoreCompleteness', () => {
  it('returns null when there are no fields (structured-only results)', () => {
    expect(scoreCompleteness([])).toBeNull();
  });

  it('scores the share of populated fields and lists the missing ones', () => {
    const c = scoreCompleteness([
      { label: 'Email', value: 'jane@acme.com' },
      { label: 'Phone', value: '+1 415 555 0132' },
      { label: 'Company', value: 'Acme' },
      { label: 'Location', value: '—' },
    ])!;
    expect(c.total).toBe(4);
    expect(c.populated).toBe(3);
    expect(c.score).toBe(75);
    expect(c.missing).toEqual(['Location']);
    expect(c.tier).toBe('partial');
  });

  it('tiers a fully-populated record as complete', () => {
    const c = scoreCompleteness([
      { label: 'A', value: 'x' }, { label: 'B', value: 'y' }, { label: 'C', value: 'z' },
    ])!;
    expect(c.score).toBe(100);
    expect(c.tier).toBe('complete');
    expect(c.missing).toHaveLength(0);
  });

  it('tiers a mostly-empty record as sparse', () => {
    const c = scoreCompleteness([
      { label: 'A', value: 'x' }, { label: 'B', value: '—' }, { label: 'C', value: 'N/A' }, { label: 'D', value: '' },
    ])!;
    expect(c.score).toBe(25);
    expect(c.tier).toBe('sparse');
    expect(c.missing).toEqual(['B', 'C', 'D']);
  });

  it('is deterministic', () => {
    const fields = [{ label: 'A', value: 'x' }, { label: 'B', value: '—' }];
    expect(scoreCompleteness(fields)).toEqual(scoreCompleteness(fields));
  });
});
