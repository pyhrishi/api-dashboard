/**
 * Visitor consent (Phase 0, M1.4c). GDPR/DPDP-style gating for the landing's
 * marketing instrumentation + de-anonymization. US traffic is opt-out (allowed until
 * rejected); EU/India visitors can reject non-essential tracking, which suppresses
 * the marketing pop-ups and de-anon identification. Essential product analytics are
 * unaffected. Per-browser via localStorage; safe to read anywhere (never throws).
 */

export type ConsentState = 'pending' | 'granted' | 'rejected';

const KEY = 'zinbit-consent';

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'rejected' ? v : 'pending';
  } catch {
    return 'pending';
  }
}

export function setConsent(state: ConsentState): void {
  try { localStorage.setItem(KEY, state); } catch { /* storage blocked */ }
}

/** Whether non-essential (marketing/de-anon) tracking is allowed. Opt-out model. */
export function marketingAllowed(): boolean {
  return getConsent() !== 'rejected';
}
