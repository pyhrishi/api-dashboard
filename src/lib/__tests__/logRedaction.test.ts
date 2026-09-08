/**
 * PII redaction in internal logs (F-322) — SSOT engine + gateway tests.
 * The canary proves every detector; tokens are deterministic per org; secrets become
 * the F-321 fingerprint; the gateway's only path to stdout is the redacted one.
 */
import {
  LOG_PII_CATALOG, defaultLogPolicy, normalizeLogPolicy, normalizeLogRedactionPatch, isLogStrategyAllowed,
  redactLogRecord, redactString, selfTest, correlationToken, renderRedaction, logPolicyStrength, strengthLabel,
  classifyLogKey, luhnValid, canEditLogRedaction, normalizeKeyList, CANARY_RECORD, LOG_REDACTION_POSTURE, useLogRedactionPolicy,
  type LogRedactionPolicy,
} from '@/lib/log-redaction';
import { keyFingerprint } from '@/lib/key-hashing';
import { orgHandleForKey } from '@/lib/encryption';
import { API_BASE_URL } from '@/lib/api-config';
import {
  writeLine, getLogRedactionReport, updateLogRedactionPolicy, dryRunRedaction, attachLogRedactionHeader, orgForKey,
  TAIL_CAPACITY, __resetLogRedaction,
} from '@/lib/gateway/logRedaction';
import { Logger, logRequest } from '@/lib/gateway/logger';
import { checkIsPii, sanitizeLogData } from '@/lib/redaction-engine';

const KEY = 'sk_live_f322_internal_logs_0001';
const ORG = 'org_test';
const P: LogRedactionPolicy = defaultLogPolicy();

describe('catalog + policy', () => {
  it('ships 10 detectors with floors; secrets/IDs/cards/DOB are fixed at drop', () => {
    expect(LOG_PII_CATALOG).toHaveLength(10);
    ['secret', 'credit_card', 'government_id', 'date_of_birth'].forEach((t) => {
      expect(isLogStrategyAllowed(t as never, 'drop')).toBe(true);
      expect(isLogStrategyAllowed(t as never, 'token')).toBe(false);
      expect(isLogStrategyAllowed(t as never, 'partial')).toBe(false);
    });
    expect(isLogStrategyAllowed('email', 'partial')).toBe(true);
    expect(isLogStrategyAllowed('email', 'drop')).toBe(true);
  });

  it('normalizes patches: below-floor and unknown parts are dropped, never applied; no off switch', () => {
    const patch = normalizeLogRedactionPatch({ strategies: { government_id: 'partial', email: 'drop', bogus: 'drop' }, enabled: false, retentionDays: 12, customKeys: ['Internal_Note', 'bad key!', 'x-vendor-id'], allowKeys: ['company', 'password'] });
    expect(patch.strategies).toEqual({ email: 'drop' });
    expect(patch.retentionDays).toBeUndefined();
    expect(patch.customKeys).toEqual(['internal_note', 'x-vendor-id']);
    expect(patch.allowKeys).toEqual(['company']); // 'password' is secret-shaped — can't be allowlisted
    const pol = normalizeLogPolicy({ strategies: { government_id: 'partial' as never }, retentionDays: 90 });
    expect(pol.strategies.government_id).toBe('drop');
    expect(pol.retentionDays).toBe(90);
    expect('enabled' in pol).toBe(false);
  });

  it('strength: default is Balanced, all-drop is Strict, all-floors is Permissive', () => {
    const s = logPolicyStrength(P);
    expect(strengthLabel(s)).toBe('Balanced');
    const strict = normalizeLogPolicy({ strategies: { email: 'drop', phone: 'drop', ip_address: 'drop', full_name: 'drop', street_address: 'drop', linkedin_url: 'drop' } });
    expect(logPolicyStrength(strict)).toBe(100);
    const loose = normalizeLogPolicy({ strategies: { email: 'partial', phone: 'partial', ip_address: 'partial', full_name: 'partial', street_address: 'partial', linkedin_url: 'partial' } });
    expect(strengthLabel(logPolicyStrength(loose))).toBe('Permissive');
    expect(canEditLogRedaction('admin')).toBe(true);
    expect(canEditLogRedaction('developer')).toBe(false);
    expect(normalizeKeyList(Array.from({ length: 50 }, (_, i) => `k${i}`))).toHaveLength(32);
  });
});

