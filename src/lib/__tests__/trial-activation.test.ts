/**
 * Trial activation SSOT (Phase 1, M2) — unit tests. Deterministic risk + OTP.
 */
import {
  ROLES, USE_CASES, OTP_LADDER, otpCode, preferredCategory, TRIAL_CREDITS, useTrialActivation,
} from '@/lib/trial-activation';

beforeEach(() => useTrialActivation.getState().reset());

describe('profile capture', () => {
  it('marks PM roles for the auto-key path', () => {
    useTrialActivation.getState().setProfile('pm', 'lead_enrichment');
    expect(useTrialActivation.getState().isPM).toBe(true);
    expect(useTrialActivation.getState().profileComplete).toBe(true);
    useTrialActivation.getState().reset();
    useTrialActivation.getState().setProfile('developer', 'lead_enrichment');
    expect(useTrialActivation.getState().isPM).toBe(false);
  });
  it('use-case maps to a catalogue category', () => {
    expect(preferredCategory('identity_resolution')).toBe('identity');
    expect(preferredCategory('crm_hygiene')).toBe('company');
    expect(preferredCategory(null)).toBe('people');
  });
  it('exposes roles + use-cases', () => {
    expect(ROLES.some((r) => r.isPM)).toBe(true);
    expect(USE_CASES.length).toBeGreaterThanOrEqual(4);
  });
});

describe('availTrial risk gate', () => {
  it('low-risk email is granted instantly', () => {
    const d = useTrialActivation.getState().availTrial('jane@acme.com');
    // deterministic; a clean corporate email should not be flagged
    expect(d.decision).toBe('grant');
    expect(useTrialActivation.getState().trialStatus).toBe('granted');
    expect(useTrialActivation.getState().trialCredits).toBe(TRIAL_CREDITS);
  });
  it('a disposable-email signal forces the OTP path', () => {
    const d = useTrialActivation.getState().availTrial('x@temp.io', { disposableEmail: true, priorSignups: 2 });
    expect(d.decision).toBe('otp');
    expect(useTrialActivation.getState().trialStatus).toBe('pending_otp');
    expect(useTrialActivation.getState().otpChannel).toBe('sms');
    expect(useTrialActivation.getState().trialCredits).toBe(0);
  });
});

describe('OTP', () => {
  it('otpCode is deterministic 6 digits', () => {
    const c = otpCode('x@temp.io');
    expect(c).toBe(otpCode('x@temp.io'));
    expect(c).toMatch(/^\d{6}$/);
  });
  it('verifyOtp grants on the right code, rejects otherwise', () => {
    useTrialActivation.getState().availTrial('x@temp.io', { disposableEmail: true });
    expect(useTrialActivation.getState().verifyOtp('x@temp.io', '000000')).toBe(false);
    expect(useTrialActivation.getState().verifyOtp('x@temp.io', otpCode('x@temp.io'))).toBe(true);
    expect(useTrialActivation.getState().trialStatus).toBe('granted');
  });
  it('skipOtp grants credits (spec allows skip)', () => {
    useTrialActivation.getState().availTrial('x@temp.io', { disposableEmail: true });
    useTrialActivation.getState().skipOtp();
    expect(useTrialActivation.getState().trialStatus).toBe('granted');
    expect(useTrialActivation.getState().trialCredits).toBe(TRIAL_CREDITS);
  });
  it('escalateOtp walks the SMS→WhatsApp→call ladder and stops at call', () => {
    useTrialActivation.getState().availTrial('x@temp.io', { disposableEmail: true });
    expect(useTrialActivation.getState().otpChannel).toBe(OTP_LADDER[0]);
    useTrialActivation.getState().escalateOtp();
    expect(useTrialActivation.getState().otpChannel).toBe('whatsapp');
    useTrialActivation.getState().escalateOtp();
    expect(useTrialActivation.getState().otpChannel).toBe('call');
    useTrialActivation.getState().escalateOtp();
    expect(useTrialActivation.getState().otpChannel).toBe('call'); // clamps
  });
});
