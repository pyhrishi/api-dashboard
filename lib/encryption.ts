/**
 * Encryption posture — single source of truth (F-312).
 *
 * "Encryption in transit & at rest" is two guarantees an enterprise reviewer will
 * ask about, so this module models both as first-class, inspectable posture:
 *   - In transit: the negotiated TLS version + cipher suite, HSTS, OCSP stapling.
 *   - At rest: an inventory of encrypted data stores, the customer-managed KMS
 *     keys that wrap them (envelope encryption), a rotation schedule, and
 *     field-level PII encryption modes.
 *
 * Everything is derived deterministically (FNV, no `Math.random`) so a given org
 * always sees the same key fingerprints, rotation dates, and attestation digest —
 * the console reads as a real, stable system and the values are unit-testable.
 * Fingerprints and digests are display artifacts, never real key material.
 *
 * The pure helpers here are shared by the console page, the gateway meta module
 * (`src/lib/gateway/encryption.ts`), and the tests. Mutable org preferences
 * (field-encryption toggles, rotation cadence) live in the dedicated persisted
 * `useEncryptionSettings` store below — separate from the tenant store, like the
 * other pre-/cross-cutting security stores (MFA policy, login guard).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { hashApiKey } from '@/lib/key-hashing';

// ── Types ────────────────────────────────────────────────────────────────────

export type TlsVersion = 'TLS 1.3' | 'TLS 1.2';
export type KeyState = 'active' | 'rotating' | 'retired';
export type StoreKind = 'database' | 'object-storage' | 'cache' | 'backups' | 'queue';
export type FieldMode = 'deterministic' | 'randomized';

/** The transport-layer posture negotiated for API traffic. */
export interface TlsPosture {
  version: TlsVersion;
  /** IANA cipher suite name. */
  cipher: string;
  keyExchange: string;
  /** HSTS with preload — matches the gateway's Strict-Transport-Security header. */
  hsts: boolean;
  hstsMaxAgeDays: number;
  ocspStapling: boolean;
  /** Perfect forward secrecy (ECDHE). */
  forwardSecrecy: boolean;
}

/** A customer-managed KMS key that wraps data-encryption keys (envelope model). */
export interface KmsKey {
  id: string;
  alias: string;
  /** Non-secret fingerprint for display/audit — never real key material. */
  fingerprint: string;
  algorithm: 'AES-256-GCM';
  purpose: 'data' | 'pii' | 'backups' | 'exports';
  state: KeyState;
  createdAt: number;
  rotatedAt: number;
  nextRotationAt: number;
  rotationDays: number;
}

/** A data store that holds customer data encrypted at rest. */
export interface EncryptedStore {
  name: string;
  kind: StoreKind;
  algorithm: 'AES-256-GCM' | 'AES-256-XTS';
  /** Which KMS key wraps this store. */
  kmsKeyId: string;
  encrypted: boolean;
  region: string;
}

/** A PII field and how it is encrypted at rest. */
export interface FieldEncryption {
  field: string;
  /** Deterministic keeps the field searchable/joinable; randomized is strongest. */
  mode: FieldMode;
  /** Whether column-level encryption is enabled for this field. */
  enabled: boolean;
}

export interface EncryptionPosture {
  transit: TlsPosture;
  keys: KmsKey[];
  stores: EncryptedStore[];
  fields: FieldEncryption[];
  score: number;
  /** A stable, non-secret attestation digest over the posture. */
  attestation: string;
  generatedAt: number;
}

// ── Deterministic derivation (FNV-1a, no Math.random) ────────────────────────

