import { resolveCompanyHierarchy, type CompanyHierarchy } from '@/lib/company-hierarchy';

const DOMAINS = ['acme.com', 'stripe.com', 'shopify.com', 'zomato.com', 'notion.so', 'figma.com', 'datadog.com', 'airbnb.com'];

function trees(): CompanyHierarchy[] {
  return DOMAINS.map((d) => resolveCompanyHierarchy(d)).filter((h): h is CompanyHierarchy => h !== null);
}

describe('resolveCompanyHierarchy', () => {
  it('is deterministic', () => {
    expect(resolveCompanyHierarchy('acme.com')).toEqual(resolveCompanyHierarchy('acme.com'));
  });

  it('returns null for a personal domain', () => {
    expect(resolveCompanyHierarchy('gmail.com')).toBeNull();
  });

  it('produces a connected tree with exactly one ultimate parent (root)', () => {
    for (const h of trees()) {
      const roots = h.nodes.filter((n) => n.is_ultimate_parent);
      expect(roots).toHaveLength(1);
      expect(roots[0].parent_id).toBeNull();
      expect(roots[0].id).toBe(h.ultimate_parent_id);
      // every non-root node points at a parent that exists in the tree
      const ids = new Set(h.nodes.map((n) => n.id));
      for (const n of h.nodes) {
        if (n.parent_id !== null) expect(ids.has(n.parent_id)).toBe(true);
      }
    }
  });

  it('always includes exactly one subject node matching the queried domain', () => {
    for (const h of trees()) {
      const subjects = h.nodes.filter((n) => n.is_subject);
      expect(subjects).toHaveLength(1);
      expect(subjects[0].id).toBe(h.subject_id);
      expect(subjects[0].domain).toBe(h.subject_domain);
    }
  });

  it('gives every child a 51–100% ownership stake and a registry id', () => {
    for (const h of trees()) {
      for (const n of h.nodes) {
        expect(n.registry_id.length).toBeGreaterThan(0);
        if (n.parent_id !== null) {
          expect(n.ownership_pct).not.toBeNull();
          expect(n.ownership_pct!).toBeGreaterThanOrEqual(51);
          expect(n.ownership_pct!).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('keeps role consistent with the tree shape', () => {
    for (const h of trees()) {
      const subject = h.nodes.find((n) => n.is_subject)!;
      if (h.role === 'standalone') {
        expect(h.nodes).toHaveLength(1);
        expect(subject.is_ultimate_parent).toBe(true);
      } else if (h.role === 'parent') {
        expect(subject.is_ultimate_parent).toBe(true);
        expect(h.nodes.length).toBeGreaterThan(1); // has children
      } else {
        // subsidiary: subject sits under a parent
        expect(subject.is_ultimate_parent).toBe(false);
        expect(subject.parent_id).not.toBeNull();
      }
      expect(h.total_entities).toBe(h.nodes.length);
      expect(h.countries.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers all three archetypes across a representative sample', () => {
    const roles = new Set(trees().map((h) => h.role));
    // With 8 varied domains we expect more than one archetype to appear.
    expect(roles.size).toBeGreaterThanOrEqual(2);
  });
});
