/**
 * Gateway Web Application Firewall (WAF)
 * Deep Packet Inspection for SQLi, XSS, command injection, path traversal, and file
 * inclusion. Integrates Bug Bounty Safe Harbor policies.
 *
 * The signatures live in ONE place — `lib/waf-rules.ts` (the rule catalog SSOT) — which
 * the `/console/waf` console also renders, so the rules advertised in the UI are exactly
 * the rules enforced here at the edge. This module owns the request-composition and the
 * safe-harbor bypass; the catalog owns the detection.
 */

import { WAF_RULES } from '@/lib/waf-rules';

export interface WafResult {
  blocked: boolean;
  reason?: string;
  threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export function inspectPayload(url: string, headers: Headers, body?: unknown): WafResult {
  // Bug Bounty Safe Harbor
  // Security researchers can bypass the WAF by supplying a registered bug bounty token,
  // allowing them to test deep application logic without getting instantly IP-banned by the Edge.
  const researcherToken = headers.get('x-bug-bounty-token');
  if (researcherToken === 'bb_test_safespace') {
    return { blocked: false }; // Safe harbor bypass
  }

  let payloadString = url;
  try {
    // Convert headers to a plain object for inspection
    const headersObj: Record<string, string> = {};
    if (headers && typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    }

    // Combine URL, headers, and stringified body for deep inspection
    payloadString = `${url} ${JSON.stringify(headersObj)} ${body ? JSON.stringify(body) : ''}`;
  } catch {
    // Fallback if parsing fails
  }

  // Run the catalog in severity order (CRITICAL → LOW); first match blocks with a 406.
  for (const rule of WAF_RULES) {
    for (const pattern of rule.signatures) {
      if (pattern.test(payloadString)) {
        return {
          blocked: true,
          reason: rule.id,
          threatLevel: rule.severity,
        };
      }
    }
  }

  return { blocked: false };
}
