import { detectTechnographics } from '@/lib/technographic-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { toEnrichmentResult } from '@/data/enrichments';

describe('technographic detection', () => {
  it('is deterministic for the same domain', () => {
    expect(detectTechnographics('stripe.com')).toEqual(detectTechnographics('stripe.com'));
  });

  it('returns null for personal mailbox and invalid domains', () => {
    expect(detectTechnographics('gmail.com')).toBeNull();
    expect(detectTechnographics('not a domain')).toBeNull();
    expect(detectTechnographics('')).toBeNull();
  });

  it('enriches the company dossier stack — never a divergent one', () => {
    const domain = 'datadoghq.com';
    const company = resolveCompanyFromDomain(domain);
    const techno = detectTechnographics(domain);
    expect(company).not.toBeNull();
    expect(techno).not.toBeNull();
    // The detected names are exactly the company's own tech_stack (coherence).
    expect(techno!.detections.map((d) => d.name).sort()).toEqual([...company!.tech_stack].sort());
    expect(techno!.total).toBe(company!.tech_stack.length);
  });

  it('produces coherent detections with valid method, confidence, and dates', () => {
    const t = detectTechnographics('shopify.com');
    expect(t).not.toBeNull();
    for (const d of t!.detections) {
      expect(['DNS record', 'SSL certificate', 'HTTP header', 'Subdomain', 'JS fingerprint', 'Job posting']).toContain(d.method);
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(0.99);
      expect(d.vendor.length).toBeGreaterThan(0);
      // first_detected is strictly before last_detected
      expect(new Date(d.first_detected).getTime()).toBeLessThan(new Date(d.last_detected).getTime());
    }
  });

  it('rolls categories up to the detection total, ordered subset, no empties', () => {
    const t = detectTechnographics('stripe.com')!;
    const sum = t.categories.reduce((n, c) => n + c.count, 0);
    expect(sum).toBe(t.total);
    for (const c of t.categories) {
      expect(c.count).toBeGreaterThan(0);
      expect(c.technologies).toHaveLength(c.count);
    }
  });

  it('derives 1–4 signals and a composite sophistication in range', () => {
    const t = detectTechnographics('stripe.com')!;
    expect(t.signals.length).toBeGreaterThanOrEqual(1);
    expect(t.signals.length).toBeLessThanOrEqual(4);
    expect(t.sophistication).toBeGreaterThanOrEqual(0);
    expect(t.sophistication).toBeLessThanOrEqual(100);
    expect(['<$50K/yr', '$50K–$250K/yr', '$250K–$1M/yr', '$1M+/yr']).toContain(t.estimated_stack_spend);
  });

  it('flows through the Studio dispatch into a technographic view-model', () => {
    const profile = detectTechnographics('stripe.com')!;
    // Mirror the gateway/sandbox response shape { success, ...profile } → view-model.
    const vm = toEnrichmentResult({ success: true, ...profile });
    expect(vm).not.toBeNull();
    expect(vm!.kind).toBe('company');
    expect(vm!.technographic).toBeDefined();
    expect(vm!.technographic!.total).toBe(profile.total);
    expect(vm!.technographic!.categories.reduce((n, c) => n + c.items.length, 0)).toBe(profile.total);
    expect(vm!.technographic!.signals.length).toBe(profile.signals.length);
  });
});
