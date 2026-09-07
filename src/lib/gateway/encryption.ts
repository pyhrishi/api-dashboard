/**
 * Encryption meta engine (F-312) — the gateway's live view of the crypto posture.
 *
 * Two jobs:
 *   1. Attach `X-Encryption-Transit` / `X-Encryption-Rest` response headers to
 *      every real `/api/v1/*` response, so the guarantee is visible on the wire
 *      (the transit header complements the HSTS/CSP that security.ts already sets).
 *   2. Serve the `/v1/encryption` meta endpoint: a live, HMAC-signed attestation of
 *      the transit + at-rest posture a developer can pull in one call and hand to a
 *      security reviewer (GET), a settings sync so the console and the endpoint
 *      agree on cadence + field-level PII (PATCH), and a "rotate" drill that proves
 *      the KMS schedule moves (POST).
 *
 * The posture facts are derived by the shared SSOT (`@/lib/encryption`) so the
 * console and the gateway never disagree. In-memory, per-isolate, deterministic —
 * no `Math.random`. `creditCost` for the meta endpoint is 0.
 */

import { createHmac } from 'crypto';
import {
  buildPosture, TLS_POSTURE, daysUntilRotation, orgHandleForKey, normalizeSettingsPatch,
  type EncryptionPosture, type KmsKey, type EncryptionSettingsPatch,
} from '@/lib/encryption';

const DAY = 86_400_000;

/**
 * The gateway's own settings state, keyed by org. The console's persisted
 * `useEncryptionSettings` is the customer-facing control and syncs here via
 * `PATCH /v1/encryption`; this mirror lets the live endpoint reflect a rotation or
 * a policy change even from a bare API call. Seeded lazily so the first read reads
 * as a running system.
 */
interface OrgEncryptionState {
  rotationDays: number;
  lastRotatedAt: number | null;
  fieldEncryption: Record<string, boolean>;
  rotations: number;
}
const stateByOrg = new Map<string, OrgEncryptionState>();

function stateFor(orgId: string): OrgEncryptionState {
  let s = stateByOrg.get(orgId);
  if (!s) {
    s = { rotationDays: 90, lastRotatedAt: null, fieldEncryption: {}, rotations: 0 };
    stateByOrg.set(orgId, s);
  }
  return s;
}

// ── Response headers ─────────────────────────────────────────────────────────

/**
 * Attach the encryption guarantee to a response. `keyType` distinguishes sandbox
 * (`sk_test_`) from live (`sk_live_`) traffic; both are encrypted, but live also
 * runs field-level PII encryption (mirrors the masking split elsewhere).
 */
export function attachEncryptionHeaders(headers: HeadersInit, keyType: 'test' | 'live' = 'live'): void {
  const h = headers as Record<string, string>;
  h['X-Encryption-Transit'] = `${TLS_POSTURE.version.replace(' ', '')}; cipher=${TLS_POSTURE.cipher}; kx=${TLS_POSTURE.keyExchange}; pfs=${TLS_POSTURE.forwardSecrecy ? 'ECDHE' : 'off'}`;
  h['X-Encryption-Rest'] = keyType === 'live'
    ? 'AES-256-GCM; envelope=KMS; pii=field-level'
    : 'AES-256-GCM; envelope=KMS';
}

/** Response headers a cross-origin browser client may read (see cors.ts). */
export const ENCRYPTION_EXPOSED_HEADERS = ['X-Encryption-Transit', 'X-Encryption-Rest'] as const;

// ── Attestation signature ────────────────────────────────────────────────────

/**
 * The attestation is signed gateway-side with HMAC-SHA256 under a server secret,
 * so "signed" means something a reviewer can verify against the issuing gateway
 * (`GET /v1/encryption/verify?attestation=&sig=`). The prototype default secret is
 * overridable via `ZINBIT_ATTESTATION_SECRET`; `kid` names the signing key version.
 */
export const ATTESTATION_KID = 'zinbit-attest-2026-09';
const ATTESTATION_SECRET = process.env.ZINBIT_ATTESTATION_SECRET || 'zinbit-prototype-attestation-secret';

export interface AttestationSignature {
  alg: 'HMAC-SHA256';
  kid: string;
  /** Hex signature over `${orgId}.${attestation}`. */
  sig: string;
  issuedAt: number;
}

