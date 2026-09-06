import {
  fingerprint, secretTail, maskedWithFingerprint, canReveal, fingerprintLabel,
} from '@/lib/secret-reveal';

describe('one-time secret reveal', () => {
  it('fingerprint is deterministic, 8 hex chars, and distinguishes secrets', () => {
    const a = fingerprint('sk_live_abcdef123456');
    expect(fingerprint('sk_live_abcdef123456')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint('sk_live_abcdef123456')).not.toBe(fingerprint('sk_live_abcdef123457'));
    expect(fingerprint('')).toBe('00000000');
  });

  it('secretTail returns the last 4 (or the whole short string)', () => {
    expect(secretTail('sk_live_xxxxxxxxABCD')).toBe('ABCD');
    expect(secretTail('ab')).toBe('ab');
  });

  it('maskedWithFingerprint shows prefix + tail + fingerprint, never the middle', () => {
    const m = maskedWithFingerprint('sk_live_supersecretvalue9Z8Y');
    expect(m.startsWith('sk_live_····')).toBe(true);
    expect(m).toContain('9Z8Y');
    expect(m).toContain('· fp_');
    expect(m).not.toContain('supersecret');
  });

  it('canReveal is true only while the one-time raw token is present', () => {
    expect(canReveal({ key: 'sk_live_x', rawToken: 'sk_live_x' })).toBe(true);
    expect(canReveal({ key: 'sk_live_x' })).toBe(false);
    expect(canReveal({ key: 'sk_live_x', rawToken: '' })).toBe(false);
  });

  it('fingerprintLabel prefixes fp_', () => {
    expect(fingerprintLabel('sk_test_z')).toBe(`fp_${fingerprint('sk_test_z')}`);
  });
});
