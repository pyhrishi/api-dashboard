/**
 * Field-level PII masking (F-313) — unit tests for the SSOT.
 * Deterministic: same value + strategy → same masked output; floors enforced.
 */
import {
  classifyKey, defaultPolicy, normalizePolicy, normalizeMaskingPatch, isStrategyAllowed,
  maskValue, maskPayload, policyStrength, strategyRank, fieldSpec, PII_CATALOG, SAMPLE_RECORD,
  useMaskingPolicy,
  type MaskingPolicy, type PiiFieldType,
} from '@/lib/pii-masking';

describe('key classification', () => {
  it('maps common keys to PII types', () => {
    expect(classifyKey('email')).toBe('email');
    expect(classifyKey('work_email')).toBe('email');
    expect(classifyKey('phone')).toBe('phone');
    expect(classifyKey('mobile')).toBe('phone');
    expect(classifyKey('ssn')).toBe('government_id');
    expect(classifyKey('date_of_birth')).toBe('date_of_birth');
    expect(classifyKey('dob')).toBe('date_of_birth');
    expect(classifyKey('ip_address')).toBe('ip_address');
    expect(classifyKey('linkedin_url')).toBe('linkedin_url');
  });

  it('returns null for non-PII keys', () => {
    expect(classifyKey('company')).toBeNull();
    expect(classifyKey('title')).toBeNull();
    expect(classifyKey('industry')).toBeNull();
  });
});

describe('value masking — deterministic per strategy', () => {
  it('partial email keeps the domain, obscures the local part', () => {
    const a = maskValue('jordan.rivera@northwind.io', 'email', 'partial');
    expect(a).toBe(maskValue('jordan.rivera@northwind.io', 'email', 'partial'));
    expect(a).toContain('@northwind.io');
    expect(a).not.toContain('jordan.rivera');
  });

  it('partial phone keeps the last four digits', () => {
    expect(maskValue('+1 415 555 0142', 'phone', 'partial')).toContain('0142');
  });

  it('redact fully hides', () => {
    expect(maskValue('123-45-6789', 'government_id', 'redact')).not.toContain('6789');
  });

  it('hash + tokenize are stable and prefixed', () => {
    expect(maskValue('x@y.com', 'email', 'hash')).toMatch(/^sha256:[0-9a-z]+$/);
    expect(maskValue('x@y.com', 'email', 'hash')).toBe(maskValue('x@y.com', 'email', 'hash'));
    expect(maskValue('x@y.com', 'email', 'tokenize')).toMatch(/^tok_[0-9a-z]+$/);
    expect(maskValue('a', 'email', 'tokenize')).not.toBe(maskValue('b', 'email', 'tokenize'));
  });

  it('none is a passthrough', () => {
    expect(maskValue('keep-me', 'full_name', 'none')).toBe('keep-me');
  });
});

describe('strategy floors', () => {
  it('sensitive types cannot be relaxed below their floor', () => {
    expect(isStrategyAllowed('government_id', 'none')).toBe(false);
    expect(isStrategyAllowed('government_id', 'partial')).toBe(false);
    expect(isStrategyAllowed('government_id', 'redact')).toBe(true);
    expect(isStrategyAllowed('email', 'none')).toBe(false);
    expect(isStrategyAllowed('email', 'partial')).toBe(true);
    expect(isStrategyAllowed('full_name', 'none')).toBe(true);
  });

  it('strategyRank orders weakest→strongest', () => {
    expect(strategyRank('none')).toBeLessThan(strategyRank('partial'));
    expect(strategyRank('partial')).toBeLessThan(strategyRank('redact'));
  });
});

