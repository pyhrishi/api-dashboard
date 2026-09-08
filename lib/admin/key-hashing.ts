/**
 * API keys hashed at rest — single source of truth (F-321).
 *
 * A secret should exist in plaintext in exactly one place: the client that was
 * issued it. Everything the gateway keeps about a key — its billing record, its
 * scopes, its kill-switch state, its rate bucket, its idempotency entries — is
 * keyed by a SHA-256 digest of the key, never the key itself. This module is the
 * one implementation every side uses:
 *   - the **gateway** (Node route handlers) and the **Edge middleware** (rate
 *     limiter) to look keys up by hash;
 *   - the **console** (browser) to show a fingerprint that is byte-for-byte the
 *     digest the gateway stores, and to hash a pasted key locally so the secret
 *     never leaves the browser.
 *
 * SHA-256 is implemented here in pure TypeScript (sync, ~60 lines) so the same
 * function runs in all three runtimes — Node `crypto` isn't available on Edge or
 * in the browser, and WebCrypto is async. API keys are 128+ bits of entropy, so
 * an unsalted SHA-256 is the correct construction (the GitHub/Stripe model);
 * password-style KDFs are for low-entropy secrets. Deterministic — no `Math.random`.
 */

// ── SHA-256 (FIPS 180-4), pure, sync ─────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** UTF-8 encode without TextEncoder (Edge/browser/Node agnostic). */
function utf8Bytes(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** SHA-256 of a UTF-8 string, as 64 lowercase hex chars. */
export function sha256Hex(input: string): string {
  const msg = utf8Bytes(input);
  const bitLen = msg.length * 8;
  // Pad: 0x80, zeros, 64-bit big-endian length → multiple of 64 bytes.
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) hex += h[i].toString(16).padStart(8, '0');
  return hex;
}

// ── Key identity ─────────────────────────────────────────────────────────────

export const HASH_ALGORITHM = 'SHA-256' as const;
/** Fingerprint = the first 16 hex chars (64 bits) of the digest — enough to identify, useless to invert. */
export const FINGERPRINT_HEX_CHARS = 16;

/** The full 64-hex digest the gateway keys its registries by. */
export function hashApiKey(key: string): string {
  return sha256Hex(key);
}

/** `sha256:<16 hex>` — the display identity of a key, identical in console + gateway. */
export function keyFingerprint(key: string): string {
  return `sha256:${hashApiKey(key).slice(0, FINGERPRINT_HEX_CHARS)}`;
}

/** Fingerprint from an already-computed digest (the gateway never has the plaintext). */
export function fingerprintFromHash(hash: string): string {
  return `sha256:${hash.slice(0, FINGERPRINT_HEX_CHARS)}`;
}

export type KeyPrefix = 'sk_live_' | 'sk_test_' | 'other';

export function keyPrefix(key: string): KeyPrefix {
  return key.startsWith('sk_live_') ? 'sk_live_' : key.startsWith('sk_test_') ? 'sk_test_' : 'other';
}

/** Well-formed = one of our prefixes followed by ≥ 16 URL-safe token chars (issued keys have 20). */
export function isWellFormedApiKey(key: string): boolean {
  return /^sk_(live|test)_[A-Za-z0-9_-]{16,}$/.test(key);
}

/** `sk_live_••••abcd` — what a console may show once the one-time reveal has passed. */
export function redactKey(key: string): string {
  if (!key) return '';
  const p = keyPrefix(key);
  const prefix = p === 'other' ? key.slice(0, 3) : p;
  return `${prefix}••••${key.slice(-4)}`;
}

/** Constant-time string equality (same length required) — for hash comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `s` looks like a full SHA-256 hex digest. */
export function isSha256Hex(s: string): boolean {
  return /^[0-9a-f]{64}$/.test(s);
}

// ── What is stored about a key ───────────────────────────────────────────────

/** The only key-identifying facts that may exist at rest. No plaintext field — by type. */
export interface KeyAtRest {
  hash: string;
  fingerprint: string;
  prefix: KeyPrefix;
  last4: string;
  algorithm: typeof HASH_ALGORITHM;
}

export function toKeyAtRest(plaintext: string): KeyAtRest {
  const hash = hashApiKey(plaintext);
  return { hash, fingerprint: fingerprintFromHash(hash), prefix: keyPrefix(plaintext), last4: plaintext.slice(-4), algorithm: HASH_ALGORITHM };
}

/** Posture facts a security reviewer asks about — one place, shown in the console and served by the gateway. */
export const KEY_HASHING_POSTURE = {
  algorithm: HASH_ALGORITHM,
  encoding: 'hex' as const,
  storedBits: 256,
  fingerprintBits: FINGERPRINT_HEX_CHARS * 4,
  /** Issued keys are 20 random base-36 chars (~103 bits of entropy), so no salt/KDF is needed (and a salt would break O(1) lookup). */
  salted: false,
  /** Comparison of digests is constant-time. */
  constantTimeCompare: true,
  /** The plaintext is shown exactly once — at creation (F-115) — then only fingerprint + last4. */
  plaintextRevealedOnce: true,
  /** Lookup is by digest: the gateway hashes the presented key and finds the record — it never stores the key. */
  lookupByDigest: true,
};

/** How a gateway registry keys its entries — reported by the audit. */
export type RegistryKeying = 'sha256' | 'plaintext';

export interface RegistryDescriptor {
  /** Module id, e.g. `billing`. */
  id: string;
  label: string;
  /** What the registry stores per key. */
  holds: string;
  keyedBy: RegistryKeying;
  entries: number;
  /** Where the registry runs — the Edge middleware or the Node route handler. */
  runtime: 'edge' | 'node';
}
