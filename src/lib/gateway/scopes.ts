/**
 * Scoped key permissions (F-113) — the gateway enforcement registry.
 *
 * The gateway sees only the API key string, so to enforce a key's scopes it needs a
 * key→scopes binding. This in-memory registry holds it: the console registers a key's
 * scopes (POST /v1/keys/scopes) on create/roll/edit, and every /v1 request resolves
 * the endpoint's required scope (lib/scopes) and checks it here — a shortfall returns
 * 403 INSUFFICIENT_SCOPE. An UNREGISTERED key is treated as unrestricted (`*`), so the
 * gateway's lazy key-provisioning keeps working; only keys explicitly registered with
 * a restricted set are constrained. Per-isolate, seeded; deterministic (no Math.random).
 */

import { scopeForEndpoint, keyHasScope, isUnrestricted } from '@/lib/scopes';

interface ScopeEntry {
  scopes: string[];
  registeredAt: number;
}

const registry = new Map<string, ScopeEntry>();
let denials = 0;
let checksPerformed = 0;

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  // Illustrative registered keys so the console reads as continuous. Real console
  // keys register themselves on load; these show enforcement out of the box.
  const now = Date.now();
  registry.set('sk_live_readonly_demo', { scopes: ['identity:read', 'corporate:read'], registeredAt: now - 6 * 3600_000 });
  registry.set('sk_test_search_demo', { scopes: ['search:execute'], registeredAt: now - 2 * 3600_000 });
}

/** Register (or replace) the scopes bound to a key. Empty/`*` ⇒ unrestricted. */
export function registerKeyScopes(key: string, scopes: string[]): void {
  ensureSeed();
  registry.set(key, { scopes: Array.isArray(scopes) ? scopes : [], registeredAt: Date.now() });
}

/** Remove a key from the registry (revoked). */
export function unregisterKeyScopes(key: string): void {
  ensureSeed();
  registry.delete(key);
}

/** The scopes bound to a key — `['*']` (unrestricted) when the key isn't registered. */
export function getKeyScopes(key: string): string[] {
  ensureSeed();
  return registry.get(key)?.scopes ?? ['*'];
}

export interface ScopeCheck {
  allowed: boolean;
  requiredScope: string | null;
  keyScopes: string[];
  /** True when the key is registered with a restricted (non-wildcard) set. */
  restricted: boolean;
}

/** Check whether a key may call an endpoint. Records denial/hit counters. */
export function checkEndpointScope(key: string, endpoint: { path: string; method: string; creditCost?: number }): ScopeCheck {
  ensureSeed();
  checksPerformed += 1;
  const keyScopes = getKeyScopes(key);
  const requiredScope = scopeForEndpoint(endpoint);
  const allowed = keyHasScope(keyScopes, requiredScope);
  if (!allowed) denials += 1;
  return { allowed, requiredScope, keyScopes, restricted: !isUnrestricted(keyScopes) };
}

function maskKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
}

export interface RegisteredKeyView {
  key: string;
  scopes: string[];
  restricted: boolean;
  registeredAt: number;
}
export interface ScopeRegistrySnapshot {
  registeredKeys: number;
  restrictedKeys: number;
  checksPerformed: number;
  denials: number;
  keys: RegisteredKeyView[];
}

/** A snapshot for the /v1/keys/scopes GET + the console. */
export function getScopeRegistrySnapshot(): ScopeRegistrySnapshot {
  ensureSeed();
  const keys: RegisteredKeyView[] = [];
  registry.forEach((entry, key) => {
    keys.push({ key: maskKey(key), scopes: entry.scopes, restricted: !isUnrestricted(entry.scopes), registeredAt: entry.registeredAt });
  });
  keys.sort((a, b) => b.registeredAt - a.registeredAt);
  return {
    registeredKeys: keys.length,
    restrictedKeys: keys.filter((k) => k.restricted).length,
    checksPerformed,
    denials,
    keys,
  };
}

/** Reset all state — test-only. */
export function __resetScopes(): void {
  registry.clear();
  denials = 0;
  checksPerformed = 0;
  seeded = false;
}
