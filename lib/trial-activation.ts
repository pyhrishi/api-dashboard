/**
 * Trial activation — SSOT (Phase 1, M2).
 *
 * Drives the account-creation → trial-gate flow (C1-b onboarding → C1-c avail trial
 * → C1-d OTP → C2-a credits). Captures the role + use-case (which sets the PM
 * auto-key path and pre-filters the catalogue), then gates the free-credit grant on
 * a risk evaluation: low-risk gets credits instantly; a flagged signup is asked for
 * a phone OTP (with a skip option), delivered over an SMS → WhatsApp → call ladder.
 *
 * The risk decision uses the provisional `riskScore` stub in `lib/funnel` — clearly
 * marked, swappable when the real "Section B" criteria land. OTP codes are
 * deterministic (no Math.random). Dedicated persisted store, not the tenant store.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { riskScore, fnv, type RiskDecision, type RiskSignals } from '@/lib/funnel';

export const TRIAL_CREDITS = 5000;

export type Role = 'developer' | 'founder' | 'pm' | 'data_engineer' | 'revops' | 'other';
export type UseCase = 'lead_enrichment' | 'crm_hygiene' | 'identity_resolution' | 'compliance' | 'other';
export type TrialStatus = 'none' | 'pending_otp' | 'granted';
export type OtpChannel = 'sms' | 'whatsapp' | 'call';

export const ROLES: { id: Role; label: string; isPM?: boolean }[] = [
  { id: 'developer', label: 'Developer / Engineer' },
  { id: 'pm', label: 'Product Manager', isPM: true },
  { id: 'founder', label: 'Founder / Exec' },
  { id: 'data_engineer', label: 'Data Engineer' },
  { id: 'revops', label: 'RevOps / Sales Ops' },
  { id: 'other', label: 'Something else' },
];

export const USE_CASES: { id: UseCase; label: string; category: 'people' | 'company' | 'identity' }[] = [
  { id: 'lead_enrichment', label: 'Lead & contact enrichment', category: 'people' },
  { id: 'crm_hygiene', label: 'CRM data hygiene', category: 'company' },
  { id: 'identity_resolution', label: 'Identity resolution', category: 'identity' },
  { id: 'compliance', label: 'Compliance / KYB', category: 'company' },
  { id: 'other', label: 'Exploring', category: 'people' },
];

/** The OTP fallback ladder, in order. */
export const OTP_LADDER: OtpChannel[] = ['sms', 'whatsapp', 'call'];
export const OTP_LABEL: Record<OtpChannel, string> = { sms: 'SMS', whatsapp: 'WhatsApp', call: 'Voice call' };

/** A deterministic 6-digit OTP for an email (demo — no Math.random). */
export function otpCode(email: string): string {
  return String(fnv(`otp:${email.toLowerCase()}`) % 1_000_000).padStart(6, '0');
}

/** The catalogue category a use-case pre-filters to. */
export function preferredCategory(useCase: UseCase | null): 'people' | 'company' | 'identity' {
  return USE_CASES.find((u) => u.id === useCase)?.category ?? 'people';
}

export interface TrialActivationState {
  role: Role | null;
  useCase: UseCase | null;
  profileComplete: boolean;
  isPM: boolean;
  trialStatus: TrialStatus;
  trialCredits: number;
  risk: RiskDecision | null;
  otpChannel: OtpChannel | null;
  otpVerified: boolean;
  /** Whether the PM one-click key was auto-generated. */
  autoKeyIssued: boolean;

  setProfile: (role: Role, useCase: UseCase) => void;
  /** Evaluate risk for an email and either grant credits or request OTP. */
  availTrial: (email: string, extraSignals?: Partial<RiskSignals>) => RiskDecision;
  verifyOtp: (email: string, code: string) => boolean;
  skipOtp: () => void;
  escalateOtp: () => void;
  markAutoKeyIssued: () => void;
  reset: () => void;
}

function grantState() {
  return { trialStatus: 'granted' as TrialStatus, trialCredits: TRIAL_CREDITS, otpVerified: true };
}

export const useTrialActivation = create<TrialActivationState>()(
  persist(
    (set, get) => ({
      role: null,
      useCase: null,
      profileComplete: false,
      isPM: false,
      trialStatus: 'none',
      trialCredits: 0,
      risk: null,
      otpChannel: null,
      otpVerified: false,
      autoKeyIssued: false,

      setProfile: (role, useCase) =>
        set({ role, useCase, profileComplete: true, isPM: ROLES.find((r) => r.id === role)?.isPM ?? false }),

      availTrial: (email, extraSignals) => {
        const decision = riskScore({ email, ...extraSignals });
        if (decision.decision === 'grant') {
          set({ risk: decision, ...grantState() });
        } else {
          set({ risk: decision, trialStatus: 'pending_otp', otpChannel: 'sms', otpVerified: false });
        }
        return decision;
      },

      verifyOtp: (email, code) => {
        if (code.trim() === otpCode(email)) { set(grantState()); return true; }
        return false;
      },

      skipOtp: () => set(grantState()),

      escalateOtp: () => set((s) => {
        const i = s.otpChannel ? OTP_LADDER.indexOf(s.otpChannel) : -1;
        return { otpChannel: OTP_LADDER[Math.min(i + 1, OTP_LADDER.length - 1)] };
      }),

      markAutoKeyIssued: () => set({ autoKeyIssued: true }),

      reset: () => set({
        role: null, useCase: null, profileComplete: false, isPM: false,
        trialStatus: 'none', trialCredits: 0, risk: null, otpChannel: null, otpVerified: false, autoKeyIssued: false,
      }),
    }),
    { name: 'zinbit-trial', storage: createJSONStorage(() => localStorage) },
  ),
);
