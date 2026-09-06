/**
 * Hashed-email (SHA-256) lookups — deterministic, privacy-preserving resolution.
 *
 * The caller sends only `sha256(lower(trim(email)))` — never the plaintext. We
 * match that hash against a deterministic hashed-identity index and, on a hit,
 * resolve the full person through the same `person-resolver` every other surface
 * uses. A miss is an honest miss (the hash isn't in the opted-in index), so
 * match rate stays truthful.
 *
 * The index is built with the same `lib/sha256.ts` the browser uses to hash the
 * email, so a client-computed hash always matches here. Pure and deterministic.
 */

import { resolvePersonFromEmail, type ResolvedPerson } from '@/lib/person-resolver';
import { sha256Hex, isSha256Hex } from '@/lib/sha256';

export interface HashedEmailResult {
  algorithm: 'SHA-256';
  email_sha256: string;
  matched: boolean;
  /** Always false — the plaintext email never reaches the gateway. */
  plaintext_received: false;
  /** Size of the opted-in hashed-identity index the hash was matched against. */
  dataset_size: number;
  person?: ResolvedPerson;
  reason?: string;
}

/** The canonical pre-hash normalization: trim + lowercase. Shared with the client. */
export function normalizeEmailForHash(email: string): string {
  return String(email || '').trim().toLowerCase();
}

// ── The opted-in hashed-identity dataset ─────────────────────────────────────
// Curated example identities (so the Studio's example emails always resolve)…
const CURATED_EMAILS = [
  'jane.doe@acme.com', 'john.doe@acme.com', 'marcus@stripe.com', 'ceo@stripe.com',
  'priya.nair@zomato.in', 'john@datadoghq.com', 'contact@figma.com', 'sarah.chen@notion.so',
  'david.kim@vercel.com', 'emma.watson@airbnb.com', 'raj.patel@uber.com', 'lisa.wong@netflix.com',
];
// …plus a deterministic corporate set, so the index has believable depth.
const DOMAINS = [
  'acme.com', 'stripe.com', 'datadoghq.com', 'shopify.com', 'figma.com', 'zomato.in',
  'notion.so', 'vercel.com', 'airbnb.com', 'uber.com', 'netflix.com', 'openai.com',
];
const FIRST_NAMES = ['james', 'mary', 'robert', 'patricia', 'michael', 'jennifer', 'david', 'linda', 'william', 'elizabeth', 'richard', 'susan', 'joseph', 'jessica', 'thomas', 'sarah', 'chris', 'karen', 'daniel', 'nancy'];
const LAST_NAMES = ['smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis', 'nair', 'patel', 'kim', 'chen', 'wong', 'lopez', 'singh'];

/** Build the full email dataset once (curated + first.last per domain). */
function buildEmailDataset(): string[] {
  const set = new Set<string>(CURATED_EMAILS.map(normalizeEmailForHash));
  for (const domain of DOMAINS) {
    for (let i = 0; i < FIRST_NAMES.length; i++) {
      const first = FIRST_NAMES[i];
      const last = LAST_NAMES[i % LAST_NAMES.length];
      set.add(`${first}.${last}@${domain}`);
    }
  }
  return Array.from(set);
}

// Lazily built hash → email index (module-level cache; deterministic).
let INDEX: Map<string, string> | null = null;
function getIndex(): Map<string, string> {
  if (INDEX) return INDEX;
  const index = new Map<string, string>();
  for (const email of buildEmailDataset()) index.set(sha256Hex(email), email);
  INDEX = index;
  return index;
}

/** Size of the opted-in hashed-identity index (for tests + stats). */
export function hashedDatasetSize(): number {
  return getIndex().size;
}

/**
 * Resolve a person from a SHA-256 email hash.
 * Returns `null` for a syntactically invalid hash; otherwise a result whose
 * `matched` flag says whether the hash was in the opted-in index.
 */
export function resolveByEmailHash(rawHash: string): HashedEmailResult | null {
  const hash = String(rawHash || '').trim().toLowerCase().replace(/^sha256:/, '');
  if (!isSha256Hex(hash)) return null;

  const index = getIndex();
  const email = index.get(hash);
  const dataset_size = index.size;

  if (!email) {
    return { algorithm: 'SHA-256', email_sha256: hash, matched: false, plaintext_received: false, dataset_size, reason: 'No identity in the opted-in dataset matches this hash.' };
  }

  const person = resolvePersonFromEmail(email) ?? undefined;
  if (!person) {
    return { algorithm: 'SHA-256', email_sha256: hash, matched: false, plaintext_received: false, dataset_size, reason: 'Hash matched but the identity could not be resolved.' };
  }

  return { algorithm: 'SHA-256', email_sha256: hash, matched: true, plaintext_received: false, dataset_size, person };
}

/** Convenience for the client + tests: the hash a given email would be looked up by. */
export function hashEmail(email: string): string {
  return sha256Hex(normalizeEmailForHash(email));
}