describe('engine — canary + detectors', () => {
  it('the canary self-test passes: every detector fires and no raw value survives', () => {
    const st = selfTest(P, ORG);
    expect(st.passed).toBe(true);
    expect(st.leaks).toBe(0);
    st.checks.forEach((c) => { expect(c.redacted).toBeGreaterThan(0); expect(c.survived).toBe(false); });
    const out = JSON.stringify(redactLogRecord(CANARY_RECORD, P, ORG).redacted);
    expect(out).not.toContain('jordan.rivera');
    expect(out).not.toContain('canary0000');
    expect(out).not.toContain('4111');
    expect(out).not.toContain('123-45-6789');
    expect(out).not.toContain('ABCDE1234F');
    expect(out).not.toContain('2345 6789 0123');
    expect(out).not.toContain('98765');
    expect(out).toContain('req_canary_0001'); // request ids are never redacted
    expect(out).toContain('"durationMs":142');
  });

  it('key-based vs value-based: an email inside a URL is found; a secret header becomes the F-321 fingerprint', () => {
    const r = redactLogRecord({ url: `${API_BASE_URL}/v1/people/phone?email=ceo@example.com`, headers: { authorization: `Bearer ${KEY}` } }, P, ORG);
    const url = r.findings.find((f) => f.path === 'url');
    expect(url).toMatchObject({ type: 'email', detector: 'value', strategy: 'token' });
    expect((r.redacted as { url: string }).url).toMatch(/\?email=\[email:tk_[0-9a-f]{12}\]$/);
    const auth = r.findings.find((f) => f.path === 'headers.authorization');
    expect(auth).toMatchObject({ type: 'secret', detector: 'key', strategy: 'drop' });
    expect(auth?.after).toBe(`[secret:${keyFingerprint(KEY)}]`);
    expect(JSON.stringify(r.redacted)).not.toContain(KEY);
  });

  it('correlation tokens are deterministic, normalized, and differ per org', () => {
    expect(correlationToken('CEO@Example.com ', 'email', ORG)).toBe(correlationToken('ceo@example.com', 'email', ORG));
    expect(correlationToken('+1 (415) 555-0142', 'phone', ORG)).toBe(correlationToken('14155550142', 'phone', ORG));
    expect(correlationToken('ceo@example.com', 'email', ORG)).not.toBe(correlationToken('ceo@example.com', 'email', 'org_other'));
    expect(renderRedaction('ceo@example.com', 'email', 'token', ORG)).toBe(`[email:${correlationToken('ceo@example.com', 'email', ORG)}]`);
    expect(renderRedaction('ceo@example.com', 'email', 'partial', ORG)).toBe('[email:c•••o@example.com]');
    expect(renderRedaction('ceo@example.com', 'email', 'drop', ORG)).toBe('[email:redacted]');
  });

  it('phones: E.164 + formatted + Indian formats are caught; dates, timestamps and durations are not', () => {
    const hit = (s: string) => redactString(s, P, ORG).findings.map((f) => f.type);
    expect(hit('call +14155550142 now')).toEqual(['phone']);
    expect(hit('call (415) 555-0142')).toEqual(['phone']);
    expect(hit('call +91 98450 12345')).toEqual(['phone']);
    expect(hit('2026-09-07 19:27:02 finished in 142ms')).toEqual([]);
    expect(hit('07-09-2026 report')).toEqual([]);
    expect(hit('ts=1725700000000 id=req_1725700000000_abc')).toEqual([]);
  });

  it('cards need an issuer prefix + Luhn; IDs cover SSN, Aadhaar, PAN; IPs are not phones', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
    const hit = (s: string) => redactString(s, P, ORG).findings.map((f) => f.type);
    expect(hit('paid with 4111 1111 1111 1111')).toEqual(['credit_card']);
    expect(hit('paid with 5500 0000 0000 0004')).toEqual(['credit_card']);
    expect(hit('order 1725700000000123')).toEqual([]); // 16 digits, no issuer prefix
    expect(hit('ssn 123-45-6789')).toEqual(['government_id']);
    expect(hit('aadhaar 2345 6789 0123')).toEqual(['government_id']);
    expect(hit('pan ABCDE1234F')).toEqual(['government_id']);
    expect(hit('from 198.51.100.24')).toEqual(['ip_address']);
    expect(hit('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toEqual(['secret']);
  });

  it('allowKeys exempt key-based classification only; customKeys become secrets; numbers under PII keys are redacted', () => {
    const pol = normalizeLogPolicy({ allowKeys: ['name'], customKeys: ['internal_note'] });
    expect(classifyLogKey('name', pol)).toBeNull();
    expect(classifyLogKey('name', P)).toBe('full_name');
    expect(classifyLogKey('internal_note', pol)).toBe('secret');
    expect(classifyLogKey('x-api-key', P)).toBe('secret');
    expect(classifyLogKey('card_number', P)).toBe('credit_card');
    const r = redactLogRecord({ name: 'Acme Corp <ops@acme.com>', internal_note: 'ticket 42', phone: 14155550142, duration: 142 }, pol, ORG);
    const out = r.redacted as Record<string, unknown>;
    expect(out.name).toBe(`Acme Corp <[email:${correlationToken('ops@acme.com', 'email', ORG)}]>`); // value scan still runs
    expect(String(out.internal_note)).toMatch(/^\[secret:sha256:[0-9a-f]{16}\]$/);
    expect(out.phone).toMatch(/^\[phone:tk_/);
    expect(out.duration).toBe(142);
    expect(r.counts.email).toBe(1);
    expect(r.total).toBe(3);
  });

  it('is pure: the input is never mutated and arrays keep their shape/paths', () => {
    const input = { contacts: [{ email: 'a@b.co' }, { email: 'c@d.co' }] };
    const snapshot = JSON.stringify(input);
    const r = redactLogRecord(input, P, ORG);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(r.findings.map((f) => f.path)).toEqual(['contacts[0].email', 'contacts[1].email']);
    expect(LOG_REDACTION_POSTURE.masterSwitch).toBe(false);
  });
});

describe('gateway — the only path to stdout', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => { __resetLogRedaction(); logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('writeLine redacts before serializing, attributes by apiKey (fingerprinted), and records tail + metrics', () => {
    const entry = writeLine('INFO', 'API Request Initiated', { requestId: 'req_1', apiKey: KEY, url: `${API_BASE_URL}/v1/people/phone?email=ceo@example.com`, ip: '198.51.100.24' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const written = String(logSpy.mock.calls[0][0]);
    expect(written).not.toContain(KEY);
    expect(written).not.toContain('ceo@example.com');
    expect(written).toContain('req_1');
    expect(written).toContain(keyFingerprint(KEY));
    expect(entry.findings).toBe(3);
    expect(entry.types.sort()).toEqual(['email', 'ip_address', 'secret']);
    expect(entry.line).toBe(written);
    const report = getLogRedactionReport(KEY);
    expect(report.org).toBe(orgHandleForKey(KEY));
    expect(orgForKey(KEY)).toBe(report.org);
    expect(report.metrics.lines).toBe(1);
    expect(report.metrics.findings).toBe(3);
    expect(report.metrics.byType.email).toBe(1);
    expect(report.tail[0].requestId).toBe('req_1');
    expect(report.selfTest.passed).toBe(true);
    // Same email → same token as the console computes with the same org salt.
    expect(written).toContain(correlationToken('ceo@example.com', 'email', report.org));
  });

  it('the tail is capped and newest-first', () => {
    for (let i = 0; i < TAIL_CAPACITY + 5; i++) writeLine('INFO', `line ${i}`, { requestId: `req_${i}` }, KEY);
    const report = getLogRedactionReport(KEY);
    expect(report.tail).toHaveLength(TAIL_CAPACITY);
    expect(report.tail[0].requestId).toBe(`req_${TAIL_CAPACITY + 4}`);
    expect(report.metrics.lines).toBe(TAIL_CAPACITY + 5);
  });

  it('policy sync is floor-clamped, reports what it ignored, and changes what gets written', () => {
    const r = updateLogRedactionPolicy(KEY, { strategies: { email: 'partial', government_id: 'partial' }, enabled: false, retentionDays: 7 });
    expect(r.policy.strategies.email).toBe('partial');
    expect(r.policy.strategies.government_id).toBe('drop');
    expect(r.policy.retentionDays).toBe(7);
    expect(r.ignored).toEqual(expect.arrayContaining(['strategies.government_id', 'enabled (redaction cannot be disabled)']));
    const entry = writeLine('WARN', 'x', { email: 'ceo@example.com' }, KEY);
    expect(entry.line).toContain('[email:c•••o@example.com]');
    // A different org is untouched.
    expect(getLogRedactionReport('sk_live_other_org_000000000').policy.strategies.email).toBe('token');
  });

  it('dry run redacts with the org policy and writes/counts nothing', () => {
    const dry = dryRunRedaction(KEY, { note: 'mail ceo@example.com' });
    expect(dry.total).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(getLogRedactionReport(KEY).metrics.lines).toBe(0);
    const headers: Record<string, string> = {};
    attachLogRedactionHeader(headers, dry.total);
    expect(headers['X-Log-Redaction']).toBe('1');
  });

  it('Logger + logRequest are facades over writeLine; redactPII still sanitizes ad hoc', () => {
    const l = logRequest('req_9', 'GET', '/v1/people/phone', 200, 12, KEY);
    expect(l.message).toBe('[GET] /v1/people/phone - 200 (12ms)');
    expect(getLogRedactionReport(KEY).tail[0].id).toBe(l.id);
    const w = Logger.warn('Fraud Detected: geo velocity', { requestId: 'req_10', apiKey: KEY });
    expect(w.level).toBe('WARN');
    expect(w.line).toContain(keyFingerprint(KEY));
  });
});

describe('persisted policy store — RBAC + floors enforced in the store', () => {
  it('non-admins cannot mutate; admins can, within floors', () => {
    const s = useLogRedactionPolicy.getState();
    s.setStrategy('developer', 'email', 'drop');
    expect(useLogRedactionPolicy.getState().strategies.email).toBe('token');
    expect(s.addCustomKey('billing', 'internal_note')).toBe(false);
    s.setRetention('developer', 90);
    expect(useLogRedactionPolicy.getState().retentionDays).toBe(30);
    s.setStrategy('admin', 'email', 'drop');
    s.setStrategy('admin', 'government_id', 'partial'); // below floor — ignored
    expect(useLogRedactionPolicy.getState().strategies.email).toBe('drop');
    expect(useLogRedactionPolicy.getState().strategies.government_id).toBe('drop');
    expect(s.addCustomKey('admin', 'Internal_Note')).toBe(true);
    expect(s.addAllowKey('admin', 'password')).toBe(false); // secret-shaped
    expect(s.addAllowKey('admin', 'company')).toBe(true);
    s.setRetention('admin', 90);
    expect(useLogRedactionPolicy.getState().retentionDays).toBe(90);
    s.resetPolicy('developer');
    expect(useLogRedactionPolicy.getState().customKeys).toEqual(['internal_note']);
    s.resetPolicy('admin');
    expect(useLogRedactionPolicy.getState().policy()).toEqual(defaultLogPolicy());
  });
});

describe('console redaction-engine delegates to the SSOT detectors', () => {
  it('classifies whole values, not fragments, with the legacy type names', () => {
    expect(checkIsPii('ceo@example.com')).toBe('email');
    expect(checkIsPii('+1 415 555 0142')).toBe('phone');
    expect(checkIsPii('4111 1111 1111 1111')).toBe('creditCard');
    expect(checkIsPii('123-45-6789')).toBe('ssn');
    expect(checkIsPii('mail me at ceo@example.com')).toBeNull();
    expect(checkIsPii('Acme Corp')).toBeNull();
    const out = sanitizeLogData({ email: 'ceo@example.com', authorization: 'Bearer x', company: 'Acme' }, { autoRedactPII: true, customKeys: ['authorization'] });
    expect(out).toEqual({ email: '[REDACTED: c***@example.com]', authorization: '[REDACTED BY KEY]', company: 'Acme' });
  });
});
