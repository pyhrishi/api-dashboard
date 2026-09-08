/**
 * API keys hashed at rest (F-321) — SSOT + gateway attestation tests.
 * The pure SHA-256 is cross-checked against Node crypto; every registry is proven
 * to be keyed by digest; the console fingerprint equals the gateway's.
 */
import { createHash } from 'crypto';
import {
  sha256Hex, hashApiKey, keyFingerprint, fingerprintFromHash, redactKey, keyPrefix, isWellFormedApiKey,
  constantTimeEqual, isSha256Hex, toKeyAtRest, KEY_HASHING_POSTURE,
} from '@/lib/key-hashing';
import { fingerprint as revealFingerprint, maskedWithFingerprint } from '@/lib/secret-reveal';
import { orgHandleForKey } from '@/lib/encryption';
import { auditKeyStorage, describeKeyAtRest, verifyHash, attachKeyFingerprintHeader, __resetKeyHashing } from '@/lib/gateway/keyHashing';
import { getApiKeyRecord } from '@/lib/gateway/billing';
import { registerKeyScopes, getKeyScopes, getScopeRegistrySnapshot, unregisterKeyScopes, __resetScopes } from '@/lib/gateway/scopes';
import { blockKey, isKeyBlocked, getBlock, unblockKey, getKillSwitchSnapshot, __resetKeyBlock } from '@/lib/gateway/keyBlock';
import { checkRateLimit } from '@/lib/gateway/rateLimiter';
import { checkIdempotency, storeIdempotency } from '@/lib/gateway/idempotency';

const node = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const KEY = 'sk_live_f321_hashed_at_rest_0001';

describe('SSOT — SHA-256 + key identity', () => {
  it('pure SHA-256 matches Node crypto across padding boundaries and unicode', () => {
    ['', 'abc', 'sk_test_123', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'x'.repeat(1000), 'Zoë 🚀 Ünïcödé €']
      .forEach((s) => expect(sha256Hex(s)).toBe(node(s)));
  });

  it('reproduces the billing seed digest for sk_test_123', () => {
    expect(hashApiKey('sk_test_123')).toBe('7ba88f380e2bd2b3a94f74a0f3cdb2b502fdf251f829ad44cd009de9f632ed96');
  });

  it('fingerprint is sha256: + 16 hex, derived from the digest, never the plaintext', () => {
    const fp = keyFingerprint(KEY);
    expect(fp).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(fp).toBe(fingerprintFromHash(hashApiKey(KEY)));
    expect(fp).not.toContain('0001');
    expect(keyFingerprint(KEY)).toBe(fp);
    expect(keyFingerprint(`${KEY}x`)).not.toBe(fp);
  });

  it('redaction, prefix, well-formedness', () => {
    expect(redactKey(KEY)).toBe('sk_live_••••0001');
    expect(redactKey('')).toBe('');
    expect(keyPrefix('sk_test_abc')).toBe('sk_test_');
    expect(keyPrefix('eyJhbGci')).toBe('other');
    expect(isWellFormedApiKey(KEY)).toBe(true);
    expect(isWellFormedApiKey('sk_live_short')).toBe(false);
    expect(isWellFormedApiKey('sk_test_abcdefghijkl')).toBe(false); // 12 chars — below the 16 floor
    expect(isWellFormedApiKey('pk_live_abcdefghijklmnop')).toBe(false);
  });

  it('constant-time equality + digest detection', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
    expect(isSha256Hex(hashApiKey(KEY))).toBe(true);
    expect(isSha256Hex('sk_live_x')).toBe(false);
  });

  it('toKeyAtRest carries no plaintext field and the posture is the reviewer’s checklist', () => {
    const at = toKeyAtRest(KEY);
    expect(Object.keys(at).sort()).toEqual(['algorithm', 'fingerprint', 'hash', 'last4', 'prefix']);
    expect(JSON.stringify(at)).not.toContain(KEY);
    expect(at.last4).toBe('0001');
    expect(KEY_HASHING_POSTURE.algorithm).toBe('SHA-256');
    expect(KEY_HASHING_POSTURE.storedBits).toBe(256);
    expect(KEY_HASHING_POSTURE.constantTimeCompare).toBe(true);
  });
});

describe('one identity everywhere', () => {
  it('the F-115 reveal fingerprint is the first 8 hex of the same digest', () => {
    expect(revealFingerprint(KEY)).toBe(hashApiKey(KEY).slice(0, 8));
    expect(revealFingerprint(KEY)).toMatch(/^[0-9a-f]{8}$/);
    expect(revealFingerprint('')).toBe('00000000');
    expect(maskedWithFingerprint(KEY)).toContain(`fp_${hashApiKey(KEY).slice(0, 8)}`);
  });

  it('the org handle is digest-derived, not a plaintext suffix', () => {
    expect(orgHandleForKey(KEY)).toBe(`org_${hashApiKey(KEY).slice(0, 8)}`);
    expect(orgHandleForKey(KEY)).not.toContain('0001');
  });
});

