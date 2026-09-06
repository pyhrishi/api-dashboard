/**
 * F-113 Scoped key permissions — scope mapping + enforcement registry tests.
 * Deterministic, no network.
 */
import {
  scopeForEndpoint, keyHasScope, isUnrestricted, SCOPE_CATALOG, scopeLabel,
} from '@/lib/scopes';
import {
  registerKeyScopes, unregisterKeyScopes, getKeyScopes, checkEndpointScope,
  getScopeRegistrySnapshot, __resetScopes,
} from '@/lib/gateway/scopes';

beforeEach(() => __resetScopes());

describe('scopeForEndpoint', () => {
  const ep = (path: string, method = 'GET', creditCost = 1) => ({ path, method, creditCost });
  it('maps identity/corporate/search/write/enrich correctly', () => {
    expect(scopeForEndpoint(ep('/v1/people/phone'))).toBe('identity:read');
    expect(scopeForEndpoint(ep('/v1/people/email'))).toBe('identity:read');
    expect(scopeForEndpoint(ep('/v1/companies/enrich'))).toBe('corporate:read');
    expect(scopeForEndpoint(ep('/v1/companies/technographics'))).toBe('corporate:read');
    expect(scopeForEndpoint(ep('/v1/people/search/ai'))).toBe('search:execute');
    expect(scopeForEndpoint(ep('/v1/match/fuzzy'))).toBe('search:execute');
    expect(scopeForEndpoint(ep('/v1/enrichment/reverse'))).toBe('search:execute');
    expect(scopeForEndpoint(ep('/v1/jobs', 'POST'))).toBe('write');
    expect(scopeForEndpoint(ep('/v1/batch/enrich', 'POST'))).toBe('write');
    // General utilities fall through to enrich:read.
    expect(scopeForEndpoint(ep('/v1/currency/normalize'))).toBe('enrich:read');
    expect(scopeForEndpoint(ep('/v1/records/validate'))).toBe('enrich:read');
  });
  it('returns null for free/meta endpoints', () => {
    expect(scopeForEndpoint(ep('/v1/idempotency', 'GET', 0))).toBeNull();
    expect(scopeForEndpoint(ep('/v1/circuits', 'GET', 0))).toBeNull();
    expect(scopeForEndpoint(ep('/v1/coalescing', 'GET', 0))).toBeNull();
  });
});

describe('keyHasScope', () => {
  it('honors wildcard, exact, category-wildcard, and null', () => {
    expect(keyHasScope(['*'], 'identity:read')).toBe(true);
    expect(keyHasScope(['all'], 'corporate:read')).toBe(true);
    expect(keyHasScope(['identity:read'], 'identity:read')).toBe(true);
    expect(keyHasScope(['identity:*'], 'identity:read')).toBe(true);
    expect(keyHasScope(['corporate:read'], 'identity:read')).toBe(false);
    expect(keyHasScope([], 'identity:read')).toBe(false);
    expect(keyHasScope([], null)).toBe(true); // meta endpoint needs no scope
  });
  it('isUnrestricted detects wildcard / empty', () => {
    expect(isUnrestricted(['*'])).toBe(true);
    expect(isUnrestricted([])).toBe(true);
    expect(isUnrestricted(['identity:read'])).toBe(false);
  });
  it('scopeLabel resolves catalog + wildcard', () => {
    expect(scopeLabel('*')).toMatch(/full access/i);
    expect(scopeLabel('identity:read')).toBe('Identity');
    expect(SCOPE_CATALOG.length).toBeGreaterThanOrEqual(5);
  });
});

describe('registry + enforcement', () => {
  const company = { path: '/v1/companies/enrich', method: 'GET', creditCost: 1 };
  const person = { path: '/v1/people/phone', method: 'GET', creditCost: 3 };

  it('unregistered keys are unrestricted (lazy provisioning preserved)', () => {
    const check = checkEndpointScope('sk_test_unknown', company);
    expect(check.allowed).toBe(true);
    expect(check.restricted).toBe(false);
    expect(getKeyScopes('sk_test_unknown')).toEqual(['*']);
  });

  it('a restricted key is allowed in-scope and denied out-of-scope', () => {
    registerKeyScopes('sk_live_corp', ['corporate:read']);
    expect(checkEndpointScope('sk_live_corp', company).allowed).toBe(true);
    const denied = checkEndpointScope('sk_live_corp', person);
    expect(denied.allowed).toBe(false);
    expect(denied.requiredScope).toBe('identity:read');
    expect(denied.restricted).toBe(true);
  });

  it('re-registering replaces scopes; unregister reverts to unrestricted', () => {
    registerKeyScopes('sk_live_x', ['corporate:read']);
    expect(checkEndpointScope('sk_live_x', person).allowed).toBe(false);
    registerKeyScopes('sk_live_x', ['*']);
    expect(checkEndpointScope('sk_live_x', person).allowed).toBe(true);
    unregisterKeyScopes('sk_live_x');
    expect(getKeyScopes('sk_live_x')).toEqual(['*']);
  });

  it('snapshot counts registered/restricted keys, checks, and denials', () => {
    registerKeyScopes('sk_live_a', ['identity:read']);
    registerKeyScopes('sk_live_b', ['*']);
    checkEndpointScope('sk_live_a', company); // denied (needs corporate:read)
    checkEndpointScope('sk_live_a', person);  // allowed
    const snap = getScopeRegistrySnapshot();
    expect(snap.registeredKeys).toBeGreaterThanOrEqual(2);
    expect(snap.restrictedKeys).toBeGreaterThanOrEqual(1);
    expect(snap.checksPerformed).toBeGreaterThanOrEqual(2);
    expect(snap.denials).toBeGreaterThanOrEqual(1);
    // Keys are masked in the snapshot.
    expect(snap.keys.every((k) => k.key.includes('…') || k.key.length <= 14)).toBe(true);
  });

  it('meta endpoints are allowed even for a narrowly-scoped key', () => {
    registerKeyScopes('sk_live_narrow', ['identity:read']);
    expect(checkEndpointScope('sk_live_narrow', { path: '/v1/idempotency', method: 'GET', creditCost: 0 }).allowed).toBe(true);
  });
});
