/**
 * One-time secret reveal (F-115).
 *
 * A secret (an API key) is shown in full exactly once — at creation — and never
 * again. After the reveal is acknowledged, the dashboard keeps only a
 * *fingerprint* (a stable short hash) plus the last four characters, enough to
 * identify the key without ever re-exposing it. This is the Stripe model, and
 * the safe default: a secret lingering revealable in a dashboard is a leak
 * waiting to happen.
 *
 * The gateway still needs the real token to authenticate, so `key.key` always
 * holds the true value (masking is a *display* concern — never store bullets,
 * they break HTTP headers). The one-time gate is `key.rawToken`: it exists only
 * until the reveal is acknowledged, at which point `clearRawToken` removes it
 * and `canReveal` turns false forever. The fingerprint is deterministic, so the
 * same secret always fingerprints the same — no Math.random.
 */

/** A minimal shape — anything with the full secret and the one-time raw token. */
export interface Revealable {
  key: string;
  rawToken?: string;
}

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * A deterministic 8-hex-char fingerprint of a secret — stable per secret, safe
 * to persist and display. Two rounds so it doesn't trivially invert.
 */
export function fingerprint(secret: string): string {
  if (!secret) return '00000000';
  const a = fnv1a(secret);
  const b = fnv1a(`${a}:${secret.length}:${secret.slice(0, 8)}`);
  return (a ^ b).toString(16).padStart(8, '0').slice(0, 8);
}

/** The last `n` characters of a secret (default 4) — the recognizable tail. */
export function secretTail(secret: string, n = 4): string {
  return secret.length <= n ? secret : secret.slice(-n);
}

/**
 * The masked identity of a secret once its one-time reveal has passed:
 * `sk_live_····a1b2 · fp_8f3c92e1`. Shows the prefix (mode), the tail, and the
 * fingerprint — identifiable, never revealing.
 */
export function maskedWithFingerprint(secret: string): string {
  const prefix = secret.startsWith('sk_live_') ? 'sk_live_' : secret.startsWith('sk_test_') ? 'sk_test_' : secret.slice(0, 3);
  return `${prefix}····${secretTail(secret)} · fp_${fingerprint(secret)}`;
}

/** Can this key's full secret still be revealed? Only while its one-time raw token is present. */
export function canReveal(key: Revealable): boolean {
  return typeof key.rawToken === 'string' && key.rawToken.length > 0;
}

/** Short fingerprint label for compact display (e.g. next to a masked key). */
export const fingerprintLabel = (secret: string): string => `fp_${fingerprint(secret)}`;
