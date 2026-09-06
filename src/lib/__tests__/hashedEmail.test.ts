import { sha256Hex, isSha256Hex } from '@/lib/sha256';
import { resolveByEmailHash, hashEmail, normalizeEmailForHash, hashedDatasetSize } from '@/lib/hashed-email-resolver';
import { toEnrichmentResult } from '@/data/enrichments';

describe('sha256', () => {
  it('matches known NIST vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('validates hex digests', () => {
    expect(isSha256Hex(sha256Hex('x'))).toBe(true);
    expect(isSha256Hex('nothex')).toBe(false);
    expect(isSha256Hex('abc')).toBe(false);
  });
});

describe('hashed-email lookups', () => {
  it('normalizes before hashing (trim + lowercase)', () => {
    expect(hashEmail('  Jane.Doe@ACME.com ')).toBe(hashEmail('jane.doe@acme.com'));
    expect(normalizeEmailForHash(' A@B.COM ')).toBe('a@b.com');
  });

  it('resolves a known identity from its hash without plaintext', () => {
    const hash = hashEmail('jane.doe@acme.com');
    const res = resolveByEmailHash(hash);
    expect(res).not.toBeNull();
    expect(res!.matched).toBe(true);
    expect(res!.plaintext_received).toBe(false);
    expect(res!.email_sha256).toBe(hash);
    expect(res!.person?.email).toBe('jane.doe@acme.com');
  });

  it('is deterministic', () => {
    const hash = hashEmail('marcus@stripe.com');
    expect(resolveByEmailHash(hash)).toEqual(resolveByEmailHash(hash));
  });

  it('returns a clean no-match for a hash outside the dataset', () => {
    const res = resolveByEmailHash(sha256Hex('nobody-unmatched-xyz@nowhere.example'));
    expect(res).not.toBeNull();
    expect(res!.matched).toBe(false);
    expect(res!.person).toBeUndefined();
    expect(res!.reason).toBeTruthy();
  });

  it('returns null for a syntactically invalid hash', () => {
    expect(resolveByEmailHash('not-a-hash')).toBeNull();
    expect(resolveByEmailHash('')).toBeNull();
    expect(resolveByEmailHash('abc123')).toBeNull();
  });

  it('accepts a sha256: prefixed hash', () => {
    const hash = hashEmail('john@datadoghq.com');
    expect(resolveByEmailHash(`sha256:${hash}`)?.matched).toBe(true);
  });

  it('has a non-trivial opted-in index', () => {
    expect(hashedDatasetSize()).toBeGreaterThan(50);
  });

  it('flows a match through the Studio dispatch into a person view-model', () => {
    const res = resolveByEmailHash(hashEmail('sarah.chen@notion.so'))!;
    const vm = toEnrichmentResult({ success: true, ...res });
    expect(vm).not.toBeNull();
    expect(vm!.kind).toBe('person');
    expect(vm!.badges).toEqual(expect.arrayContaining([expect.stringMatching(/SHA-256/i)]));
  });
});