describe('gateway registries are keyed by digest', () => {
  beforeEach(() => { __resetScopes(); __resetKeyBlock(); __resetKeyHashing(); });

  it('billing still resolves the seeded key by digest and lazily provisions by digest', () => {
    expect(getApiKeyRecord('sk_test_123')?.plan).toBe('prepaid');
    const rec = getApiKeyRecord(KEY);
    expect(rec?.hash).toBe(hashApiKey(KEY));
  });

  it('scopes: register/get/unregister by plaintext API, stored by digest, displayed masked', () => {
    registerKeyScopes(KEY, ['identity:read']);
    expect(getKeyScopes(KEY)).toEqual(['identity:read']);
    const snap = getScopeRegistrySnapshot();
    const mine = snap.keys.find((k) => k.scopes.includes('identity:read') && k.key.endsWith('0001'));
    expect(mine).toBeDefined();
    expect(mine!.key).toContain('…');
    expect(JSON.stringify(snap)).not.toContain(KEY);
    unregisterKeyScopes(KEY);
    expect(getKeyScopes(KEY)).toEqual(['*']);
  });

  it('kill switch: block/check/restore by plaintext API, stored by digest, snapshot masked', () => {
    blockKey(KEY, 'leaked', 'security@zintlr.com');
    expect(isKeyBlocked(KEY)).toBe(true);
    expect(getBlock(KEY)?.reason).toBe('leaked');
    const snap = getKillSwitchSnapshot();
    expect(JSON.stringify(snap)).not.toContain(KEY);
    expect(snap.keys.some((k) => k.key.endsWith('0001'))).toBe(true);
    unblockKey(KEY);
    expect(isKeyBlocked(KEY)).toBe(false);
    // the seeded compromised key still works through the same API
    expect(getBlock('sk_test_compromised')?.reason).toBe('compromised');
  });

  it('rate limiter and idempotency work unchanged through the plaintext API', () => {
    expect(checkRateLimit(KEY).success).toBe(true);
    const fp = 'deadbeef';
    expect(checkIdempotency(KEY, 'idem-1', fp).status).toBe('miss');
    storeIdempotency(KEY, 'idem-1', { payload: { ok: true }, status: 200, fingerprint: fp, path: '/v1/x', creditCost: 1 });
    expect(checkIdempotency(KEY, 'idem-1', fp).status).toBe('replay');
  });

  it('the audit reports every registry keyed by sha256 with zero plaintext copies', () => {
    const audit = auditKeyStorage(1_760_000_000_000);
    expect(audit.totalRegistries).toBeGreaterThanOrEqual(8);
    expect(audit.hashedRegistries).toBe(audit.totalRegistries);
    expect(audit.plaintextCopies).toBe(0);
    expect(audit.clean).toBe(true);
    expect(audit.registries.map((r) => r.id).sort()).toEqual(
      ['billing', 'fraud-tracker', 'idempotency', 'ip-allowlist', 'kill-switch', 'partner-attribution', 'rate-limiter', 'scopes'],
    );
    expect(audit.registries.find((r) => r.id === 'rate-limiter')!.runtime).toBe('edge');
  });

  it('describeKeyAtRest returns only digest-derived facts and lists the registries referencing it', () => {
    getApiKeyRecord(KEY);
    registerKeyScopes(KEY, ['identity:read']);
    checkRateLimit(KEY);
    const d = describeKeyAtRest(KEY);
    expect(d.hash).toBe(hashApiKey(KEY));
    expect(d.fingerprint).toBe(keyFingerprint(KEY));
    expect(JSON.stringify(d)).not.toContain(KEY);
    const ids = d.referencedBy.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['billing', 'scopes', 'rate-limiter']));
    expect(ids).not.toContain('kill-switch');
    expect(describeKeyAtRest(KEY).lookups).toBe(2);
  });

  it('verifyHash accepts a digest or fingerprint, rejects plaintext, compares constant-time', () => {
    const h = hashApiKey(KEY);
    expect(verifyHash(KEY, h)).toMatchObject({ valid: true, match: true });
    expect(verifyHash(KEY, h.toUpperCase())).toMatchObject({ valid: true, match: true });
    expect(verifyHash(KEY, keyFingerprint(KEY))).toMatchObject({ valid: true, match: true });
    expect(verifyHash(KEY, hashApiKey('sk_live_other_key_000000'))).toMatchObject({ valid: true, match: false });
    expect(verifyHash(KEY, KEY)).toMatchObject({ valid: false, reason: 'malformed' });
    expect(verifyHash(KEY, '')).toMatchObject({ valid: false });
  });

  it('X-Key-Fingerprint header equals the console fingerprint; absent without a key', () => {
    const h: Record<string, string> = {};
    attachKeyFingerprintHeader(h, KEY);
    expect(h['X-Key-Fingerprint']).toBe(keyFingerprint(KEY));
    const none: Record<string, string> = {};
    attachKeyFingerprintHeader(none, undefined);
    expect(none['X-Key-Fingerprint']).toBeUndefined();
  });
});
