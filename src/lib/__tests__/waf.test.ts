import {
  WAF_RULES, inspectString, inspectRequest, ruleCountsBySeverity, SEVERITY_RANK,
  type WafSeverity,
} from '@/lib/waf-rules';
import { inspectPayload } from '@/lib/gateway/waf';

// A Headers stand-in for the gateway inspector (jsdom has Headers, but keep it explicit).
const hdrs = (obj: Record<string, string> = {}): Headers => {
  const map = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get: (k: string) => map.get(k.toLowerCase()) ?? null,
    forEach: (fn: (v: string, k: string) => void) => map.forEach((v, k) => fn(v, k)),
  } as unknown as Headers;
};

describe('WAF catalog integrity', () => {
  it('has unique ids and valid severities, ordered CRITICAL → LOW', () => {
    const ids = WAF_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const valid: WafSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    WAF_RULES.forEach((r) => expect(valid).toContain(r.severity));
    for (let i = 1; i < WAF_RULES.length; i++) {
      expect(SEVERITY_RANK[WAF_RULES[i - 1].severity]).toBeGreaterThanOrEqual(SEVERITY_RANK[WAF_RULES[i].severity]);
    }
  });

  it('every rule blocks its own attackExample and allows its safeExample', () => {
    WAF_RULES.forEach((r) => {
      const attack = inspectString(r.attackExample);
      expect(attack.blocked).toBe(true);
      const safe = inspectString(r.safeExample);
      expect(safe.blocked).toBe(false);
    });
  });

  it('ruleCountsBySeverity sums to the catalog size', () => {
    const counts = ruleCountsBySeverity();
    const total = counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW;
    expect(total).toBe(WAF_RULES.length);
  });
});

describe('inspectString — detection', () => {
  it('flags SQL injection as CRITICAL with the right reason', () => {
    const v = inspectString("'; DROP TABLE users; --");
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe('WAF_SQLI_DETECTED');
    expect(v.severity).toBe('CRITICAL');
  });

  it('flags XSS', () => {
    expect(inspectString('<script>alert(1)</script>').reason).toBe('WAF_XSS_DETECTED');
    expect(inspectString('x onerror=alert(1)').blocked).toBe(true);
  });

  it('flags command injection and path traversal', () => {
    expect(inspectString('email=x; cat /etc/passwd').reason).toBe('WAF_CMDI_DETECTED');
    expect(inspectString('file=../../../../etc/passwd').blocked).toBe(true);
  });

  it('lets normal enrichment input through', () => {
    expect(inspectString('email=ceo@acme.example.com').blocked).toBe(false);
    expect(inspectString('company=Acme Corp, Inc.').blocked).toBe(false);
    expect(inspectString('name=Renée Zellweger').blocked).toBe(false);
  });

  it('is deterministic — same input, same verdict', () => {
    const a = inspectString("' OR 1=1");
    const b = inspectString("' OR 1=1");
    expect(a).toEqual(b);
  });
});

describe('gateway inspectPayload — mirrors the catalog + safe harbor', () => {
  it('blocks a malicious query with the catalog reason + severity', () => {
    const raw = inspectPayload("/api/v1/people/phone?email='; DROP TABLE users; --", hdrs());
    expect(raw.blocked).toBe(true);
    expect(raw.reason).toBe('WAF_SQLI_DETECTED');
    expect(raw.threatLevel).toBe('CRITICAL');
  });

  it('catches a percent-encoded SQLi in the URL (evasion defence)', () => {
    // DROP%20TABLE would slip past raw matching — the WAF decodes first.
    const encoded = "/api/v1/people/phone?email=%27%3B%20DROP%20TABLE%20users%3B%20--";
    const res = inspectPayload(encoded, hdrs());
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe('WAF_SQLI_DETECTED');
  });

  it('catches a form-encoded (+ as space) SQLi in the URL (evasion defence)', () => {
    // Query strings encode a space as `+`; decodeURIComponent leaves it, so DROP+TABLE
    // would slip past DROP\s+TABLE. The WAF normalizes `+`→space first.
    const formEncoded = "/api/v1/people/phone?email=';+DROP+TABLE+users;+--";
    const res = inspectPayload(formEncoded, hdrs());
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe('WAF_SQLI_DETECTED');
  });

  it('labels a form-encoded command injection as CMDI, not path traversal', () => {
    const res = inspectPayload('/api/v1/people/phone?email=x;+cat+/etc/passwd', hdrs());
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe('WAF_CMDI_DETECTED');
  });

  it('honours the bug-bounty safe-harbor bypass', () => {
    const res = inspectPayload("/x?q='; DROP TABLE t; --", hdrs({ 'x-bug-bounty-token': 'bb_test_safespace' }));
    expect(res.blocked).toBe(false);
  });

  it('passes a clean request', () => {
    expect(inspectPayload('/api/v1/people/phone?email=ok@acme.example.com', hdrs()).blocked).toBe(false);
  });
});

describe('inspectRequest — composed inspection', () => {
  it('inspects the body too', () => {
    expect(inspectRequest('/x', {}, { note: '<script>steal()</script>' }).blocked).toBe(true);
  });
  it('does not throw on an unserializable body', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => inspectRequest('/x', {}, circular)).not.toThrow();
  });
});
