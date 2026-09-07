/**
 * Payload size & depth limits (F-314) — SSOT + gateway module tests.
 * Deterministic: fixed `now`, no network; the analyzer's verdict == the edge's.
 */
import {
  utf8ByteLength, measureJson, measurePayload, resolveLimits, normalizeOverrides, evaluatePayload,
  chunkPlan, tierThatFits, payloadLimitHeaders, formatBytes, utilisation,
  TIER_PAYLOAD_LIMITS, DIMENSIONS, SAMPLE_PAYLOADS, ENDPOINT_PROFILES, usePayloadLimits, overridesForOrg,
  resolveLimitsForPath, profileForPath,
} from '@/lib/payload-limits';
import { MAX_STREAM_INPUTS } from '@/lib/gateway/streamEnrich';
import {
  guardPayload, dryRunPayload, getPayloadLimitsSnapshot, updatePayloadOverrides, limitsForKey, attachPayloadLimitHeaders, __resetPayloadLimits,
} from '@/lib/gateway/payloadLimits';
import { EXPOSED_RESPONSE_HEADERS } from '@/lib/gateway/cors';

const NOW = 1_760_000_000_000;
const STARTER = TIER_PAYLOAD_LIMITS.Starter;
const TEST_KEY = 'sk_test_payload_0001'; // sandbox → Starter

describe('measurement', () => {
  it('utf8ByteLength counts bytes, not chars', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('🚀')).toBe(4);
    expect(utf8ByteLength('Zoë 🚀')).toBe(4 + 1 + 4);
  });

  it('measureJson reports depth, longest array, total keys, longest string', () => {
    const m = measureJson({ a: [1, 2, 3], b: { c: { d: 'hello' } }, e: 'hi' });
    expect(m.depth).toBe(3);          // root obj(1) → b(2) → c(3)
    expect(m.maxArrayLength).toBe(3);
    expect(m.keys).toBe(5);           // a,b,e,c,d
    expect(m.maxStringLength).toBe(5);
    expect(measureJson('scalar').depth).toBe(0);
    expect(measureJson(null).depth).toBe(0);
  });

  it('measureJson is stack-safe on a 100k-deep nest and honours stopAtDepth', () => {
    let v: unknown = 1;
    for (let i = 0; i < 100_000; i++) v = [v];
    expect(measureJson(v).depth).toBe(100_000);
    expect(measureJson(v, 50).depth).toBe(51); // bails right after crossing the stop line
  });

  it('measurePayload handles empty + invalid JSON on bytes only', () => {
    const empty = measurePayload('');
    expect(empty.empty).toBe(true);
    expect(empty.bytes).toBe(0);
    const bad = measurePayload('{not json', '/v1/x?a=1');
    expect(bad.validJson).toBe(false);
    expect(bad.bytes).toBe(9);
    expect(bad.depth).toBe(0);
    expect(bad.urlLength).toBe('/v1/x?a=1'.length);
  });
});

