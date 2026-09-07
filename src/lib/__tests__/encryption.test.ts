/**
 * Encryption posture (F-312) — unit tests for the SSOT + gateway meta module.
 * Deterministic: same inputs → same fingerprints, attestation, and score.
 */
import {
  fnv, fingerprint, TLS_POSTURE, deriveKeys, deriveStores, deriveFields,
  attest, buildPosture, daysUntilRotation, PII_FIELDS,
} from '@/lib/encryption';
import {
  getEncryptionPosture, runRotationDrill, attachEncryptionHeaders, __resetEncryption,
} from '@/lib/gateway/encryption';

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
