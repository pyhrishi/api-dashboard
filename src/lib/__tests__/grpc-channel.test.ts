/**
 * F-077 gRPC high-throughput channel — schema + transcoder tests.
 * Deterministic, no network.
 */
import {
  renderProto, METHODS, MESSAGES, GRPC_SERVICE, GRPC_PACKAGE, inputKeyFor, isStreaming,
} from '@/lib/grpc/schema';
import {
  invoke, invokeBatch, benchmark, syntheticLatencyMs,
} from '@/lib/grpc/transcoder';

describe('schema + .proto', () => {
  it('renders valid proto3 with package, service, and stream keywords', () => {
    const proto = renderProto();
    expect(proto).toContain('syntax = "proto3";');
    expect(proto).toContain(`package ${GRPC_PACKAGE};`);
    expect(proto).toContain(`service ${GRPC_SERVICE} {`);
    expect(proto).toContain('rpc EnrichCompany (EnrichCompanyRequest) returns (Company);');
    // Bidi streaming method renders stream on both sides.
    expect(proto).toContain('rpc BatchEnrichCompanies (stream EnrichCompanyRequest) returns (stream Company);');
    // A repeated field renders.
    expect(proto).toMatch(/repeated string (sources|tech_stack)/);
  });

  it('every method references defined request/response messages', () => {
    Object.values(METHODS).forEach((m) => {
      expect(MESSAGES[m.requestType]).toBeDefined();
      expect(MESSAGES[m.responseType]).toBeDefined();
    });
  });

  it('inputKeyFor + isStreaming classify methods', () => {
    expect(inputKeyFor(METHODS.EnrichCompany)).toBe('domain');
    expect(inputKeyFor(METHODS.EnrichPerson)).toBe('email');
    expect(inputKeyFor(METHODS.CompanyByIp)).toBe('ip');
    expect(isStreaming(METHODS.BatchEnrichCompanies)).toBe(true);
    expect(isStreaming(METHODS.EnrichCompany)).toBe(false);
  });
});

describe('invoke (unary)', () => {
  it('resolves a company and projects to the Company message fields', () => {
    const r = invoke('EnrichCompany', { domain: 'stripe.com' });
    expect(r.matched).toBe(true);
    expect(r.cost).toBe(1);
    expect(r.response!.domain).toBe('stripe.com');
    // Only declared Company fields are present (no leakage like provenance/sources arrays not in msg).
    const allowed = new Set(MESSAGES.Company.fields.map((f) => f.name));
    Object.keys(r.response!).forEach((k) => expect(allowed.has(k)).toBe(true));
  });

  it('resolves a person and agrees with the REST resolver shape', () => {
    const r = invoke('EnrichPerson', { email: 'jane.doe@acme.com' });
    expect(r.matched).toBe(true);
    expect(r.cost).toBe(2);
    expect(typeof r.response!.full_name).toBe('string');
  });

  it('errors on unknown method and missing field', () => {
    expect(invoke('Nope', { domain: 'x.com' }).error).toMatch(/unknown method/i);
    expect(invoke('EnrichCompany', {}).error).toMatch(/missing required field/i);
  });

  it('a miss is not an error and costs nothing', () => {
    const r = invoke('EnrichPerson', { email: 'nobody@' });
    expect(r.error).toBeNull();
    expect(r.matched).toBe(false);
    expect(r.cost).toBe(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(invoke('EnrichCompany', { domain: 'figma.com' })))
      .toBe(JSON.stringify(invoke('EnrichCompany', { domain: 'figma.com' })));
  });
});

describe('invokeBatch (streaming)', () => {
  it('streams a batch, counting matched/missed and summing cost', () => {
    const { result } = invokeBatch('BatchEnrichCompanies', [
      { domain: 'stripe.com' }, { domain: 'datadoghq.com' }, { domain: '' },
    ]);
    expect(result!.matched).toBe(2);
    expect(result!.missed).toBe(1);
    expect(result!.cost).toBe(2); // 2 matched × 1 credit
    expect(result!.records.length).toBe(3);
  });
});

describe('benchmark', () => {
  it('runs N deterministic messages and reports percentiles + multiplexing', () => {
    const { result } = benchmark('BatchEnrichCompanies', 1000);
    expect(result!.count).toBe(1000);
    expect(result!.matched).toBe(1000); // synthetic domains all resolve
    expect(result!.cost).toBe(1000);
    expect(result!.p50).toBeGreaterThan(0);
    expect(result!.p95).toBeGreaterThanOrEqual(result!.p50);
    expect(result!.p99).toBeGreaterThanOrEqual(result!.p95);
    expect(result!.multiplexedStreams).toBeGreaterThan(1);
    expect(result!.serialMs).toBeGreaterThan(0);
  });

  it('clamps count into a safe range and is deterministic', () => {
    expect(benchmark('EnrichPerson', 0).result!.count).toBe(1);
    expect(benchmark('EnrichPerson', 999999).result!.count).toBe(5000);
    expect(JSON.stringify(benchmark('EnrichCompany', 200))).toBe(JSON.stringify(benchmark('EnrichCompany', 200)));
  });

  it('synthetic latency is stable per input', () => {
    expect(syntheticLatencyMs('acme-1.com')).toBe(syntheticLatencyMs('acme-1.com'));
  });
});
