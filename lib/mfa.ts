/**
 * MFA enforcement (F-309) — org policy requiring multi-factor auth for console access.
 *
 * A personal 2FA toggle already exists (is2faEnabled); this adds the ENTERPRISE
 * control: an org admin can require MFA for everyone, and members who haven't
 * enrolled are gated until they do (after an optional grace period). The console
 * shows org-wide compliance, an admin policy switch, and a TOTP enrollment flow with
 * recovery codes.
 *
 * Org policy + per-member enrollment live in their own small persisted store
 * (keyed separately from the tenant store) — the MFA policy page and the enforcement
 * gate read it, joined read-only with the team roster. TOTP secrets + recovery codes
 * are derived deterministically (FNV, no Math.random), so a given account always
 * shows the same secret in the prototype.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MfaPolicy = 'optional' | 'required';
export type MfaMethod = 'totp' | 'recovery';

export interface MfaEnrollment {
  email: string;
  enrolled: boolean;
  method: MfaMethod;
  enrolledAt: number;
  secret: string;
  recoveryCodesRemaining: number;
}

// ── Deterministic secret / recovery-code generation ──────────────────────────

function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A stable base32 TOTP secret for an account (grouped in 4s for display). */
export function totpSecret(email: string): string {
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += B32[fnv(`totp:${email}:${i}`) % 32];
  }
  return out.replace(/(.{4})/g, '$1 ').trim();
}

/** 8 deterministic recovery codes (XXXX-XXXX) for an account. */
export function recoveryCodes(email: string): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (fnv(`rc:${email}:${i}:a`) % 0x10000).toString(16).padStart(4, '0');
    const b = (fnv(`rc:${email}:${i}:b`) % 0x10000).toString(16).padStart(4, '0');
    codes.push(`${a}-${b}`);
  }
  return codes;
}

/** A provisioning otpauth:// URI for a QR (host apps could render it). */
export function otpauthUri(email: string): string {
  const secret = totpSecret(email).replace(/\s/g, '');
  return `otpauth://totp/Zinbit:${encodeURIComponent(email)}?secret=${secret}&issuer=Zinbit&period=30&digits=6`;
}

// ── Pure policy helpers (deterministic; now injected) ─────────────────────────

export const isEnforced = (policy: MfaPolicy): boolean => policy === 'required';

export const inGracePeriod = (graceUntil: number | null, now: number): boolean =>
  graceUntil != null && graceUntil > now;

/** Is a member covered — enrolled here, or (for self) via the legacy is2faEnabled flag? */
export function memberCompliant(email: string, enrollments: Record<string, MfaEnrollment>, self?: { email: string; is2faEnabled: boolean }): boolean {
  const e = enrollments[email.toLowerCase()];
  if (e?.enrolled) return true;
  if (self && self.email.toLowerCase() === email.toLowerCase() && self.is2faEnabled) return true;
  return false;
}

export interface OrgCompliance { total: number; compliant: number; nonCompliant: number; pct: number; }

export function orgCompliance(memberEmails: string[], enrollments: Record<string, MfaEnrollment>, self?: { email: string; is2faEnabled: boolean }): OrgCompliance {
  const total = memberEmails.length;
  const compliant = memberEmails.filter((m) => memberCompliant(m, enrollments, self)).length;
  return { total, compliant, nonCompliant: total - compliant, pct: total === 0 ? 100 : Math.round((compliant / total) * 100) };
}

/** Does the current user need to enroll right now (policy required, not covered, past grace)? */
export function enrollmentRequired(
  policy: MfaPolicy,
  self: { email: string; is2faEnabled: boolean } | null,
  enrollments: Record<string, MfaEnrollment>,
  graceUntil: number | null,
  now: number,
): boolean {
  if (!isEnforced(policy) || !self) return false;
  if (inGracePeriod(graceUntil, now)) return false;
  return !memberCompliant(self.email, enrollments, self);
}

// ── Persisted store (org policy + enrollment; own key) ───────────────────────

const norm = (e: string) => String(e ?? '').trim().toLowerCase();

export interface MfaState {
  policy: MfaPolicy;
  /** When required-policy enforcement kicks in (null = immediate). */
  graceUntil: number | null;
  enrollments: Record<string, MfaEnrollment>;
  setPolicy: (policy: MfaPolicy, graceDays?: number) => void;
  enroll: (email: string) => MfaEnrollment;
  unenroll: (email: string) => void;
  regenerateRecovery: (email: string) => void;
  getEnrollment: (email: string) => MfaEnrollment | undefined;
  seedEnrollments: (emails: string[]) => void;
}

export const useMfaPolicy = create<MfaState>()(
  persist(
    (set, get) => ({
      policy: 'optional',
      graceUntil: null,
      enrollments: {},
      setPolicy: (policy, graceDays) => set({
        policy,
        graceUntil: policy === 'required' && graceDays && graceDays > 0 ? Date.now() + graceDays * 86_400_000 : null,
      }),
      enroll: (email) => {
        const key = norm(email);
        const rec: MfaEnrollment = { email: key, enrolled: true, method: 'totp', enrolledAt: Date.now(), secret: totpSecret(key), recoveryCodesRemaining: 8 };
        set((s) => ({ enrollments: { ...s.enrollments, [key]: rec } }));
        return rec;
      },
      unenroll: (email) => set((s) => {
        const key = norm(email);
        const e = s.enrollments[key];
        if (!e) return {};
        return { enrollments: { ...s.enrollments, [key]: { ...e, enrolled: false } } };
      }),
      regenerateRecovery: (email) => set((s) => {
        const key = norm(email);
        const e = s.enrollments[key];
        if (!e) return {};
        return { enrollments: { ...s.enrollments, [key]: { ...e, recoveryCodesRemaining: 8 } } };
      }),
      getEnrollment: (email) => get().enrollments[norm(email)],
      seedEnrollments: (emails) => set((s) => {
        // Idempotently mark a subset enrolled so the compliance roster reads realistically.
        if (Object.keys(s.enrollments).length > 0) return {};
        const next: Record<string, MfaEnrollment> = {};
        emails.forEach((raw, i) => {
          const key = norm(raw);
          if (i % 3 !== 0) next[key] = { email: key, enrolled: true, method: 'totp', enrolledAt: Date.now() - (i + 1) * 86_400_000, secret: totpSecret(key), recoveryCodesRemaining: 8 - (i % 4) };
        });
        return { enrollments: next };
      }),
    }),
    { name: 'zinbit-mfa-policy', storage: createJSONStorage(() => localStorage) },
  ),
);