describe('limits + overrides', () => {
  it('tiers are monotonic and Starter is the tightest', () => {
    DIMENSIONS.forEach((d) => {
      expect(TIER_PAYLOAD_LIMITS.Starter[d.limitKey]).toBeLessThanOrEqual(TIER_PAYLOAD_LIMITS.Growth[d.limitKey]);
      expect(TIER_PAYLOAD_LIMITS.Growth[d.limitKey]).toBeLessThanOrEqual(TIER_PAYLOAD_LIMITS.Enterprise[d.limitKey]);
    });
  });

  it('resolveLimits can only tighten, and never below the smallest preset', () => {
    const l = resolveLimits('Starter', { maxBodyBytes: 10 * 1024 * 1024, maxDepth: 1, maxArrayLength: 250 });
    expect(l.maxBodyBytes).toBe(STARTER.maxBodyBytes); // clamped to ceiling
    expect(l.maxDepth).toBe(8);                        // floor = smallest preset
    expect(l.maxArrayLength).toBe(250);
    expect(l.maxKeys).toBe(STARTER.maxKeys);           // untouched
  });

  it('normalizeOverrides keeps numeric known keys, null clears, junk dropped', () => {
    const r = normalizeOverrides({ maxBodyBytes: 131072, maxDepth: null, maxKeys: 'lots', bogus: 1, maxArrayLength: -5 });
    expect(r.set).toEqual({ maxBodyBytes: 131072 });
    expect(r.clear).toEqual(['maxDepth']);
    expect(normalizeOverrides(null)).toEqual({ set: {}, clear: [] });
  });

  it('tierThatFits finds the next plan that would accept the value', () => {
    expect(tierThatFits('Starter', 'arrayLength', 1200)).toBe('Growth');
    expect(tierThatFits('Starter', 'depth', 40)).toBeNull();
    expect(tierThatFits('Enterprise', 'bytes', 5 * 1024 * 1024)).toBeNull();
  });

  it('the persisted cache is org-keyed: adopt, set, clear, reset', () => {
    const st = () => usePayloadLimits.getState();
    st().adopt('org_a', { maxDepth: 12 });
    st().setLimit('org_a', 'maxArrayLength', 250);
    st().setLimit('org_b', 'maxArrayLength', 100);
    expect(overridesForOrg(st(), 'org_a')).toEqual({ maxDepth: 12, maxArrayLength: 250 });
    expect(overridesForOrg(st(), 'org_b')).toEqual({ maxArrayLength: 100 });
    expect(overridesForOrg(st(), 'org_c')).toEqual({});
    st().setLimit('org_a', 'maxArrayLength', null);
    expect(overridesForOrg(st(), 'org_a')).toEqual({ maxDepth: 12 });
    st().reset('org_a'); st().reset('org_b');
    expect(overridesForOrg(st(), 'org_a')).toEqual({});
  });

  it('endpoint profiles keep the escape hatches open and match the handlers\' own caps', () => {
    expect(profileForPath('/api/v1/jobs?x=1')!.id).toBe('ingest-jobs');
    expect(profileForPath('/v1/batch/enrich')).toBeNull();
    const jobs = resolveLimitsForPath('Starter', { maxArrayLength: 100 }, '/v1/jobs');
    expect(jobs.limits.maxArrayLength).toBe(10_000);   // profile beats tier + override
    expect(jobs.limits.maxBodyBytes).toBe(4 * 1024 * 1024);
    expect(jobs.limits.maxDepth).toBe(STARTER.maxDepth); // untouched dimensions stay tier-bound
    const stream = resolveLimitsForPath('Enterprise', {}, '/v1/enrich/stream');
    expect(stream.limits.maxArrayLength).toBe(MAX_STREAM_INPUTS);
    expect(ENDPOINT_PROFILES.find((p) => p.id === 'ingest-stream')!.limits.maxArrayLength).toBe(MAX_STREAM_INPUTS);
  });

  it('fast path: an oversized body is not parsed and the depth walk stops early', () => {
    const big = JSON.stringify({ a: 'x'.repeat(1000) });
    const m = measurePayload(big, '', { skipParseAboveBytes: 100 });
    expect(m.validJson).toBe(false);
    expect(m.keys).toBe(0);
    let v: unknown = 1; for (let i = 0; i < 1000; i++) v = [v];
    expect(measurePayload(JSON.stringify(v), '', { stopAtDepth: 16 }).depth).toBe(17);
  });
});

