import { planPartial, computePartial } from '@/lib/gateway/partialResult';

// A person response mirrors the real shape: data.person.<field>.
const person = () => ({
  person: {
    full_name: 'Jane Doe', title: 'COO', company: 'Acme', email: 'jane@acme.com',
    email_verified: true, phone: '+1 (276) 842-8021', phone_verified: true,
    linkedin_url: 'https://linkedin.com/in/janedoe', github_url: null, twitter_url: null,
  },
  confidence: 0.94,
});

const openSet = (...ids: string[]) => (u: string) => ids.includes(u);

describe('partial-result responses (F-071)', () => {
  it('plans full completeness when no secondary upstream is degraded', () => {
    const plan = planPartial('people-search', openSet());
    expect(plan.partial).toBe(false);
    expect(plan.completeness).toBe(1);
    expect(plan.degraded).toEqual([]);
  });

  it('plans reduced completeness when a secondary upstream is open', () => {
    // people-search has 3 secondaries + 1 primary = 4 contributors.
    const plan = planPartial('people-search', openSet('carrier-hlr'));
    expect(plan.partial).toBe(true);
    expect(plan.completeness).toBe(0.75); // 3/4
    expect(plan.degraded).toEqual(['carrier-hlr']);
  });

  it('strips the degraded upstream’s fields and reports them missing', () => {
    const { data, meta } = computePartial('people-search', person(), openSet('carrier-hlr'));
    const p = (data as { person: Record<string, unknown> }).person;
    expect('phone' in p).toBe(false);
    expect('phone_verified' in p).toBe(false);
    // Other fields survive.
    expect(p.full_name).toBe('Jane Doe');
    expect(p.linkedin_url).toBeDefined();
    expect(meta.partial).toBe(true);
    expect(meta.degraded_upstreams).toEqual(['carrier-hlr']);
    expect(meta.missing[0].label).toBe('Direct phone');
    expect(meta.missing[0].upstreamName).toBe('Carrier HLR');
    expect(meta.missing[0].reason).toMatch(/degraded/i);
  });

  it('handles multiple degraded upstreams', () => {
    const { data, meta } = computePartial('people-search', person(), openSet('carrier-hlr', 'social-graph'));
    const p = (data as { person: Record<string, unknown> }).person;
    expect('phone' in p).toBe(false);
    expect('linkedin_url' in p).toBe(false);
    expect(p.email).toBe('jane@acme.com');
    expect(meta.missing).toHaveLength(2);
    expect(meta.completeness).toBe(0.5); // 2/4 resolved
  });

  it('does not mutate the input payload (pure)', () => {
    const original = person();
    computePartial('people-search', original, openSet('carrier-hlr'));
    expect(original.person.phone).toBe('+1 (276) 842-8021'); // untouched
  });

  it('is a no-op when nothing is degraded', () => {
    const original = person();
    const { data, meta } = computePartial('people-search', original, openSet());
    expect(data).toBe(original); // same reference — no clone
    expect(meta.partial).toBe(false);
    expect(meta.completeness).toBe(1);
  });

  it('is a no-op for endpoints without secondary contributions', () => {
    const { meta } = computePartial('name-canonicalize', { canonical: 'Jane Doe' }, openSet('carrier-hlr'));
    expect(meta.partial).toBe(false);
    expect(meta.completeness).toBe(1);
  });

  it('is deterministic', () => {
    const a = computePartial('people-search', person(), openSet('carrier-hlr'));
    const b = computePartial('people-search', person(), openSet('carrier-hlr'));
    expect(a).toEqual(b);
  });
});
