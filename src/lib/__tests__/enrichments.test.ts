import { getEnrichmentPresets, getPresetById, detectInputKind, validateInput, toEnrichmentResult } from '@/data/enrichments';
import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';

describe('enrichment registry', () => {
  it('builds presets from real catalog endpoints (no orphans)', () => {
    const presets = getEnrichmentPresets();
    expect(presets.length).toBeGreaterThanOrEqual(8);
    for (const p of presets) {
      expect(p.endpoint).toBeDefined();
      expect(p.path).toMatch(/^\/v[12]\//);
      expect(p.creditCost).toBeGreaterThan(0);
      expect(p.endpoint.parameters.some((x) => x.name === p.param)).toBe(true);
    }
    expect(getPresetById('person')).toBeDefined();
    expect(getPresetById('company')).toBeDefined();
  });

  it('detects the input kind', () => {
    expect(detectInputKind('jane@acme.com')).toBe('email');
    expect(detectInputKind('stripe.com')).toBe('domain');
    expect(detectInputKind('https://www.linkedin.com/in/jane')).toBe('linkedin');
    expect(detectInputKind('+1 415 555 0132')).toBe('phone');
  });

  it('validates per-kind input', () => {
    expect(validateInput('email', 'jane@acme.com')).toBe(true);
    expect(validateInput('email', 'nope')).toBe(false);
    expect(validateInput('domain', 'stripe.com')).toBe(true);
    expect(validateInput('domain', 'no dots')).toBe(false);
  });

  it('normalizes a person response to a rich view-model', () => {
    const person = resolvePersonFromEmail('jane.doe@acme.com');
    const vm = toEnrichmentResult({ person })!;
    expect(vm.kind).toBe('person');
    expect(vm.title).toBe('Jane Doe');
    expect(vm.confidence).toBeGreaterThan(0);
    expect(vm.provenance?.length).toBeGreaterThan(0);
  });

  it('normalizes a company response to a rich view-model with chips', () => {
    const company = resolveCompanyFromDomain('stripe.com');
    const vm = toEnrichmentResult({ company })!;
    expect(vm.kind).toBe('company');
    expect(vm.chips?.items.length).toBeGreaterThan(0);
    expect(vm.confidence).toBeGreaterThan(0);
  });

  it('flattens a generic flat response into fields', () => {
    const vm = toEnrichmentResult({ success: true, email: 'a@b.com', phone: '+1-555-0123', confidence: 0.95, carrier: 'Verizon' })!;
    expect(vm.kind).toBe('generic');
    expect(vm.confidence).toBe(0.95);
    expect(vm.fields.some((f) => f.value === 'Verizon')).toBe(true);
    expect(vm.fields.some((f) => f.label.toLowerCase() === 'success')).toBe(false);
  });
});