describe('verdicts (what the developer sees)', () => {
  it('a healthy batch passes every tier', () => {
    const m = measurePayload(SAMPLE_PAYLOADS.find((s) => s.id === 'batch-200')!.build());
    expect(evaluatePayload(m, STARTER, 'Starter').ok).toBe(true);
  });

  it('a 1,200-item batch fails arrayLength on Starter with a chunk plan and an upgrade hint', () => {
    const m = measurePayload(SAMPLE_PAYLOADS.find((s) => s.id === 'batch-1200')!.build());
    const v = evaluatePayload(m, STARTER, 'Starter');
    expect(v.ok).toBe(false);
    expect(v.primary!.code).toBe('PAYLOAD_ARRAY_TOO_LONG');
    expect(v.primary!.status).toBe(422);
    expect(v.primary!.fix).toContain('3 requests of ≤400 items');
    expect(v.primary!.fix).toContain('Growth plan raises this limit to 2,000 items');
    expect(chunkPlan(1200, 500)).toEqual({ chunks: 3, perChunk: 400 });
    expect(chunkPlan(400, 500)).toBeNull();
    // ...but passes on Growth.
    expect(evaluatePayload(m, TIER_PAYLOAD_LIMITS.Growth, 'Growth').ok).toBe(true);
  });

  it('a 40-deep nest fails depth on every tier; violations are ordered bytes > depth > …', () => {
    const m = measurePayload(SAMPLE_PAYLOADS.find((s) => s.id === 'deep-40')!.build());
    expect(m.depth).toBe(40);
    expect(evaluatePayload(m, TIER_PAYLOAD_LIMITS.Enterprise, 'Enterprise').primary!.code).toBe('PAYLOAD_TOO_DEEP');
    const big = measurePayload(SAMPLE_PAYLOADS.find((s) => s.id === 'notes-300kb')!.build());
    const v = evaluatePayload(big, STARTER, 'Starter');
    expect(v.violations.map((x) => x.code)).toEqual(['PAYLOAD_TOO_LARGE', 'PAYLOAD_STRING_TOO_LONG']);
    expect(v.primary!.status).toBe(413);
  });

  it('unicode sample weighs more in bytes than chars', () => {
    const raw = SAMPLE_PAYLOADS.find((s) => s.id === 'unicode')!.build();
    expect(utf8ByteLength(raw)).toBeGreaterThan(raw.length);
  });

  it('URL length is judged even on GET', () => {
    const m = measurePayload('', `/v1/people/phone?emails=${'a'.repeat(5000)}`);
    const v = evaluatePayload(m, STARTER, 'Starter');
    expect(v.primary!.code).toBe('URI_TOO_LONG');
    expect(v.primary!.status).toBe(414);
  });

  it('helpers: headers, bytes formatting, utilisation', () => {
    expect(payloadLimitHeaders(STARTER)).toEqual({ 'X-Payload-Limit-Bytes': '262144', 'X-Payload-Limit-Depth': '16' });
    expect(formatBytes(262144)).toBe('256 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(512)).toBe('512 B');
    const m = measurePayload(JSON.stringify({ a: Array.from({ length: 250 }, (_, i) => i) }));
    expect(utilisation(m, STARTER, 'arrayLength')).toBeCloseTo(0.5);
  });
});

describe('gateway enforcement', () => {
  beforeEach(() => __resetPayloadLimits());

  it('sandbox keys resolve to Starter; live keys carry a tier', () => {
    expect(limitsForKey(TEST_KEY, NOW).tier).toBe('Starter');
    expect(['Starter', 'Growth', 'Enterprise']).toContain(limitsForKey('sk_live_someorg_key', NOW).tier);
  });

  it('rejects an over-long array with the SSOT verdict and records it in the ledger', () => {
    const raw = SAMPLE_PAYLOADS.find((s) => s.id === 'batch-1200')!.build();
    const before = getPayloadLimitsSnapshot(TEST_KEY, NOW).stats.total;
    const r = guardPayload(TEST_KEY, 'POST', 'http://localhost/api/v1/batch/enrich', raw, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.code).toBe('PAYLOAD_ARRAY_TOO_LONG');
      expect(r.violation.status).toBe(422);
    }
    const snap = getPayloadLimitsSnapshot(TEST_KEY, NOW);
    expect(snap.stats.total).toBe(before + 1);
    expect(snap.rejections[0]).toMatchObject({ path: '/v1/batch/enrich', dimension: 'arrayLength', code: 'PAYLOAD_ARRAY_TOO_LONG', method: 'POST' });
    expect(snap.stats.last24h).toBeGreaterThanOrEqual(1);
  });

  it('a 1,200-input job is accepted by the guard — the escape hatch is open', () => {
    const raw = JSON.stringify({ inputs: Array.from({ length: 1200 }, (_, i) => ({ email: `p${i}@x.co` })) });
    const r = guardPayload(TEST_KEY, 'POST', 'http://localhost/api/v1/jobs', raw, NOW);
    expect(r.ok).toBe(true);
    expect(r.profile?.id).toBe('ingest-jobs');
    expect(dryRunPayload(TEST_KEY, raw, '/v1/jobs', NOW).wouldReturn.status).toBe(200);
    expect(dryRunPayload(TEST_KEY, raw, '/v1/batch/enrich', NOW).wouldReturn.status).toBe(422);
  });

  it('ignores the body on GET (URL only) and lets a healthy POST through', () => {
    const huge = 'x'.repeat(STARTER.maxBodyBytes + 10);
    expect(guardPayload(TEST_KEY, 'GET', 'http://localhost/api/v1/people/phone?email=a@b.co', huge, NOW).ok).toBe(true);
    expect(guardPayload(TEST_KEY, 'POST', 'http://localhost/api/v1/batch/enrich', SAMPLE_PAYLOADS[0].build(), NOW).ok).toBe(true);
  });

  it('dry run judges without recording', () => {
    const raw = SAMPLE_PAYLOADS.find((s) => s.id === 'deep-40')!.build();
    const before = getPayloadLimitsSnapshot(TEST_KEY, NOW).stats.total;
    const dry = dryRunPayload(TEST_KEY, raw, '/v1/batch/enrich', NOW);
    expect(dry.wouldReturn).toEqual({ status: 422, code: 'PAYLOAD_TOO_DEEP' });
    expect(dry.tier).toBe('Starter');
    expect(getPayloadLimitsSnapshot(TEST_KEY, NOW).stats.total).toBe(before);
    expect(dryRunPayload(TEST_KEY, SAMPLE_PAYLOADS[0].build(), '/v1/batch/enrich', NOW).wouldReturn).toEqual({ status: 200, code: null });
  });

  it('PATCH overrides tighten (clamped to ceiling) and change the verdict', () => {
    const ok = guardPayload(TEST_KEY, 'POST', 'http://localhost/api/v1/batch/enrich', SAMPLE_PAYLOADS[0].build(), NOW);
    expect(ok.ok).toBe(true);
    const snap = updatePayloadOverrides(TEST_KEY, { maxArrayLength: 100, maxBodyBytes: 99_999_999, junk: true }, NOW);
    expect(snap.limits.maxArrayLength).toBe(100);
    expect(snap.limits.maxBodyBytes).toBe(STARTER.maxBodyBytes);
    expect(snap.overrides).toEqual({ maxArrayLength: 100, maxBodyBytes: 99_999_999 });
    const now200 = guardPayload(TEST_KEY, 'POST', 'http://localhost/api/v1/batch/enrich', SAMPLE_PAYLOADS[0].build(), NOW);
    expect(now200.ok).toBe(false);
    const cleared = updatePayloadOverrides(TEST_KEY, { maxArrayLength: null }, NOW);
    expect(cleared.limits.maxArrayLength).toBe(STARTER.maxArrayLength);
  });

  it('ledger is seeded deterministically per org and the headers are CORS-exposed', () => {
    const a = getPayloadLimitsSnapshot('sk_live_orgA_0001', NOW);
    const b = getPayloadLimitsSnapshot('sk_live_orgA_0001', NOW);
    expect(a.rejections).toEqual(b.rejections);
    expect(a.rejections.length).toBeGreaterThanOrEqual(2);
    const h: Record<string, string> = {};
    attachPayloadLimitHeaders(h, STARTER);
    Object.keys(h).forEach((k) => expect(EXPOSED_RESPONSE_HEADERS).toContain(k));
  });
});
