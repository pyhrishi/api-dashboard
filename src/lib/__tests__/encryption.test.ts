/**
 * Encryption posture (F-312) — unit tests for the SSOT + gateway meta module.
 * Deterministic: same inputs → same fingerprints, attestation, and score.
 */
import {
  fnv, fingerprint, TLS_POSTURE, deriveKeys, deriveStores, deriveFields,
  attest, buildPosture, daysUntilRotation, PII_FIELDS,
  orgHandleForKey, hstsHeaderValue, isFieldRelaxable, normalizeSettingsPatch, useEncryptionSettings,
} from '@/lib/encryption';
import {
  getEncryptionPosture, runRotationDrill, attachEncryptionHeaders, __resetEncryption,
  updateEncryptionSettings, signAttestation, verifyAttestation, ATTESTATION_KID, ENCRYPTION_EXPOSED_HEADERS,
} from '@/lib/gateway/encryption';
import { attachISO27001Headers } from '@/lib/gateway/security';
import { hashApiKey } from '@/lib/key-hashing';
import { EXPOSED_RESPONSE_HEADERS } from '@/lib/gateway/cors';

const NOW = 1_760_000_000_000; // fixed reference "now"

describe('encryption SSOT — determinism', () => {
  it('fnv is stable and unsigned', () => {
    expect(fnv('abc')).toBe(fnv('abc'));
    expect(fnv('abc')).toBeGreaterThanOrEqual(0);
    expect(fnv('abc')).not.toBe(fnv('abd'));
  });

  it('fingerprint is deterministic, right length, colon-grouped', () => {
    const fp = fingerprint('seed', 16);
    expect(fp).toBe(fingerprint('seed', 16));
    expect(fp.replace(/:/g, '')).toHaveLength(16);
    expect(fp).toMatch(/^([0-9a-f]{2}:)+[0-9a-f]{2}$/);
  });

  it('transit posture is TLS 1.3 with PFS + HSTS', () => {
    expect(TLS_POSTURE.version).toBe('TLS 1.3');
    expect(TLS_POSTURE.forwardSecrecy).toBe(true);
    expect(TLS_POSTURE.hsts).toBe(true);
  });
});

describe('key + store + field derivation', () => {
  it('derives one KMS key per purpose, all AES-256-GCM', () => {
    const keys = deriveKeys('org_x', 90, null, NOW);
    expect(keys).toHaveLength(4);
    expect(keys.every((k) => k.algorithm === 'AES-256-GCM')).toBe(true);
    expect(keys.map((k) => k.purpose).sort()).toEqual(['backups', 'data', 'exports', 'pii']);
  });

  it('primary data key honors lastRotatedAt + cadence', () => {
    const rotated = NOW - 10 * 86_400_000;
    const keys = deriveKeys('org_x', 90, rotated, NOW);
    const data = keys.find((k) => k.purpose === 'data')!;
    expect(data.rotatedAt).toBe(rotated);
    expect(data.nextRotationAt).toBe(rotated + 90 * 86_400_000);
  });

  it('every store is encrypted and wrapped by a known key', () => {
    const keys = deriveKeys('org_x', 90, null, NOW);
    const stores = deriveStores(keys);
    const ids = new Set(keys.map((k) => k.id));
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.every((s) => s.encrypted)).toBe(true);
    expect(stores.every((s) => ids.has(s.kmsKeyId))).toBe(true);
  });

  it('field overrides only flip provided fields; default on', () => {
    const fields = deriveFields({ email: false });
    expect(fields.find((f) => f.field === 'email')!.enabled).toBe(false);
    expect(fields.find((f) => f.field === 'phone')!.enabled).toBe(true);
    expect(fields).toHaveLength(PII_FIELDS.length);
  });
});

describe('score + attestation', () => {
  it('a full modern posture scores high', () => {
    const p = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW);
    expect(p.score).toBeGreaterThanOrEqual(90);
    expect(p.score).toBeLessThanOrEqual(100);
  });

  it('overdue rotation lowers the score', () => {
    const stale = NOW - 400 * 86_400_000; // long overdue at 90d cadence
    const overdue = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: stale, fieldEncryption: {} }, NOW);
    const fresh = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW);
    expect(overdue.score).toBeLessThan(fresh.score);
  });

  it('disabling PII fields lowers the score', () => {
    const off = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: { email: false, phone: false, company_domain: false } }, NOW);
    const on = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW);
    expect(off.score).toBeLessThan(on.score);
  });

  it('attestation is deterministic and prefixed', () => {
    const a = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW);
    const b = buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW);
    expect(a.attestation).toBe(b.attestation);
    expect(a.attestation).toMatch(/^att_[0-9a-f]+$/);
  });

  it('attestation does not depend on rotation timestamp (only material facts)', () => {
    const a = attest(buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW, fieldEncryption: {} }, NOW));
    const b = attest(buildPosture('org_x', { rotationDays: 90, lastRotatedAt: NOW - 5 * 86_400_000, fieldEncryption: {} }, NOW));
    expect(a).toBe(b);
  });

  it('daysUntilRotation is negative when overdue', () => {
    const keys = deriveKeys('org_x', 90, NOW - 200 * 86_400_000, NOW);
    const data = keys.find((k) => k.purpose === 'data')!;
    expect(daysUntilRotation(data, NOW)).toBeLessThan(0);
  });
});

