import { validateRecord } from '@/lib/record-validator';
import { toEnrichmentResult } from '@/data/enrichments';

describe('cross-field validation', () => {
  it('is deterministic per email', () => {
    expect(validateRecord('jane.doe@acme.com')).toEqual(validateRecord('jane.doe@acme.com'));
  });

  it('returns null when no person resolves', () => {
    expect(validateRecord('')).toBeNull();
    expect(validateRecord('not-an-email')).toBeNull();
  });

  it('runs the cross-field rule set with coherent output', () => {
    const v = validateRecord('marcus@stripe.com');
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.rules.map((r) => r.rule)).toEqual(
      expect.arrayContaining(['email_company_domain', 'title_seniority', 'name_email'])
    );
    for (const r of v.rules) {
      expect(['pass', 'warn', 'fail']).toContain(r.status);
      expect(r.detail.length).toBeGreaterThan(0);
    }
    expect(v.integrity_score).toBeGreaterThanOrEqual(0);
    expect(v.integrity_score).toBeLessThanOrEqual(100);
    expect(['consistent', 'minor_issues', 'inconsistent']).toContain(v.verdict);
  });

  it('ties the verdict and consistent flag to the rule outcomes', () => {
    const v = validateRecord('priya.nair@zomato.in');
    if (!v) return;
    const hasFail = v.rules.some((r) => r.status === 'fail');
    const hasWarn = v.rules.some((r) => r.status === 'warn');
    expect(v.consistent).toBe(!hasFail);
    expect(v.verdict).toBe(hasFail ? 'inconsistent' : hasWarn ? 'minor_issues' : 'consistent');
  });

  it('passes email↔company for a corporate address whose domain matches', () => {
    const v = validateRecord('jane.doe@acme.com');
    const rule = v?.rules.find((r) => r.rule === 'email_company_domain');
    expect(rule?.status).toBe('pass');
  });

  it('renders a validation response through toEnrichmentResult', () => {
    const v = validateRecord('marcus@stripe.com');
    expect(v).not.toBeNull();
    if (!v) return;
    const vm = toEnrichmentResult({ success: true, ...v });
    expect(vm).not.toBeNull();
    expect(vm?.title).toBe(v.subject);
    expect(vm?.fields.some((f) => /Verdict|integrity/i.test(f.label + f.value))).toBe(true);
  });
});