describe('policy normalization', () => {
  it('default policy covers every catalog type and is enabled', () => {
    const p = defaultPolicy();
    expect(p.enabled).toBe(true);
    expect(Object.keys(p.strategies).sort()).toEqual(PII_CATALOG.map((s) => s.type).sort());
  });

  it('normalizePolicy clamps below-floor choices up to the floor', () => {
    const p = normalizePolicy({ strategies: { government_id: 'none', email: 'redact' } });
    expect(p.strategies.government_id).toBe(fieldSpec('government_id').minStrategy);
    expect(p.strategies.email).toBe('redact');
  });

  it('normalizeMaskingPatch drops unknown fields + invalid strategies, never throws', () => {
    const patch = normalizeMaskingPatch({ enabled: false, strategies: { email: 'partial', bogus: 'redact', government_id: 'none' } });
    expect(patch.enabled).toBe(false);
    expect(patch.strategies?.email).toBe('partial');
    expect((patch.strategies as Record<string, unknown>)?.bogus).toBeUndefined();
    // government_id 'none' is below floor → dropped
    expect(patch.strategies?.government_id).toBeUndefined();
    expect(normalizeMaskingPatch(null)).toEqual({});
    expect(normalizeMaskingPatch('nope')).toEqual({});
  });
});

describe('maskPayload — deep, non-mutating, reports masked fields', () => {
  const policy: MaskingPolicy = defaultPolicy();

  it('masks nested PII and leaves non-PII intact', () => {
    const res = maskPayload(SAMPLE_RECORD, policy);
    const masked = res.masked as typeof SAMPLE_RECORD;
    expect(masked.company).toBe('Northwind Traders'); // untouched
    expect(masked.email).not.toBe(SAMPLE_RECORD.email); // masked
    const loc = masked.location as Record<string, unknown>;
    expect(loc.ip_address).not.toBe('198.51.100.24'); // nested masked
    expect(loc.city).toBe('San Francisco'); // nested non-PII untouched
    expect(res.maskedKeys).toContain('email');
    expect(res.maskedKeys).toContain('ip_address');
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(SAMPLE_RECORD);
    maskPayload(SAMPLE_RECORD, policy);
    expect(JSON.stringify(SAMPLE_RECORD)).toBe(before);
  });

  it('disabled policy is a passthrough', () => {
    const res = maskPayload(SAMPLE_RECORD, { ...policy, enabled: false });
    expect(res.masked).toEqual(SAMPLE_RECORD);
    expect(res.maskedKeys).toHaveLength(0);
  });

  it('handles arrays of records', () => {
    const res = maskPayload([{ email: 'a@b.com' }, { email: 'c@d.com' }], policy);
    const arr = res.masked as { email: string }[];
    expect(arr[0].email).not.toBe('a@b.com');
    expect(arr[1].email).not.toBe('c@d.com');
  });
});

describe('policyStrength', () => {
  it('is 0 when disabled and >0 when enabled by default', () => {
    expect(policyStrength({ ...defaultPolicy(), enabled: false })).toBe(0);
    expect(policyStrength(defaultPolicy())).toBeGreaterThan(0);
  });

  it('rises when fields are set to stronger strategies', () => {
    const weak = normalizePolicy({ strategies: PII_CATALOG.reduce((a, s) => { a[s.type] = s.minStrategy; return a; }, {} as Record<PiiFieldType, ReturnType<typeof fieldSpec>['minStrategy']>) });
    const strong = normalizePolicy({ strategies: PII_CATALOG.reduce((a, s) => { a[s.type] = 'redact'; return a; }, {} as Record<PiiFieldType, 'redact'>) });
    expect(policyStrength(strong)).toBeGreaterThan(policyStrength(weak));
  });
});

describe('persisted store enforces the floor', () => {
  it('setStrategy ignores a below-floor choice', () => {
    useMaskingPolicy.getState().setStrategy('government_id', 'none');
    expect(useMaskingPolicy.getState().strategies.government_id).toBe('redact');
    useMaskingPolicy.getState().setStrategy('email', 'redact');
    expect(useMaskingPolicy.getState().strategies.email).toBe('redact');
    useMaskingPolicy.getState().resetPolicy();
    expect(useMaskingPolicy.getState().strategies.email).toBe(fieldSpec('email').defaultStrategy);
  });
});
