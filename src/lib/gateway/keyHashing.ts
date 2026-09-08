/**
 * API keys hashed at rest — gateway attestation (F-321).
 *
 * The gateway never stores a plaintext API key. Every registry that references a
 * key — billing, IP allowlists, the geo-velocity tracker, scopes, the kill
 * switch, rate-limit buckets, idempotency entries, partner attribution — is keyed
 * by the SSOT SHA-256 digest (`@/lib/key-hashing`). This module makes that
 * provable rather than asserted:
 *   - `auditKeyStorage()` asks every registry how it is keyed and how many entries
 *     it holds, and totals the plaintext copies (which must be zero);
 *   - `describeKeyAtRest(apiKey)` reports exactly what the gateway holds for the
 *     presented key — digest, fingerprint, prefix, last 4 — and which registries
 *     reference that digest, so a developer can compare it with the fingerprint
 *     their console computed locally;
 *   - `verifyHash(apiKey, candidateHash)` answers "is this digest my key?" in
 *     constant time. The endpoint accepts a *digest*, never a plaintext candidate,
 *     so the secret never crosses the wire a second time;
 *   - `attachKeyFingerprintHeader` puts `X-Key-Fingerprint` on every response.
 *
 * Deterministic — no `Math.random`. Pure reads except the lookup counter.
 */

import {
  toKeyAtRest, fingerprintFromHash, constantTimeEqual, isSha256Hex, KEY_HASHING_POSTURE,
  type KeyAtRest, type RegistryDescriptor,
} from '@/lib/key-hashing';
import { billingStorageDescriptor, hasBillingRecordFor } from '@/lib/gateway/billing';
import { ipAllowlistStorageDescriptor, hasIpAllowlistFor, fraudTrackerStorageDescriptor, hasFraudRecordFor } from '@/lib/gateway/security';
import { scopesStorageDescriptor, hasScopesFor } from '@/lib/gateway/scopes';
import { killSwitchStorageDescriptor, isHashBlocked } from '@/lib/gateway/keyBlock';
import { rateLimitStorageDescriptor, hasRateBucketFor } from '@/lib/gateway/rateLimiter';
import { idempotencyStorageDescriptor, hasIdempotencyEntriesFor } from '@/lib/gateway/idempotency';
import { partnerIndexStorageDescriptor, hasPartnerAttributionFor } from '@/lib/gateway/partnerRevenue';

// ── Registry audit ───────────────────────────────────────────────────────────

interface RegistryProbe {
  describe: () => RegistryDescriptor;
  /** Does this registry hold anything for the digest? */
  references: (hash: string) => boolean;
}

/** Every gateway registry that references an API key. Add here when a new one appears. */
const REGISTRIES: readonly RegistryProbe[] = [
  { describe: billingStorageDescriptor, references: hasBillingRecordFor },
  { describe: ipAllowlistStorageDescriptor, references: hasIpAllowlistFor },
  { describe: fraudTrackerStorageDescriptor, references: hasFraudRecordFor },
  { describe: scopesStorageDescriptor, references: hasScopesFor },
  { describe: killSwitchStorageDescriptor, references: isHashBlocked },
  { describe: rateLimitStorageDescriptor, references: hasRateBucketFor },
  { describe: idempotencyStorageDescriptor, references: hasIdempotencyEntriesFor },
  { describe: partnerIndexStorageDescriptor, references: hasPartnerAttributionFor },
];

export interface KeyStorageAudit {
  algorithm: typeof KEY_HASHING_POSTURE.algorithm;
  posture: typeof KEY_HASHING_POSTURE;
  registries: RegistryDescriptor[];
  /** Registries keyed by digest / total. */
  hashedRegistries: number;
  totalRegistries: number;
  /** Entries in registries that are keyed by plaintext — must be 0. */
  plaintextCopies: number;
  /** Total key-referencing entries across registries. */
  totalEntries: number;
  /** True when every registry is keyed by digest. */
  clean: boolean;
  generatedAt: number;
}

