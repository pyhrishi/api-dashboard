import { buildDebugEcho, redactHeaders, type DebugEchoContext } from '@/lib/gateway/debugEcho';

const base: DebugEchoContext = {
  method: 'GET',
  path: '/v1/people/phone',
  params: { email: 'ceo@example.com' },
  headers: { Authorization: 'Bearer sk_live_abcdef123456', 'x-api-key': 'sk_live_abcdef123456', 'user-agent': 'curl/8' },
  bodyPresent: false,
  apiKey: 'sk_live_abcdef123456',
  region: 'us-east-1',
  node: 'us-east-1-a',
  countryCode: 'US',
  privacyFramework: 'CCPA',
  endpointId: 'email-to-phone',
  endpointName: 'Find Phone by Email',
  endpointMatched: true,
  baseCreditCost: 2,
  wouldCharge: 2,
  rateLimit: { limit: 100, remaining: 87 },
};

describe('redactHeaders', () => {
  it('masks Authorization to the key prefix and hides other secrets', () => {
    const r = redactHeaders({ Authorization: 'Bearer sk_live_abcdef123456', 'x-api-key': 'sk_test_zzzz9999', cookie: 'a=b', 'user-agent': 'curl' });
    expect(r.Authorization).toBe('Bearer sk_live_••••');
    expect(r['x-api-key']).toBe('sk_test_••••');
    expect(r.cookie).toBe('••••');
    expect(r['user-agent']).toBe('curl'); // non-sensitive passes through
  });
});

describe('buildDebugEcho', () => {
  it('echoes the received request with redacted headers and never leaks the key', () => {
    const e = buildDebugEcho(base);
    expect(e.received.method).toBe('GET');
    expect(e.received.params).toEqual({ email: 'ceo@example.com' });
    expect(JSON.stringify(e)).not.toContain('abcdef123456');
    expect(e.note).toMatch(/not executed/i);
  });

  it('reports masking applied for a live key under a framework', () => {
    const e = buildDebugEcho(base);
    expect(e.interpreted.environment).toBe('live');
    expect(e.interpreted.privacy.masking_applies).toBe(true);
    expect(e.policies.find((p) => p.name === 'PII masking')?.status).toBe('applied');
  });

  it('reports sandbox keys return unmasked data (no masking)', () => {
    const e = buildDebugEcho({ ...base, apiKey: 'sk_test_demo', headers: { Authorization: 'Bearer sk_test_demo' } });
    expect(e.interpreted.environment).toBe('sandbox');
    expect(e.interpreted.privacy.masking_applies).toBe(false);
    expect(e.policies.find((p) => p.name === 'PII masking')?.status).toBe('skipped');
  });

  it('flags an unmatched route and skips billing', () => {
    const e = buildDebugEcho({ ...base, endpointMatched: false, endpointId: undefined, endpointName: undefined });
    expect(e.interpreted.endpoint).toBeNull();
    expect(e.policies.find((p) => p.name === 'Routing')?.status).toBe('blocked');
    expect(e.billing.note).toMatch(/no endpoint matched/i);
  });

  it('surfaces the would-be charge without executing', () => {
    const e = buildDebugEcho(base);
    expect(e.billing.would_charge).toBe(2);
    expect(e.billing.note).toMatch(/dry run|no credits/i);
  });
});
