/**
 * Scoped key permissions (F-113) — the scope catalog + endpoint→scope mapping (SSOT).
 *
 * An API key can be restricted to a set of scopes; the gateway then enforces least
 * privilege — a call to an endpoint the key isn't scoped for is rejected with 403
 * INSUFFICIENT_SCOPE (see `src/lib/gateway/scopes.ts`). This module is the single
 * source of truth both halves consume: the console renders the catalog + the
 * per-endpoint requirement matrix from here, and the gateway resolves an endpoint's
 * required scope from here, so what the console shows is exactly what the gateway
 * enforces. Client-safe (no server imports); pure and deterministic.
 *
 * A key holding `*` (or the legacy `all`) is unrestricted. A category wildcard like
 * `identity:*` grants every scope in that category. Free/meta endpoints (usage
 * registries, health) require no scope.
 */

export type ScopeCategory = 'identity' | 'corporate' | 'search' | 'enrich' | 'write';

export interface ScopeDef {
  id: string;
  label: string;
  category: ScopeCategory;
  description: string;
}

/** The full-access wildcard scopes a key may hold. */
export const WILDCARD_SCOPES = ['*', 'all'];

/** The canonical scope catalog — what a key can be granted. */
export const SCOPE_CATALOG: ScopeDef[] = [
  { id: 'identity:read', label: 'Identity', category: 'identity', description: 'People, contacts, email/phone, social & name resolution.' },
  { id: 'corporate:read', label: 'Corporate', category: 'corporate', description: 'Companies, domains, firmographics, technographics, funding & hierarchy.' },
  { id: 'search:execute', label: 'Search', category: 'search', description: 'People/company search, fuzzy match, and reverse enrichment.' },
  { id: 'enrich:read', label: 'Enrichment utilities', category: 'enrich', description: 'General enrichment utilities — IP, normalization, validation, dedupe, ID mapping.' },
  { id: 'write', label: 'Write & jobs', category: 'write', description: 'Mutating calls — bulk/async jobs, streaming, and webhook delivery.' },
];

export const SCOPE_IDS = SCOPE_CATALOG.map((s) => s.id);

/**
 * Resolve the scope an endpoint requires from its path + method. Returns null for
 * free/meta endpoints (no scope needed). Deterministic — the console matrix and the
 * gateway enforcement read the same result.
 */
export function scopeForEndpoint(endpoint: { path: string; method: string; creditCost?: number }): string | null {
  const path = String(endpoint.path || '').toLowerCase();
  const method = String(endpoint.method || 'GET').toUpperCase();

  // Free/meta endpoints (usage registries, health, docs) require no scope.
  const META = ['/v1/idempotency', '/v1/circuits', '/v1/coalescing', '/v1/compression', '/v1/keys/scopes'];
  if (META.some((m) => path === m) || (endpoint.creditCost === 0 && !path.includes('/export'))) return null;

  // Mutating calls — jobs, batch, streaming, webhooks, deliveries.
  if ((method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH')
    && /\/(jobs|batch|webhook|deliveries|stream)/.test(path)) return 'write';
  if (/\/(jobs|batch|deliveries)(\/|$)/.test(path) || path.includes('/stream')) return 'write';

  // Search / matching.
  if (/\/(search|match|reverse)/.test(path) || path.includes('/ai')) return 'search:execute';

  // Identity (people & contact data).
  if (/\/(people|identity|email|phone|contact|directors|names|social|hashed)/.test(path)) return 'identity:read';

  // Corporate (company & domain data).
  if (/\/(companies|company|domains|firmograph|technograph|funding|offices|news|cin|linkedin)/.test(path)) return 'corporate:read';

  // Everything else — general enrichment utilities.
  return 'enrich:read';
}

/** Does a key's scope set satisfy a required scope? `*`/`all` and `cat:*` are honored. */
export function keyHasScope(keyScopes: string[], required: string | null): boolean {
  if (!required) return true;
  if (!Array.isArray(keyScopes) || keyScopes.length === 0) return false;
  if (keyScopes.some((s) => WILDCARD_SCOPES.includes(s))) return true;
  if (keyScopes.includes(required)) return true;
  // Category wildcard: 'identity:*' grants 'identity:read'.
  const cat = required.includes(':') ? `${required.split(':')[0]}:*` : null;
  if (cat && keyScopes.includes(cat)) return true;
  return false;
}

/** True when a key is unrestricted (holds a full-access wildcard, or nothing set). */
export function isUnrestricted(keyScopes: string[]): boolean {
  return !Array.isArray(keyScopes) || keyScopes.length === 0 || keyScopes.some((s) => WILDCARD_SCOPES.includes(s));
}

/** Human label for a scope id (falls back to the id). */
export function scopeLabel(id: string): string {
  if (WILDCARD_SCOPES.includes(id)) return 'Full access';
  return SCOPE_CATALOG.find((s) => s.id === id)?.label ?? id;
}

/** Group the catalog by category for the UI. */
export function scopesByCategory(): Record<ScopeCategory, ScopeDef[]> {
  const out = {} as Record<ScopeCategory, ScopeDef[]>;
  SCOPE_CATALOG.forEach((s) => { (out[s.category] ??= []).push(s); });
  return out;
}
