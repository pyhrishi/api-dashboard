import {
  parseFields,
  projectFields,
  sparseDiscountPct,
  applySparseDiscount,
  payloadBytes,
  SPARSE_NOMINAL_FIELDS,
  MAX_SELECTED_FIELDS,
} from '@/lib/gateway/fieldSelection';

describe('parseFields', () => {
  it('splits, trims, de-dupes, drops empties and malformed tokens', () => {
    expect(parseFields('email, phone ,,email,  ')).toEqual(['email', 'phone']);
    expect(parseFields('company.name, first_name, bad token, ok-1')).toEqual(['company.name', 'first_name', 'ok-1']);
  });
  it('returns [] for empty / nullish input', () => {
    expect(parseFields('')).toEqual([]);
    expect(parseFields(null)).toEqual([]);
    expect(parseFields(undefined)).toEqual([]);
  });
  it('caps at MAX_SELECTED_FIELDS', () => {
    const many = Array.from({ length: MAX_SELECTED_FIELDS + 20 }, (_, i) => `f${i}`).join(',');
    expect(parseFields(many)).toHaveLength(MAX_SELECTED_FIELDS);
  });
});

describe('projectFields', () => {
  const record = { email: 'a@b.com', phone: '555', title: 'CTO', company: { name: 'Acme', domain: 'acme.com', size: 500 } };

  it('projects an object to the requested top-level fields', () => {
    const p = projectFields(record, ['email', 'phone']);
    expect(p.data).toEqual({ email: 'a@b.com', phone: '555' });
    expect(p.selected.sort()).toEqual(['email', 'phone']);
    expect(p.omitted.sort()).toEqual(['company', 'title']);
    expect(p.applied).toBe(true);
  });

  it('supports one level of dotted nesting', () => {
    const p = projectFields(record, ['email', 'company.domain']);
    expect(p.data).toEqual({ email: 'a@b.com', company: { domain: 'acme.com' } });
  });

  it('ignores requested fields that are not present', () => {
    const p = projectFields(record, ['email', 'nonexistent', 'company.missing']);
    expect(p.data).toEqual({ email: 'a@b.com' });
  });

  it('projects each element of an array', () => {
    const arr = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const p = projectFields(arr, ['a']);
    expect(p.data).toEqual([{ a: 1 }, { a: 3 }]);
    expect(p.available).toEqual(['a', 'b']);
    expect(p.omitted).toEqual(['b']);
  });

  it('is a no-op with an empty field list', () => {
    const p = projectFields(record, []);
    expect(p.data).toBe(record);
    expect(p.applied).toBe(false);
  });

  it('returns primitives unchanged with applied=false', () => {
    expect(projectFields('hello', ['x']).applied).toBe(false);
    expect(projectFields(null, ['x']).applied).toBe(false);
  });
});

describe('sparse pricing', () => {
  it('discounts fewer fields more, capped, and never below the nominal width', () => {
    expect(sparseDiscountPct(0)).toBe(0);
    expect(sparseDiscountPct(1)).toBe(50); // 87.5% raw → capped at 50
    expect(sparseDiscountPct(4)).toBe(50); // exactly 50
    expect(sparseDiscountPct(6)).toBe(25);
    expect(sparseDiscountPct(SPARSE_NOMINAL_FIELDS)).toBe(0);
    expect(sparseDiscountPct(20)).toBe(0);
  });

  it('applies the discount to a base cost, flooring at 1 credit', () => {
    expect(applySparseDiscount(4, 2)).toEqual({ cost: 2, discountPct: 50 });
    expect(applySparseDiscount(1, 1)).toEqual({ cost: 1, discountPct: 50 }); // floor at 1
    expect(applySparseDiscount(4, 8)).toEqual({ cost: 4, discountPct: 0 }); // no discount at full width
  });
});

describe('payloadBytes', () => {
  it('reports a smaller size for a projected payload', () => {
    const full = { email: 'a@b.com', phone: '555', title: 'CTO', company: { name: 'Acme', domain: 'acme.com', size: 500 } };
    const sparse = projectFields(full, ['email']).data;
    expect(payloadBytes(sparse)).toBeLessThan(payloadBytes(full));
  });
});
