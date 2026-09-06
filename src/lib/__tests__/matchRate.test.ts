import { explainMatch, aggregateMatchRate, classifyLookup, type MatchLog } from '@/lib/insight-engine';

const mk = (over: Partial<MatchLog>): MatchLog => ({
  path: '/v1/people', method: 'GET', status: 200,
  response: { success: true, data: { full_name: 'Jane Doe', email: 'jane@acme.com' } },
  request: { parameters: { email: 'jane@acme.com' } },
  timestamp: '2026-09-06T00:00:00Z', environment: 'sandbox',
  ...over,
});

describe('match-rate transparency — classifyLookup', () => {
  it('treats people/company/ip endpoints as coverage lookups', () => {
    expect(classifyLookup('/v1/people', { email: 'a@b.com' }).kind).toBe('lookup');
    expect(classifyLookup('/v1/companies/enrich', { domain: 'b.com' }).identifier).toBe('domain');
    expect(classifyLookup('/v1/enrichment/ip', { ip: '8.8.8.8' }).identifier).toBe('ip');
  });

  it('treats title-normalize / email-verify / domain-auth as transforms, not coverage', () => {
    expect(classifyLookup('/v1/titles/normalize', { title: 'VP Eng' }).kind).toBe('transform');
    expect(classifyLookup('/v1/email/verify', { email: 'a@b.com' }).kind).toBe('transform');
    expect(classifyLookup('/v1/email/domain-auth', { domain: 'b.com' }).kind).toBe('transform');
  });

  it('classifies non-lookup paths as other', () => {
    expect(classifyLookup('/v1/docs', {}).kind).toBe('other');
  });
});

describe('match-rate transparency — explainMatch', () => {
  it('marks a 200 with resolved data as matched and counting', () => {
    const ex = explainMatch(mk({}));
    expect(ex.verdict).toBe('matched');
    expect(ex.counts).toBe(true);
    expect(ex.label).toMatch(/matched on email/i);
  });

  it('marks a 200 with an empty payload as a miss (still counts)', () => {
    const ex = explainMatch(mk({ response: { success: true, data: {} } }));
    expect(ex.verdict).toBe('missed');
    expect(ex.counts).toBe(true);
    expect(ex.recovery).toBeTruthy();
  });

  it('marks a 404 as an outside-coverage miss with a recovery path', () => {
    const ex = explainMatch(mk({ status: 404, response: { success: false, error: { code: 'NOT_FOUND' } } }));
    expect(ex.verdict).toBe('missed');
    expect(ex.label).toBe('Outside coverage');
    expect(ex.recovery).toBeTruthy();
    expect(ex.counts).toBe(true);
  });

  it('excludes input errors, auth, rate limits, and server errors from the denominator', () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const ex = explainMatch(mk({ status, response: { error: { code: 'X' } } }));
      expect(ex.verdict).toBe('error');
      expect(ex.counts).toBe(false);
    }
  });

  it('excludes transforms from match rate even on success', () => {
    const ex = explainMatch(mk({ path: '/v1/email/verify', request: { parameters: { email: 'a@b.com' } }, response: { success: true, data: { verdict: 'deliverable' } } }));
    expect(ex.verdict).toBe('excluded');
    expect(ex.counts).toBe(false);
  });
});

describe('match-rate transparency — aggregateMatchRate', () => {
  const logs: MatchLog[] = [
    mk({}), // matched (email)
    mk({ path: '/v1/companies/enrich', request: { parameters: { domain: 'acme.com' } }, response: { success: true, data: { name: 'Acme' } } }), // matched (domain)
    mk({ status: 404, response: { success: false, error: { code: 'NOT_FOUND' } } }), // missed (email)
    mk({ status: 400, response: { error: { code: 'INVALID' } } }), // error (excluded from denom)
    mk({ path: '/v1/email/verify', request: { parameters: { email: 'a@b.com' } }, response: { success: true, data: { verdict: 'risky' } } }), // transform (excluded)
    mk({ path: '/v1/docs', request: { parameters: {} }, status: 200, response: { ok: true } }), // other (excluded)
  ];

  it('computes an honest match rate over matched + missed only', () => {
    const s = aggregateMatchRate(logs);
    expect(s.matched).toBe(2);
    expect(s.missed).toBe(1);
    expect(s.attempted).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.excluded).toBe(2); // transform + docs
    expect(s.matchRate).toBeCloseTo(2 / 3, 3);
    expect(s.total).toBe(logs.length);
  });

  it('breaks down by endpoint and identifier, and lists miss reasons', () => {
    const s = aggregateMatchRate(logs);
    expect(s.byEndpoint.length).toBeGreaterThan(0);
    expect(s.byIdentifier.some((b) => b.key === 'email')).toBe(true);
    expect(s.byIdentifier.some((b) => b.key === 'domain')).toBe(true);
    expect(s.missReasons.reduce((n, r) => n + r.count, 0)).toBe(s.missed);
    expect(s.missReasons[0].share).toBeGreaterThan(0);
  });

  it('is deterministic — same logs yield identical summaries', () => {
    expect(aggregateMatchRate(logs)).toEqual(aggregateMatchRate(logs));
  });

  it('handles an empty log set without dividing by zero', () => {
    const s = aggregateMatchRate([]);
    expect(s.attempted).toBe(0);
    expect(s.matchRate).toBe(0);
    expect(s.byEndpoint).toHaveLength(0);
  });
});
