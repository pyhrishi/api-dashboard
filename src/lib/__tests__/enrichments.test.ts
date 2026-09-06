import { getEnrichmentPresets, getPresetById, detectInputKind, validateInput, toEnrichmentResult } from '@/data/enrichments';
import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { discoverSocialProfiles } from '@/lib/social-resolver';
import { resolveFundingForDomain } from '@/lib/funding-resolver';
import { resolveCompanyNews } from '@/lib/company-news-resolver';
import { fuzzyMatch } from '@/lib/fuzzy-matcher';
import { canonicalizeName } from '@/lib/name-canonicalizer';
import { verifyEmailDeliverability } from '@/lib/email-verifier';
import { detectDisposable } from '@/lib/disposable-detector';

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
    expect(getPresetById('reverse-ip')).toBeDefined();
  });

  it('detects the input kind', () => {
    expect(detectInputKind('jane@acme.com')).toBe('email');
    expect(detectInputKind('stripe.com')).toBe('domain');
    expect(detectInputKind('https://www.linkedin.com/in/jane')).toBe('linkedin');
    expect(detectInputKind('+1 415 555 0132')).toBe('phone');
    expect(detectInputKind('8.8.8.8')).toBe('ip');
    expect(detectInputKind('2001:db8::1')).toBe('ip');
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

  it('attributes every field to a named provider (F-043)', () => {
    const person = resolvePersonFromEmail('jane.doe@acme.com');
    const vm = toEnrichmentResult({ person })!;
    expect(vm.sources).toBeDefined();
    expect(vm.sources!.providerCount).toBeGreaterThan(1);
    expect(vm.sources!.fieldCount).toBe(vm.provenance!.length);
    // Every provider names a real category.
    vm.sources!.providers.forEach((pr) => {
      expect(['first-party', 'registry', 'partner', 'derived']).toContain(pr.provider.category);
      expect(pr.provider.license.length).toBeGreaterThan(0);
    });
  });

  it('attaches a completeness score to field-bearing records (F-048)', () => {
    const person = resolvePersonFromEmail('jane.doe@acme.com');
    const vm = toEnrichmentResult({ person })!;
    expect(vm.completeness).toBeDefined();
    expect(vm.completeness!.total).toBe(vm.fields.length);
    expect(vm.completeness!.score).toBeGreaterThanOrEqual(0);
    expect(vm.completeness!.score).toBeLessThanOrEqual(100);
    expect(['complete', 'partial', 'sparse']).toContain(vm.completeness!.tier);
  });

  it('omits completeness on structured-only results (social has no flat fields)', () => {
    const social = discoverSocialProfiles('jane.doe@acme.com')!;
    const vm = toEnrichmentResult({ ...social })!;
    expect(vm.completeness).toBeUndefined();
  });

  it('normalizes a company response to a rich view-model with chips', () => {
    const company = resolveCompanyFromDomain('stripe.com');
    const vm = toEnrichmentResult({ company })!;
    expect(vm.kind).toBe('company');
    expect(vm.chips?.items.length).toBeGreaterThan(0);
    expect(vm.confidence).toBeGreaterThan(0);
  });

  it('maps a disposable-detection response to the tone-coded verdict view-model (F-051)', () => {
    const det = detectDisposable('user@mailinator.com')!;
    const vm = toEnrichmentResult({ ...det })!;
    expect(vm.disposable).toBeDefined();
    expect(vm.disposable?.verdict).toBe('disposable');
    expect(vm.disposable?.tone).toBe('error');
    expect(vm.badges).toContain('Disposable');
    expect(vm.fields).toHaveLength(0); // structured panel, not flat fields
    // Trusted domains tone success.
    const trusted = toEnrichmentResult({ ...detectDisposable('sam@gmail.com')! })!;
    expect(trusted.disposable?.tone).toBe('success');
  });

  it('maps a funding response to the structured timeline view-model (F-009)', () => {
    const funding = resolveFundingForDomain('stripe.com')!;
    const vm = toEnrichmentResult({ ...funding })!;
    expect(vm.kind).toBe('company');
    expect(vm.funding).toBeDefined();
    expect(vm.funding?.hasFunding).toBe(true);
    expect(vm.funding?.rounds.length).toBe(funding.rounds.length);
    expect(vm.funding?.investors.length).toBe(funding.investor_count);
    expect(vm.fields).toHaveLength(0); // rendered via the timeline panel
    expect(vm.badges.some((b) => /round/.test(b))).toBe(true);
    // A no-funding company yields the empty-state view, not rounds.
    const boot = toEnrichmentResult({ ...resolveFundingForDomain('gmail.com')! })!;
    expect(boot.funding?.hasFunding).toBe(false);
    expect(boot.funding?.rounds).toHaveLength(0);
  });

  it('maps a company-news response to the structured feed view-model (F-015)', () => {
    const news = resolveCompanyNews('stripe.com')!;
    const vm = toEnrichmentResult({ ...news })!;
    expect(vm.kind).toBe('company');
    expect(vm.news).toBeDefined();
    expect(vm.news?.eventCount).toBe(news.event_count);
    expect(vm.news?.events.length).toBe(news.events.length);
    expect(vm.fields).toHaveLength(0); // rendered via the timeline panel
    // by-type tally is present and sums to the event count.
    const tallied = (vm.news?.byType ?? []).reduce((a, b) => a + b.count, 0);
    expect(tallied).toBe(vm.news?.eventCount);
    expect(vm.badges.some((b) => /event/.test(b))).toBe(true);
  });

  it('maps a fuzzy-match response to the ranked-candidate view-model (F-024)', () => {
    const m = fuzzyMatch('Jhon Smith', 'Stipe')!;
    const vm = toEnrichmentResult({ ...m })!;
    expect(vm.fuzzy).toBeDefined();
    expect(vm.fuzzy?.verdict).toBe(m.verdict);
    expect(vm.fuzzy?.interpreted.name).toBe('John Smith');
    expect(vm.fuzzy?.candidates.length).toBe(m.candidates.length);
    expect(vm.fields).toHaveLength(0); // rendered via the candidate panel
    // exactly the best_match candidate is flagged best.
    expect(vm.fuzzy?.candidates.filter((c) => c.best).length).toBe(1);
    expect(vm.fuzzy?.candidates[0].best).toBe(true);
  });

  it('maps a name-canonicalization response to the parsed view-model (F-030)', () => {
    const c = canonicalizeName('Dr. josé garcía jr.')!;
    const vm = toEnrichmentResult({ ...c })!;
    expect(vm.nameCanonical).toBeDefined();
    expect(vm.nameCanonical?.canonical).toBe('José García');
    expect(vm.nameCanonical?.ascii).toBe('Jose Garcia');
    expect(vm.nameCanonical?.components.prefix).toBe('Dr.');
    expect(vm.nameCanonical?.components.suffix).toBe('Jr.');
    expect(vm.nameCanonical?.changes.length).toBeGreaterThan(0);
    expect(vm.fields).toHaveLength(0); // rendered via the panel
    // A reordered name flags its badge.
    const rc = toEnrichmentResult({ ...canonicalizeName('Smith, Bob')! })!;
    expect(rc.nameCanonical?.reordered).toBe(true);
    expect(rc.nameCanonical?.canonical).toBe('Robert Smith');
  });

  it('flattens a generic flat response into fields', () => {
    const vm = toEnrichmentResult({ success: true, email: 'a@b.com', phone: '+1-555-0123', confidence: 0.95, carrier: 'Verizon' })!;
    expect(vm.kind).toBe('generic');
    expect(vm.confidence).toBe(0.95);
    expect(vm.fields.some((f) => f.value === 'Verizon')).toBe(true);
    expect(vm.fields.some((f) => f.label.toLowerCase() === 'success')).toBe(false);
  });

  it('maps a social discovery response to the structured footprint view-model', () => {
    const social = discoverSocialProfiles('jane.doe@acme.com')!;
    const vm = toEnrichmentResult({ ...social })!;
    expect(vm.kind).toBe('person');
    expect(vm.fields).toHaveLength(0); // rendered via the rich card grid, not flat fields
    expect(vm.social?.profiles.length).toBe(social.platform_count);
    // The primary account sorts first and every profile carries a confidence.
    expect(vm.social?.profiles[0]?.primary).toBe(true);
    expect(vm.social?.profiles.every((p) => p.confidence >= 0 && p.confidence <= 1)).toBe(true);
    // Stack Overflow (when present) labels its count as reputation, not followers.
    const so = vm.social?.profiles.find((p) => p.platform === 'Stack Overflow');
    if (so?.metric) expect(so.metric.label).toBe('reputation');
    // A verified count surfaces as a badge.
    expect(vm.badges.some((b) => /platform/.test(b))).toBe(true);
  });

  it('maps an email-deliverability response to the structured scored view-model', () => {
    const del = verifyEmailDeliverability('info@mailinator.com')!;
    const vm = toEnrichmentResult({ ...del })!;
    expect(vm.kind).toBe('person');
    expect(vm.fields).toHaveLength(0); // rendered via the scored panel, not flat fields
    expect(vm.deliverability).toBeDefined();
    expect(vm.deliverability?.verdict).toBe(del.verdict);
    expect(vm.deliverability?.score).toBe(del.score);
    expect(vm.deliverability?.checks.length).toBe(del.checks.length);
    // Disposable + role-based both surface as flag chips.
    expect(vm.deliverability?.flags.some((f) => f.label === 'Disposable')).toBe(true);
    expect(vm.deliverability?.flags.some((f) => f.label === 'Role-based')).toBe(true);
    // The verdict is echoed as a badge.
    expect(vm.badges).toContain('Undeliverable');
  });
});
