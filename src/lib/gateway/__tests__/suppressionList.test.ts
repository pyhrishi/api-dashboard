import {
  addSuppression, removeSuppression, checkSuppression, classifyIdentifier, getSuppressionStats, __resetSuppression,
} from '@/lib/gateway/suppressionList';

beforeEach(() => __resetSuppression());

describe('suppression list honoring', () => {
  it('classifies emails and domains', () => {
    expect(classifyIdentifier('Jane@ACME.com')).toEqual({ key: 'jane@acme.com', kind: 'email' });
    expect(classifyIdentifier('https://www.Acme.com/x')).toEqual({ key: 'acme.com', kind: 'domain' });
  });

  it('suppresses an exact email', () => {
    expect(checkSuppression('foo@bar.com')).toBeNull();
    const e = addSuppression('Foo@bar.com', 'unsubscribed', 'ops@x.com');
    expect(e.kind).toBe('email');
    expect(checkSuppression('foo@bar.com')?.reason).toBe('unsubscribed');
  });

  it('suppresses every mailbox on a suppressed domain', () => {
    addSuppression('blocked.com', 'competitor');
    expect(checkSuppression('anyone@blocked.com')?.kind).toBe('domain');
    expect(checkSuppression('ceo@blocked.com')?.reason).toBe('competitor');
    // a different domain is unaffected
    expect(checkSuppression('anyone@allowed.com')).toBeNull();
  });

  it('prefers an exact email match over the domain match', () => {
    addSuppression('special.com', 'competitor');
    addSuppression('vip@special.com', 'do_not_contact');
    expect(checkSuppression('vip@special.com')?.reason).toBe('do_not_contact');
    expect(checkSuppression('other@special.com')?.reason).toBe('competitor');
  });

  it('removes an entry', () => {
    addSuppression('x@y.com');
    expect(removeSuppression('X@Y.com')).toBe(true);
    expect(checkSuppression('x@y.com')).toBeNull();
    expect(removeSuppression('never@listed.com')).toBe(false);
  });

  it('reports a coherent seeded stats snapshot', () => {
    const s = getSuppressionStats();
    expect(s.total).toBeGreaterThan(0);
    expect(s.by_kind.email + s.by_kind.domain).toBe(s.total);
    expect(Object.values(s.by_reason).reduce((a, b) => a + b, 0)).toBe(s.total);
    // the seeded domain suppression is honored
    expect(checkSuppression('sales@competitor.com')?.kind).toBe('domain');
  });
});
