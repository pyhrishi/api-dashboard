/**
 * F-309 MFA enforcement — policy + enrollment tests.
 * Pure helpers with injected `now`; deterministic, no network.
 */
import {
  totpSecret, recoveryCodes, otpauthUri, isEnforced, inGracePeriod,
  memberCompliant, orgCompliance, enrollmentRequired, type MfaEnrollment,
} from '@/lib/mfa';

const T = 1_700_000_000_000;
const enrolled = (email: string): MfaEnrollment => ({ email, enrolled: true, method: 'totp', enrolledAt: T, secret: totpSecret(email), recoveryCodesRemaining: 8 });

describe('secret + recovery generation', () => {
  it('produces a deterministic base32 secret + 8 recovery codes', () => {
    expect(totpSecret('a@x.com')).toBe(totpSecret('a@x.com'));
    expect(totpSecret('a@x.com')).toMatch(/^[A-Z2-7 ]+$/);
    const codes = recoveryCodes('a@x.com');
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(recoveryCodes('a@x.com')).toEqual(codes); // deterministic
    expect(recoveryCodes('b@x.com')).not.toEqual(codes); // per-account
  });
  it('otpauthUri embeds the issuer + secret', () => {
    const uri = otpauthUri('a@x.com');
    expect(uri).toContain('otpauth://totp/Zinbit:');
    expect(uri).toContain('issuer=Zinbit');
    expect(uri).toContain('secret=');
  });
});

describe('policy helpers', () => {
  it('isEnforced + grace period', () => {
    expect(isEnforced('required')).toBe(true);
    expect(isEnforced('optional')).toBe(false);
    expect(inGracePeriod(T + 10_000, T)).toBe(true);
    expect(inGracePeriod(T - 10_000, T)).toBe(false);
    expect(inGracePeriod(null, T)).toBe(false);
  });

  it('memberCompliant honors enrollment + self is2faEnabled', () => {
    const enr = { 'a@x.com': enrolled('a@x.com') };
    expect(memberCompliant('a@x.com', enr)).toBe(true);
    expect(memberCompliant('b@x.com', enr)).toBe(false);
    // self covered via legacy flag
    expect(memberCompliant('b@x.com', enr, { email: 'b@x.com', is2faEnabled: true })).toBe(true);
    expect(memberCompliant('b@x.com', enr, { email: 'b@x.com', is2faEnabled: false })).toBe(false);
  });

  it('orgCompliance counts + percentages', () => {
    const emails = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'];
    const enr = { 'a@x.com': enrolled('a@x.com'), 'b@x.com': enrolled('b@x.com') };
    const c = orgCompliance(emails, enr);
    expect(c.total).toBe(4);
    expect(c.compliant).toBe(2);
    expect(c.nonCompliant).toBe(2);
    expect(c.pct).toBe(50);
    expect(orgCompliance([], enr).pct).toBe(100);
  });
});

describe('enrollmentRequired (the gate)', () => {
  const enr = {};
  it('is false when policy optional', () => {
    expect(enrollmentRequired('optional', { email: 'a@x.com', is2faEnabled: false }, enr, null, T)).toBe(false);
  });
  it('is true when required + not covered + no grace', () => {
    expect(enrollmentRequired('required', { email: 'a@x.com', is2faEnabled: false }, enr, null, T)).toBe(true);
  });
  it('is false during the grace period', () => {
    expect(enrollmentRequired('required', { email: 'a@x.com', is2faEnabled: false }, enr, T + 60_000, T)).toBe(false);
  });
  it('is false when the user is already covered', () => {
    expect(enrollmentRequired('required', { email: 'a@x.com', is2faEnabled: true }, enr, null, T)).toBe(false);
    expect(enrollmentRequired('required', { email: 'a@x.com', is2faEnabled: false }, { 'a@x.com': enrolled('a@x.com') }, null, T)).toBe(false);
  });
  it('is false when there is no signed-in user', () => {
    expect(enrollmentRequired('required', null, enr, null, T)).toBe(false);
  });
});
