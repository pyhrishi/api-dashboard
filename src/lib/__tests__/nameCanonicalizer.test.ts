import { canonicalizeName, canonicalNameString } from '@/lib/name-canonicalizer';

describe('name canonicalization (F-030)', () => {
  it('returns null only for empty input', () => {
    expect(canonicalizeName('')).toBeNull();
    expect(canonicalizeName('   ')).toBeNull();
    expect(canonicalizeName('John Smith')).not.toBeNull();
  });

  it('is deterministic', () => {
    expect(canonicalizeName('SMITH, John')).toEqual(canonicalizeName('SMITH, John'));
  });

  it('reorders "Last, First" and parses components', () => {
    const c = canonicalizeName('Smith, John')!;
    expect(c.canonical).toBe('John Smith');
    expect(c.reordered).toBe(true);
    expect(c.components).toMatchObject({ first: 'John', last: 'Smith' });
  });

  it('expands a nickname and cases a Mc surname', () => {
    const c = canonicalizeName('bob mcdonald')!;
    expect(c.canonical).toBe('Robert McDonald');
    expect(c.nickname_expanded).toBe(true);
    expect(c.components.last).toBe('McDonald');
  });

  it('extracts prefix + suffix and folds accents for the ascii form', () => {
    const c = canonicalizeName('Dr. josé garcía jr.')!;
    expect(c.components.prefix).toBe('Dr.');
    expect(c.components.suffix).toBe('Jr.');
    expect(c.canonical).toBe('José García');
    expect(c.ascii).toBe('Jose Garcia');
    expect(c.formal).toBe('Dr. José García Jr.');
    expect(c.had_diacritics).toBe(true);
  });

  it('normalizes ALL-CAPS and corrects a typo', () => {
    const c = canonicalizeName('JHON SMITH')!;
    expect(c.canonical).toBe('John Smith');
    expect(c.changes.some((x) => /ALL-CAPS/.test(x))).toBe(true);
    expect(c.changes.some((x) => /typo/i.test(x))).toBe(true);
  });

  it("keeps O' and nobiliary particles cased correctly, and a middle name", () => {
    const ob = canonicalizeName("mary jane o'brien")!;
    expect(ob.components.last).toBe("O'Brien");
    expect(ob.components.middle).toBe('Jane');
    const vd = canonicalizeName('ludwig van der berg')!;
    expect(vd.components.last).toBe('van der Berg');
  });

  it('handles a mononym without inventing a surname', () => {
    const c = canonicalizeName('Madonna')!;
    expect(c.components.last).toBe('');
    expect(c.canonical).toBe('Madonna');
    expect(c.confidence).toBeLessThan(0.95);
  });

  it('exposes canonicalNameString as the shared simple form', () => {
    expect(canonicalNameString('Jhon Smith')).toBe('John Smith');
    expect(canonicalNameString('Bob Johnson')).toBe('Robert Johnson');
    expect(canonicalNameString('')).toBe('');
  });
});
