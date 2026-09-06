/**
 * Partial-result responses (F-071) — return what resolved when a source is down.
 *
 * An enrichment often draws from several upstreams: a person's core identity from
 * the professional graph, their direct phone from a carrier HLR, their socials
 * from the social graph. If a SECONDARY upstream's circuit is open (see
 * circuitBreaker.ts / upstreams.ts), we shouldn't fail the whole call — we return
 * the fields that resolved, drop the ones that didn't, and attach a `partial`
 * metadata block saying exactly what's missing and why (HTTP 206). Billing is
 * scaled to what actually resolved.
 *
 * Pure + deterministic: same data + same degraded set → same output. No mutation
 * of the input (works on a deep clone). No `Math.random`.
 */

import { secondaryContributions, getUpstream } from '@/lib/gateway/upstreams';

export interface PartialMissing {
  upstream: string;
  /** Provider display name, when known. */
  upstreamName: string;
  label: string;
  fields: string[];
  reason: string;
}

export interface PartialMeta {
  partial: boolean;
  missing: PartialMissing[];
  degraded_upstreams: string[];
  /** Fraction of contributing upstreams (primary + secondaries) that resolved, 0..1. */
  completeness: number;
}

export interface PartialPlan {
  /** True when at least one secondary upstream is degraded. */
  partial: boolean;
  degraded: string[];
  completeness: number;
}

export interface PartialOutcome {
  data: unknown;
  meta: PartialMeta;
}

/**
 * Decide, before billing, how complete this response will be — a cheap read of the
 * secondary upstreams' circuit state. `isOpen` returns true when an upstream's
 * breaker is OPEN. Completeness includes the (already-healthy) primary upstream.
 */
export function planPartial(endpointId: string, isOpen: (upstream: string) => boolean): PartialPlan {
  const contribs = secondaryContributions(endpointId);
  const degraded = contribs.filter((c) => isOpen(c.upstream)).map((c) => c.upstream);
  const total = 1 + contribs.length; // primary + secondaries
  const completeness = total === 0 ? 1 : Math.round(((total - degraded.length) / total) * 100) / 100;
  return { partial: degraded.length > 0, degraded, completeness };
}

// Deep clone a plain-JSON payload without mutating the source.
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// Delete a dotted path from an object, if present. Returns true if a value was removed.
function deletePath(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur !== 'object' || cur === null) return false;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (typeof cur === 'object' && cur !== null && leaf in (cur as Record<string, unknown>)) {
    delete (cur as Record<string, unknown>)[leaf];
    return true;
  }
  return false;
}

/**
 * Strip the fields supplied by degraded secondary upstreams from a response and
 * build the partial-result metadata. Returns the (possibly unchanged) data plus
 * the meta. A no-op — original data returned untouched — when nothing is degraded.
 */
export function computePartial(endpointId: string, data: unknown, isOpen: (upstream: string) => boolean): PartialOutcome {
  const contribs = secondaryContributions(endpointId);
  const total = 1 + contribs.length;
  if (contribs.length === 0 || typeof data !== 'object' || data === null) {
    return { data, meta: { partial: false, missing: [], degraded_upstreams: [], completeness: 1 } };
  }

  const missing: PartialMissing[] = [];
  let out = data as Record<string, unknown>;
  let cloned = false;

  contribs.forEach((c) => {
    if (!isOpen(c.upstream)) return;
    if (!cloned) { out = clone(out); cloned = true; }
    const removed: string[] = [];
    c.fields.forEach((f) => { if (deletePath(out, f)) removed.push(f); });
    missing.push({
      upstream: c.upstream,
      upstreamName: getUpstream(c.upstream)?.name ?? c.upstream,
      label: c.label,
      fields: c.fields,
      reason: `Upstream "${getUpstream(c.upstream)?.name ?? c.upstream}" is degraded (circuit open); ${c.label.toLowerCase()} was withheld.`,
    });
  });

  const degraded = missing.map((m) => m.upstream);
  const completeness = Math.round(((total - degraded.length) / total) * 100) / 100;
  return {
    data: out,
    meta: { partial: missing.length > 0, missing, degraded_upstreams: degraded, completeness },
  };
}