/** Ask every registry how it stores keys. `plaintextCopies` is the number a reviewer wants to see: 0. */
export function auditKeyStorage(now: number = Date.now()): KeyStorageAudit {
  const registries = REGISTRIES.map((r) => r.describe());
  const hashedRegistries = registries.filter((r) => r.keyedBy === 'sha256').length;
  const plaintextCopies = registries.filter((r) => r.keyedBy === 'plaintext').reduce((n, r) => n + r.entries, 0);
  return {
    algorithm: KEY_HASHING_POSTURE.algorithm,
    posture: KEY_HASHING_POSTURE,
    registries,
    hashedRegistries,
    totalRegistries: registries.length,
    plaintextCopies,
    totalEntries: registries.reduce((n, r) => n + r.entries, 0),
    clean: hashedRegistries === registries.length,
    generatedAt: now,
  };
}

// ── What the gateway holds for the presented key ─────────────────────────────

export interface KeyAtRestDescription extends KeyAtRest {
  /** Registries that hold something for this digest. */
  referencedBy: { id: string; label: string }[];
  /** How many times this digest has been looked up via the attestation endpoint. */
  lookups: number;
  /** The header value every response for this key carries. */
  header: string;
}

const lookupsByHash = new Map<string, number>();

/**
 * Describe the presented key exactly as the gateway keeps it. The plaintext is
 * used only to compute the digest; nothing here returns it.
 */
export function describeKeyAtRest(apiKey: string): KeyAtRestDescription {
  const at = toKeyAtRest(apiKey);
  const lookups = (lookupsByHash.get(at.hash) ?? 0) + 1;
  lookupsByHash.set(at.hash, lookups);
  const referencedBy = REGISTRIES.filter((r) => r.references(at.hash)).map((r) => { const d = r.describe(); return { id: d.id, label: d.label }; });
  return { ...at, referencedBy, lookups, header: at.fingerprint };
}

// ── Verify a digest ──────────────────────────────────────────────────────────

export type VerifyOutcome =
  | { valid: false; reason: 'malformed'; message: string }
  | { valid: true; match: boolean; fingerprint: string; candidateFingerprint: string };

/**
 * "Is this digest my key?" — constant-time. Accepts a full 64-hex SHA-256 digest
 * (case-insensitive) or a `sha256:<hex>` fingerprint prefix; anything else is
 * rejected as malformed rather than compared.
 */
export function verifyHash(apiKey: string, candidate: string): VerifyOutcome {
  const at = toKeyAtRest(apiKey);
  const c = String(candidate || '').trim().toLowerCase();
  if (isSha256Hex(c)) {
    return { valid: true, match: constantTimeEqual(at.hash, c), fingerprint: at.fingerprint, candidateFingerprint: fingerprintFromHash(c) };
  }
  const m = /^sha256:([0-9a-f]{16})$/.exec(c);
  if (m) {
    return { valid: true, match: constantTimeEqual(at.fingerprint, `sha256:${m[1]}`), fingerprint: at.fingerprint, candidateFingerprint: `sha256:${m[1]}` };
  }
  return { valid: false, reason: 'malformed', message: 'Send a full 64-hex SHA-256 digest or a sha256:<16 hex> fingerprint — never the plaintext key.' };
}

// ── Response header ──────────────────────────────────────────────────────────

/** `X-Key-Fingerprint: sha256:<16 hex>` — the identity the gateway keyed this request by. */
export function attachKeyFingerprintHeader(headers: HeadersInit, apiKey: string | undefined): void {
  if (!apiKey) return;
  (headers as Record<string, string>)['X-Key-Fingerprint'] = toKeyAtRest(apiKey).fingerprint;
}

/** Test/demo hook. */
export function __resetKeyHashing(): void {
  lookupsByHash.clear();
}