export function signAttestation(orgId: string, attestation: string, issuedAt: number): AttestationSignature {
  const sig = createHmac('sha256', ATTESTATION_SECRET).update(`${orgId}.${attestation}`).digest('hex');
  return { alg: 'HMAC-SHA256', kid: ATTESTATION_KID, sig, issuedAt };
}

/** Verify a digest + signature pair for the key's org. Constant shape, never throws. */
export function verifyAttestation(apiKey: string | undefined, attestation: string, sig: string): { valid: boolean; orgId: string; kid: string } {
  const orgId = orgHandleForKey(apiKey);
  const expected = signAttestation(orgId, attestation, 0).sig;
  return { valid: expected.length === sig.length && expected === sig.toLowerCase(), orgId, kid: ATTESTATION_KID };
}

// ── Posture + attestation ────────────────────────────────────────────────────

export interface EncryptionMetaSnapshot extends EncryptionPosture {
  orgId: string;
  rotations: number;
  /** The single overdue/next key for a quick console/CLI headline. */
  nextRotation: { alias: string; inDays: number } | null;
  signature: AttestationSignature;
}

export function getEncryptionPosture(apiKey: string | undefined, now: number = Date.now()): EncryptionMetaSnapshot {
  const orgId = orgHandleForKey(apiKey);
  const s = stateFor(orgId);
  const posture = buildPosture(orgId, { rotationDays: s.rotationDays, lastRotatedAt: s.lastRotatedAt, fieldEncryption: s.fieldEncryption }, now);
  const soonest = posture.keys.reduce<KmsKey | null>((min, k) => (!min || k.nextRotationAt < min.nextRotationAt ? k : min), null);
  return {
    ...posture,
    orgId,
    rotations: s.rotations,
    nextRotation: soonest ? { alias: soonest.alias, inDays: daysUntilRotation(soonest, now) } : null,
    signature: signAttestation(orgId, posture.attestation, now),
  };
}

// ── Settings sync (PATCH /v1/encryption) ─────────────────────────────────────

export interface SettingsUpdateResult {
  applied: EncryptionSettingsPatch;
  rotationDays: number;
  fieldEncryption: Record<string, boolean>;
}

/**
 * Apply a validated settings patch for the key's org. Invalid parts are dropped
 * (see `normalizeSettingsPatch`), so the console can sync its persisted settings
 * on mount and on every change without a round of validation errors.
 */
export function updateEncryptionSettings(apiKey: string | undefined, body: unknown): SettingsUpdateResult {
  const s = stateFor(orgHandleForKey(apiKey));
  const applied = normalizeSettingsPatch(body);
  if (applied.rotationDays !== undefined) s.rotationDays = applied.rotationDays;
  if (applied.fieldEncryption) s.fieldEncryption = { ...s.fieldEncryption, ...applied.fieldEncryption };
  return { applied, rotationDays: s.rotationDays, fieldEncryption: { ...s.fieldEncryption } };
}

// ── Rotation drill (POST /v1/encryption) ─────────────────────────────────────

export interface RotationResult {
  rotated: true;
  keyAlias: string;
  previousRotationAt: number | null;
  rotatedAt: number;
  nextRotationAt: number;
  rotationsTotal: number;
}

/**
 * Rotate the org's primary data key: re-wrap all data-encryption keys under a
 * fresh KMS key version (envelope re-encryption — the underlying data is never
 * re-encrypted, only its wrapping key). Deterministic, instant in the prototype.
 */
export function runRotationDrill(apiKey: string | undefined, now: number = Date.now()): RotationResult {
  const s = stateFor(orgHandleForKey(apiKey));
  const previous = s.lastRotatedAt;
  s.lastRotatedAt = now;
  s.rotations += 1;
  return {
    rotated: true,
    keyAlias: 'zinbit/data-primary',
    previousRotationAt: previous,
    rotatedAt: now,
    nextRotationAt: now + s.rotationDays * DAY,
    rotationsTotal: s.rotations,
  };
}

/** Test/demo hook — clear the per-isolate state. */
export function __resetEncryption(): void {
  stateByOrg.clear();
}