describe('gateway meta module', () => {
  beforeEach(() => __resetEncryption());

  it('attaches both encryption headers; live adds field-level PII', () => {
    const live: Record<string, string> = {};
    attachEncryptionHeaders(live, 'live');
    expect(live['X-Encryption-Transit']).toContain('TLS1.3');
    expect(live['X-Encryption-Rest']).toContain('pii=field-level');

    const test: Record<string, string> = {};
    attachEncryptionHeaders(test, 'test');
    expect(test['X-Encryption-Rest']).not.toContain('pii=field-level');
  });

  it('posture is coherent and carries a next-rotation headline', () => {
    const snap = getEncryptionPosture('sk_live_abcdef12', NOW);
    expect(snap.keys.length).toBe(4);
    expect(snap.stores.every((s) => s.encrypted)).toBe(true);
    expect(snap.nextRotation).not.toBeNull();
    expect(snap.attestation).toMatch(/^att_/);
  });

  it('rotation moves lastRotatedAt forward and increments the counter', () => {
    const before = getEncryptionPosture('sk_live_abcdef12', NOW);
    const beforeData = before.keys.find((k) => k.purpose === 'data')!;
    const r = runRotationDrill('sk_live_abcdef12', NOW + 86_400_000);
    expect(r.rotated).toBe(true);
    expect(r.rotationsTotal).toBe(1);
    const after = getEncryptionPosture('sk_live_abcdef12', NOW + 86_400_000);
    const afterData = after.keys.find((k) => k.purpose === 'data')!;
    expect(afterData.rotatedAt).toBeGreaterThan(beforeData.rotatedAt);
  });
});

describe('console ↔ gateway coherence (hardening pass)', () => {
  beforeEach(() => __resetEncryption());

  it('orgHandleForKey is the one handle both sides use', () => {
    // Derived from the key's SHA-256 digest (F-321) — never a plaintext fragment.
    expect(orgHandleForKey('sk_live_abcdef12')).toBe(`org_${hashApiKey('sk_live_abcdef12').slice(0, 8)}`);
    expect(orgHandleForKey('sk_live_abcdef12')).not.toContain('abcdef12');
    expect(orgHandleForKey(undefined)).toBe('org_demo');
    expect(orgHandleForKey('')).toBe('org_demo');
    expect(getEncryptionPosture('sk_live_abcdef12', NOW).orgId).toBe(orgHandleForKey('sk_live_abcdef12'));
  });

  it('randomized PII fields are a floor in the SSOT, not just the UI', () => {
    expect(isFieldRelaxable('email')).toBe(true);
    expect(isFieldRelaxable('full_name')).toBe(false);
    expect(isFieldRelaxable('nope')).toBe(false);
    const fields = deriveFields({ full_name: false, email: false });
    expect(fields.find((f) => f.field === 'full_name')!.enabled).toBe(true);
    expect(fields.find((f) => f.field === 'email')!.enabled).toBe(false);
    useEncryptionSettings.getState().setFieldEncryption('full_name', false);
    expect(useEncryptionSettings.getState().fieldEncryption.full_name).toBeUndefined();
    useEncryptionSettings.getState().reset();
  });

  it('normalizeSettingsPatch drops anything invalid instead of throwing', () => {
    expect(normalizeSettingsPatch(null)).toEqual({});
    expect(normalizeSettingsPatch('x')).toEqual({});
    expect(normalizeSettingsPatch({ rotationDays: 45 })).toEqual({});
    expect(normalizeSettingsPatch({ rotationDays: 30, fieldEncryption: { email: false, full_name: false, bogus: true, phone: 'no' } }))
      .toEqual({ rotationDays: 30, fieldEncryption: { email: false } });
  });

  it('PATCH sync makes the gateway posture match the console posture', () => {
    const key = 'sk_live_sync0001';
    const settings = { rotationDays: 30, lastRotatedAt: null, fieldEncryption: { email: false, phone: false } };
    const console_ = buildPosture(orgHandleForKey(key), settings, NOW);
    const before = getEncryptionPosture(key, NOW);
    expect(before.attestation).not.toBe(console_.attestation);
    const r = updateEncryptionSettings(key, { rotationDays: 30, fieldEncryption: { email: false, phone: false } });
    expect(r.rotationDays).toBe(30);
    const after = getEncryptionPosture(key, NOW);
    expect(after.attestation).toBe(console_.attestation);
    expect(after.score).toBe(console_.score);
  });

  it('attestation is HMAC-signed and verifiable; tampering fails', () => {
    const snap = getEncryptionPosture('sk_live_abcdef12', NOW);
    expect(snap.signature.alg).toBe('HMAC-SHA256');
    expect(snap.signature.kid).toBe(ATTESTATION_KID);
    expect(snap.signature.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signAttestation(snap.orgId, snap.attestation, NOW).sig).toBe(snap.signature.sig);
    expect(verifyAttestation('sk_live_abcdef12', snap.attestation, snap.signature.sig).valid).toBe(true);
    expect(verifyAttestation('sk_live_abcdef12', snap.attestation, snap.signature.sig.toUpperCase()).valid).toBe(true);
    expect(verifyAttestation('sk_live_abcdef12', snap.attestation, '0'.repeat(64)).valid).toBe(false);
    expect(verifyAttestation('sk_live_otherorg', snap.attestation, snap.signature.sig).valid).toBe(false);
  });

  it('HSTS on the wire is derived from the posture SSOT', () => {
    const h: Record<string, string> = {};
    attachISO27001Headers(h);
    expect(h['Strict-Transport-Security']).toBe(hstsHeaderValue());
    expect(h['Strict-Transport-Security']).toContain(`max-age=${TLS_POSTURE.hstsMaxAgeDays * 86_400}`);
  });

  it('the encryption headers are CORS-exposed and name the key exchange', () => {
    ENCRYPTION_EXPOSED_HEADERS.forEach((name) => expect(EXPOSED_RESPONSE_HEADERS).toContain(name));
    const h: Record<string, string> = {};
    attachEncryptionHeaders(h, 'live');
    expect(h['X-Encryption-Transit']).toContain(`kx=${TLS_POSTURE.keyExchange}`);
  });
});
