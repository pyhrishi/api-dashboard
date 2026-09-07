/**
 * Encryption meta engine (F-312) — the gateway's live view of the crypto posture.
 *
 * Two jobs:
 *   1. Attach `X-Encryption-Transit` / `X-Encryption-Rest` response headers to
 *      every real `/api/v1/*` response, so the guarantee is visible on the wire
 *      (the transit header complements the HSTS/CSP that security.ts already sets).
 *   2. Serve the `/v1/encryption` meta endpoint: a live, signed attestation of the
 *      transit + at-rest posture a developer can pull in one call and hand to a
 *      security reviewer, plus a "rotate" drill that proves the KMS schedule moves.
 *
 * The posture facts are derived by the shared SSOT (`@/lib/encryption`) so the
 * console and the gateway never disagree. In-memory, per-isolate, deterministic —
 * no `Math.random`. `creditCost` for the meta endpoint is 0.
 */

import {
  buildPosture, TLS_POSTURE, daysUntilRotation,
  type EncryptionPosture, type KmsKey,
} from '@/lib/encryption';

const DAY = 86_400_000;

/**
 * The gateway's own rotation state, keyed by org. The console's persisted
 * `useEncryptionSettings` is the customer-facing control; this mirror lets the
 * live endpoint reflect a rotation triggered via `POST /v1/encryption` even from
 * a bare API call. Seeded lazily so the first read reads as a running system.
 */
interface OrgRotationState {
  rotationDays: number;
  lastRotatedAt: number | null;
  rotations: number;
}
const rotationByOrg = new Map<string, OrgRotationState>();

function stateFor(orgId: string): OrgRotationState {
  let s = rotationByOrg.get(orgId);
  if (!s) {
    s = { rotationDays: 90, lastRotatedAt: null, rotations: 0 };
    rotationByOrg.set(orgId, s);
  }
  return s;
}

/** The org id a key belongs to (prototype: keys are org-scoped by prefix hash). */
function orgFromKey(apiKey: string | undefined): string {
  if (!apiKey) return 'org_demo';
  // Stable, non-secret bucket — the console uses the active org; the gateway just
  // needs a consistent handle so repeated calls are coherent.
  return `org_${apiKey.slice(-8)}`;
}

// ── Response headers ─────────────────────────────────────────────────────────

/**
 * Attach the encryption guarantee to a response. `keyType` distinguishes sandbox
 * (`sk_test_`) from live (`sk_live_`) traffic; both are encrypted, but live also
 * runs field-level PII encryption (mirrors the masking split elsewhere).
 */
export function attachEncryptionHeaders(headers: HeadersInit, keyType: 'test' | 'live' = 'live'): void {
  const h = headers as Record<string, string>;
  h['X-Encryption-Transit'] = `${TLS_POSTURE.version.replace(' ', '')}; cipher=${TLS_POSTURE.cipher}; pfs=${TLS_POSTURE.forwardSecrecy ? 'ECDHE' : 'off'}`;
  h['X-Encryption-Rest'] = keyType === 'live'
    ? 'AES-256-GCM; envelope=KMS; pii=field-level'
    : 'AES-256-GCM; envelope=KMS';
}

// ── Posture + attestation ────────────────────────────────────────────────────

export interface EncryptionMetaSnapshot extends EncryptionPosture {
  orgId: string;
  rotations: number;
  /** The single overdue/next key for a quick console/CLI headline. */
  nextRotation: { alias: string; inDays: number } | null;
}

export function getEncryptionPosture(apiKey: string | undefined, now: number = Date.now()): EncryptionMetaSnapshot {
  const orgId = orgFromKey(apiKey);
  const s = stateFor(orgId);
  const posture = buildPosture(orgId, { rotationDays: s.rotationDays, lastRotatedAt: s.lastRotatedAt, fieldEncryption: {} }, now);
  const soonest = posture.keys.reduce<KmsKey | null>((min, k) => (!min || k.nextRotationAt < min.nextRotationAt ? k : min), null);
  return {
    ...posture,
    orgId,
    rotations: s.rotations,
    nextRotation: soonest ? { alias: soonest.alias, inDays: daysUntilRotation(soonest, now) } : null,
  };
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
  const orgId = orgFromKey(apiKey);
  const s = stateFor(orgId);
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

/** Test/demo hook — clear the per-isolate rotation state. */
export function __resetEncryption(): void {
  rotationByOrg.clear();
}
