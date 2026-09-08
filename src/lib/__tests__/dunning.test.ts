/**
 * Dunning & churn SSOT (Phase 7, M7) — unit tests.
 */
import {
  RETRY_WINDOW_DAYS, REVOKE_WARNING_DAYS, dunningStage, DUNNING_META, needsSalesOutreach,
} from '@/lib/dunning';

describe('dunningStage timeline', () => {
  it('0–48h is grace/retry', () => {
    expect(dunningStage(0)).toBe('grace_retry');
    expect(dunningStage(RETRY_WINDOW_DAYS - 1)).toBe('grace_retry');
  });
  it('48h–4d is revocation warning', () => {
    expect(dunningStage(RETRY_WINDOW_DAYS)).toBe('revocation_warning');
    expect(dunningStage(REVOKE_WARNING_DAYS - 1)).toBe('revocation_warning');
  });
  it('≥4d is revoked', () => {
    expect(dunningStage(REVOKE_WARNING_DAYS)).toBe('revoked');
    expect(dunningStage(10)).toBe('revoked');
  });
  it('every stage has metadata', () => {
    (['grace_retry', 'revocation_warning', 'revoked'] as const).forEach((s) => {
      expect(DUNNING_META[s].label).toBeTruthy();
    });
    expect(DUNNING_META.revoked.tone).toBe('error');
  });
});

describe('needsSalesOutreach', () => {
  it('high-value accounts at warning/revoked get sales outreach', () => {
    expect(needsSalesOutreach('revocation_warning', true)).toBe(true);
    expect(needsSalesOutreach('revoked', true)).toBe(true);
  });
  it('no outreach in grace or for low-value accounts', () => {
    expect(needsSalesOutreach('grace_retry', true)).toBe(false);
    expect(needsSalesOutreach('revocation_warning', false)).toBe(false);
  });
});
