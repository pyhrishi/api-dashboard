/**
 * PII masking meta engine (F-313, phase 2) — the gateway's per-org view of the
 * field-level masking policy.
 *
 * Phase 1 shipped the masking engine (`@/lib/pii-masking`) and had the gateway apply
 * the *default* policy to live-key responses (via privacy.ts). This closes the seam:
 * the console syncs its policy here over `PATCH /v1/masking`, so a live-key caller's
 * response is masked by the org's *chosen* policy — and the gateway advertises which
 * fields it masked with an `X-PII-Masked` header.
 *
 * In-memory, per-isolate, keyed by an org handle derived from the API key (the same
 * shape the other meta modules use). Deterministic; no `Math.random`.
 */

import {
  defaultPolicy, normalizeMaskingPatch, maskPayload, policyStrength,
  type MaskingPolicy,
} from '@/lib/pii-masking';

interface OrgMaskingState {
  policy: MaskingPolicy;
}
const stateByOrg = new Map<string, OrgMaskingState>();

/** The org handle for a key (stable, non-secret) — mirrors the other meta modules. */
export function orgHandleForKey(apiKey: string | undefined): string {
  if (!apiKey) return 'org_demo';
  return `org_${apiKey.slice(-8)}`;
}

function stateFor(orgId: string): OrgMaskingState {
  let s = stateByOrg.get(orgId);
  if (!s) { s = { policy: defaultPolicy() }; stateByOrg.set(orgId, s); }
  return s;
}

/** The effective masking policy for a key's org (default until synced). */
export function getMaskingPolicy(apiKey: string | undefined): MaskingPolicy {
  return stateFor(orgHandleForKey(apiKey)).policy;
}

export interface MaskingUpdateResult {
  policy: MaskingPolicy;
  strength: number;
}

/** Apply a validated policy patch for the key's org (drops invalid/below-floor parts). */
export function updateMaskingPolicy(apiKey: string | undefined, body: unknown): MaskingUpdateResult {
  const s = stateFor(orgHandleForKey(apiKey));
  const patch = normalizeMaskingPatch(body);
  const next: MaskingPolicy = {
    enabled: patch.enabled ?? s.policy.enabled,
    strategies: { ...s.policy.strategies, ...(patch.strategies ?? {}) },
  };
  s.policy = next;
  return { policy: next, strength: policyStrength(next) };
}

/** Mask a payload for a key using its org policy. Returns the clone + masked keys. */
export function maskForKey(payload: unknown, apiKey: string | undefined): { masked: unknown; maskedKeys: string[] } {
  const { masked, maskedKeys } = maskPayload(payload, getMaskingPolicy(apiKey));
  return { masked, maskedKeys };
}

/** Test/demo hook — clear per-isolate policy state. */
export function __resetPiiMasking(): void {
  stateByOrg.clear();
}