export function fnv(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const HEX = '0123456789abcdef';
/** A stable hex fingerprint of `len` chars derived from a seed. */
export function fingerprint(seed: string, len = 16): string {
  let out = '';
  let i = 0;
  while (out.length < len) {
    const h = fnv(`${seed}:${i}`);
    for (let s = 0; s < 8 && out.length < len; s++) out += HEX[(h >> (s * 4)) & 0xf];
    i++;
  }
  // group in pairs for a colon-delimited fingerprint look
  return out.match(/.{1,2}/g)!.join(':');
}

const DAY = 86_400_000;

/**
 * The org handle an API key maps to. Shared by the console and the gateway so both
 * derive the same KMS inventory + attestation for a key (prototype: keys are
 * org-scoped by a stable bucket). Derived from the key's SHA-256 digest (F-321) —
 * never a fragment of the plaintext — so a handle at rest reveals nothing about
 * the secret. No key → the demo org.
 */
export function orgHandleForKey(apiKey: string | undefined | null): string {
  return apiKey ? `org_${hashApiKey(apiKey).slice(0, 8)}` : 'org_demo';
}

/** The transit posture — fixed to the strong modern default the gateway serves. */
export const TLS_POSTURE: TlsPosture = {
  version: 'TLS 1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  keyExchange: 'X25519',
  hsts: true,
  hstsMaxAgeDays: 730,
  ocspStapling: true,
  forwardSecrecy: true,
};

/** The Strict-Transport-Security value the gateway serves — derived from the posture so the two can't drift. */
export function hstsHeaderValue(posture: TlsPosture = TLS_POSTURE): string {
  return `max-age=${posture.hstsMaxAgeDays * 86_400}; includeSubDomains; preload`;
}

/**
 * Deterministic KMS key inventory for an org. `rotationDays` and `lastRotatedAt`
 * (from settings) drive the schedule so a "rotate now" in the console visibly
 * moves the dates. `now` is injected for testability.
 */
export function deriveKeys(orgId: string, rotationDays: number, lastRotatedAt: number | null, now: number): KmsKey[] {
  const purposes: KmsKey['purpose'][] = ['data', 'pii', 'backups', 'exports'];
  const aliases: Record<KmsKey['purpose'], string> = {
    data: 'zinbit/data-primary',
    pii: 'zinbit/pii-column',
    backups: 'zinbit/backups',
    exports: 'zinbit/exports',
  };
  return purposes.map((purpose, i) => {
    const seed = `kms:${orgId}:${purpose}`;
    const createdAt = now - (400 - i * 37) * DAY;
    // The primary data key follows the org's configured cadence + last rotation;
    // the others are staggered deterministically off their seed.
    const rotatedAt = purpose === 'data' && lastRotatedAt ? lastRotatedAt : now - ((fnv(seed) % rotationDays) + 1) * DAY;
    return {
      id: `key_${fingerprint(seed, 8).replace(/:/g, '')}`,
      alias: aliases[purpose],
      fingerprint: fingerprint(seed, 16),
      algorithm: 'AES-256-GCM',
      purpose,
      state: 'active',
      createdAt,
      rotatedAt,
      nextRotationAt: rotatedAt + rotationDays * DAY,
      rotationDays,
    };
  });
}

/** The encrypted-store inventory, wrapped by the derived KMS keys. */
export function deriveStores(keys: KmsKey[]): EncryptedStore[] {
  const dataKey = keys.find((k) => k.purpose === 'data')?.id ?? '';
  const piiKey = keys.find((k) => k.purpose === 'pii')?.id ?? '';
  const backupKey = keys.find((k) => k.purpose === 'backups')?.id ?? '';
  return [
    { name: 'enrichment-primary', kind: 'database', algorithm: 'AES-256-GCM', kmsKeyId: dataKey, encrypted: true, region: 'us-east-1' },
    { name: 'pii-vault', kind: 'database', algorithm: 'AES-256-GCM', kmsKeyId: piiKey, encrypted: true, region: 'us-east-1' },
    { name: 'export-artifacts', kind: 'object-storage', algorithm: 'AES-256-GCM', kmsKeyId: dataKey, encrypted: true, region: 'us-east-1' },
    { name: 'edge-cache', kind: 'cache', algorithm: 'AES-256-XTS', kmsKeyId: dataKey, encrypted: true, region: 'global' },
    { name: 'nightly-backups', kind: 'backups', algorithm: 'AES-256-GCM', kmsKeyId: backupKey, encrypted: true, region: 'us-west-2' },
    { name: 'webhook-queue', kind: 'queue', algorithm: 'AES-256-GCM', kmsKeyId: dataKey, encrypted: true, region: 'us-east-1' },
  ];
}

/** The default PII field-encryption catalog (org toggles override `enabled`). */
export const PII_FIELDS: { field: string; mode: FieldMode }[] = [
  { field: 'email', mode: 'deterministic' },
  { field: 'phone', mode: 'deterministic' },
  { field: 'full_name', mode: 'randomized' },
  { field: 'company_domain', mode: 'deterministic' },
  { field: 'linkedin_url', mode: 'randomized' },
  { field: 'location', mode: 'randomized' },
];

/** Randomized fields are a hard floor: always encrypted, never relaxable. */
export function isFieldRelaxable(field: string): boolean {
  return PII_FIELDS.find((f) => f.field === field)?.mode === 'deterministic';
}

export function deriveFields(overrides: Record<string, boolean>): FieldEncryption[] {
  return PII_FIELDS.map(({ field, mode }) => ({
    field,
    mode,
    // Default on; an org can only relax deterministic (searchable) fields — the
    // floor is enforced here (the SSOT), not just in the UI.
    enabled: mode === 'randomized' ? true : (overrides[field] ?? true),
  }));
}

/** A validated settings patch (what `PATCH /v1/encryption` and the console may change). */
export interface EncryptionSettingsPatch {
  rotationDays?: number;
  fieldEncryption?: Record<string, boolean>;
}

/**
 * Narrow an untrusted body into a settings patch. Unknown fields, non-boolean
 * toggles, unknown PII fields, non-relaxable (randomized) fields, and cadences
 * outside the allowlist are dropped — never thrown — so a partial patch applies.
 */
export function normalizeSettingsPatch(input: unknown): EncryptionSettingsPatch {
  const out: EncryptionSettingsPatch = {};
  if (!input || typeof input !== 'object') return out;
  const body = input as Record<string, unknown>;
  if (typeof body.rotationDays === 'number' && (ALLOWED_ROTATION_DAYS as readonly number[]).includes(body.rotationDays)) {
    out.rotationDays = body.rotationDays;
  }
  if (body.fieldEncryption && typeof body.fieldEncryption === 'object') {
    const fe: Record<string, boolean> = {};
    Object.entries(body.fieldEncryption as Record<string, unknown>).forEach(([field, enabled]) => {
      if (typeof enabled === 'boolean' && isFieldRelaxable(field)) fe[field] = enabled;
    });
    out.fieldEncryption = fe;
  }
  return out;
}

// ── Scoring & attestation ────────────────────────────────────────────────────

/** 0–100 posture score — transit strength + at-rest coverage + rotation freshness. */
export function postureScore(posture: Pick<EncryptionPosture, 'transit' | 'keys' | 'stores' | 'fields'>, now: number): number {
  let score = 0;
  // Transit (35)
  if (posture.transit.version === 'TLS 1.3') score += 15; else score += 8;
  if (posture.transit.hsts) score += 8;
  if (posture.transit.forwardSecrecy) score += 7;
  if (posture.transit.ocspStapling) score += 5;
  // At-rest store coverage (30)
  const encryptedStores = posture.stores.filter((s) => s.encrypted).length;
  score += posture.stores.length ? Math.round((encryptedStores / posture.stores.length) * 30) : 0;
  // Field-level PII coverage (20)
  const onFields = posture.fields.filter((f) => f.enabled).length;
  score += posture.fields.length ? Math.round((onFields / posture.fields.length) * 20) : 0;
  // Rotation freshness (15) — penalize any key overdue for rotation.
  if (posture.keys.length) {
    const overdue = posture.keys.filter((k) => k.nextRotationAt < now).length;
    score += Math.max(0, 15 - overdue * 8);
  }
  return Math.max(0, Math.min(100, score));
}

/** A stable, non-secret attestation digest over the material posture facts. */
export function attest(posture: Pick<EncryptionPosture, 'transit' | 'keys' | 'stores' | 'fields'>): string {
  const material = [
    posture.transit.version,
    posture.transit.cipher,
    posture.keys.map((k) => `${k.alias}@${k.fingerprint}`).join(','),
    posture.stores.map((s) => `${s.name}:${s.algorithm}`).join(','),
    posture.fields.filter((f) => f.enabled).map((f) => f.field).join(','),
  ].join('|');
  return `att_${fingerprint(material, 24).replace(/:/g, '')}`;
}

/** Assemble the full posture for an org from its settings. */
export function buildPosture(
  orgId: string,
  settings: { rotationDays: number; lastRotatedAt: number | null; fieldEncryption: Record<string, boolean> },
  now: number,
): EncryptionPosture {
  const keys = deriveKeys(orgId, settings.rotationDays, settings.lastRotatedAt, now);
  const stores = deriveStores(keys);
  const fields = deriveFields(settings.fieldEncryption);
  const partial = { transit: TLS_POSTURE, keys, stores, fields };
  return {
    ...partial,
    score: postureScore(partial, now),
    attestation: attest(partial),
    generatedAt: now,
  };
}

/** Days until a key's next scheduled rotation (negative = overdue). */
export function daysUntilRotation(key: KmsKey, now: number): number {
  return Math.round((key.nextRotationAt - now) / DAY);
}

// ── Persisted settings store (own key, not the tenant store) ─────────────────

export interface EncryptionSettingsState {
  /** KMS rotation cadence in days (primary data key). */
  rotationDays: number;
  /** When the primary data key was last rotated (drives the schedule). */
  lastRotatedAt: number | null;
  /** Field → enabled override (absent = default on). */
  fieldEncryption: Record<string, boolean>;
  setRotationCadence: (days: number) => void;
  rotatePrimaryKey: (now?: number) => void;
  setFieldEncryption: (field: string, enabled: boolean) => void;
  reset: () => void;
}

export const ALLOWED_ROTATION_DAYS = [30, 60, 90, 180, 365] as const;

export const useEncryptionSettings = create<EncryptionSettingsState>()(
  persist(
    (set) => ({
      rotationDays: 90,
      lastRotatedAt: null,
      fieldEncryption: {},
      setRotationCadence: (days) =>
        set({ rotationDays: (ALLOWED_ROTATION_DAYS as readonly number[]).includes(days) ? days : 90 }),
      rotatePrimaryKey: (now) => set({ lastRotatedAt: now ?? Date.now() }),
      setFieldEncryption: (field, enabled) =>
        set((s) => (isFieldRelaxable(field) ? { fieldEncryption: { ...s.fieldEncryption, [field]: enabled } } : s)),
      reset: () => set({ rotationDays: 90, lastRotatedAt: null, fieldEncryption: {} }),
    }),
    { name: 'zinbit-encryption', storage: createJSONStorage(() => localStorage) },
  ),
);
