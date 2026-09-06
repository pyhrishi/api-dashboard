import {
  getCorsPolicy, updateCorsPolicy, addAllowedOrigin, removeAllowedOrigin,
  evaluateCors, isValidOrigin, getCorsStats, __resetCors,
} from '@/lib/gateway/cors';

beforeEach(() => __resetCors());

describe('isValidOrigin', () => {
  it('accepts scheme://host[:port] and rejects paths/garbage', () => {
    expect(isValidOrigin('https://app.acme.com')).toBe(true);
    expect(isValidOrigin('http://localhost:3000')).toBe(true);
    expect(isValidOrigin('https://acme.com/app')).toBe(false); // path
    expect(isValidOrigin('acme.com')).toBe(false); // no scheme
    expect(isValidOrigin('ftp://acme.com')).toBe(false);
    expect(isValidOrigin('')).toBe(false);
  });
});

describe('policy editing', () => {
  it('adds and removes origins with validation and de-dup', () => {
    expect(addAllowedOrigin('https://new.acme.com').success).toBe(true);
    expect(getCorsPolicy().allowedOrigins).toContain('https://new.acme.com');
    // adding again is idempotent
    addAllowedOrigin('https://new.acme.com');
    expect(getCorsPolicy().allowedOrigins.filter((o) => o === 'https://new.acme.com')).toHaveLength(1);
    const bad = addAllowedOrigin('not-an-origin');
    expect(bad.success).toBe(false);
    removeAllowedOrigin('https://new.acme.com');
    expect(getCorsPolicy().allowedOrigins).not.toContain('https://new.acme.com');
  });

  it('validates mode and max-age on update', () => {
    // @ts-expect-error — deliberately bad mode
    expect(updateCorsPolicy({ mode: 'open' }).success).toBe(false);
    expect(updateCorsPolicy({ maxAgeSeconds: 999999 }).success).toBe(false);
    expect(updateCorsPolicy({ mode: 'wildcard', maxAgeSeconds: 600 }).success).toBe(true);
    expect(getCorsPolicy().mode).toBe('wildcard');
  });
});

describe('evaluateCors', () => {
  it('allows a same-origin (no Origin) request with no CORS headers', () => {
    const e = evaluateCors(null);
    expect(e.allowed).toBe(true);
    expect(e.headers).toEqual({});
  });

  it('reflects an allowlisted origin and sets credentials + Vary', () => {
    const e = evaluateCors('http://localhost:3000', 'GET');
    expect(e.allowed).toBe(true);
    expect(e.headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect(e.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(e.headers['Vary']).toBe('Origin');
    expect(e.headers['Access-Control-Max-Age']).toBe('86400');
  });

  it('blocks an origin not on the allowlist (no ACAO header)', () => {
    const e = evaluateCors('https://evil.example.com', 'GET');
    expect(e.allowed).toBe(false);
    expect(e.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('reflects the origin (not *) in wildcard mode when credentials are on', () => {
    updateCorsPolicy({ mode: 'wildcard', allowCredentials: true });
    const e = evaluateCors('https://anything.com', 'GET');
    expect(e.headers['Access-Control-Allow-Origin']).toBe('https://anything.com');
  });

  it('uses * in wildcard mode without credentials', () => {
    updateCorsPolicy({ mode: 'wildcard', allowCredentials: false });
    const e = evaluateCors('https://anything.com', 'GET');
    expect(e.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(e.headers['Vary']).toBeUndefined();
  });

  it('returns no headers when disabled', () => {
    updateCorsPolicy({ mode: 'disabled' });
    const e = evaluateCors('http://localhost:3000', 'GET');
    expect(e.allowed).toBe(false);
    expect(e.headers).toEqual({});
  });

  it('flags a disallowed method on an allowed origin', () => {
    updateCorsPolicy({ allowedMethods: ['GET'] });
    const e = evaluateCors('http://localhost:3000', 'DELETE');
    expect(e.allowed).toBe(false); // method not allowed
    expect(e.headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000'); // origin still reflected
  });

  it('reports coherent stats', () => {
    const s = getCorsStats();
    expect(s.origin_count).toBe(getCorsPolicy().allowedOrigins.length);
    expect(s.mode).toBe('allowlist');
  });
});
