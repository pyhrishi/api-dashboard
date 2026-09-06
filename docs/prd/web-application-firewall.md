# PRD: Web Application Firewall (WAF)

> Every request to the gateway passes through the edge WAF before it reaches your data. It inspects the URL, headers, and body for known attack signatures and returns `406 Not Acceptable` when a payload trips a rule. The rules the console advertises are the rules the edge enforces — from one shared catalog.

**Status:** Built (prototype is the spec) · **Roadmap:** F-303 (Now → shipped) · **Console:** `/console/waf` · **Source:** `lib/waf-rules.ts` (SSOT) + `src/lib/gateway/waf.ts` (edge)
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
An enterprise API edge must reject hostile input before it reaches application logic or data. The gateway already ran an edge WAF for SQLi and XSS, but the signatures lived inline in `waf.ts` — invisible to customers and un-auditable — and coverage stopped at two attack classes. Security-conscious buyers (the enterprise-expand ICP) ask "what does your firewall actually block, and can I see it?". Developers want to confirm their legitimate payloads won't be falsely blocked. Both need the rule set surfaced, testable, and demonstrably the same set the edge enforces.

## 2. Goals & Non-Goals
**Goals**
- A single rule catalog (categories, signatures, severity) that is the SSOT for *both* the edge and the console — advertised rules == enforced rules.
- Broaden coverage beyond SQLi/XSS to command injection, path traversal, and file inclusion, while preserving every existing block and the bug-bounty safe-harbor bypass.
- A console that lists every enforced rule with a blocked/allowed example, a deterministic client-side payload tester, and a live probe that fires a payload at the real gateway and reads the actual `406`.

**Non-Goals (this phase)** — a learning/anomaly WAF (this is signature-based); per-customer custom rules or allow-lists; rate-based DDoS (F-129/security.ts own that); bot management; a rule-authoring UI; WAF logging analytics (surfaces via Logs).

## 3. Users & Personas
- **Developers (land):** paste a payload, see instantly whether it's blocked and why — confirm real input passes, the 10-minute win.
- **Security / enterprise (expand):** audit exactly what the edge enforces, at what severity, with proof against the live gateway.
- **Security researchers:** the documented Safe-Harbor bug-bounty bypass token to test deep logic without an edge ban.
- **RBAC:** page restricted to `admin | developer` (security surface).

## 4. Differentiation
Table-stakes edge security (the enterprise-trust bar), shipped with the Zinbit differentiator: it's *demonstrable and coherent*. One catalog (`lib/waf-rules.ts`) is imported by both the gateway and the console, so there is no gap between the marketing claim and the enforced reality; the console's live probe fires an actual malicious query at `/api/v1/*` and shows the real `406` the edge returns. Cross-links into the Security Hub and Logs.

## 5. Data Model & Logic
- **`lib/waf-rules.ts`** (SSOT), deterministic (static signatures, no `Math.random`, no state):
  - `WafRule` — `{ id, category, name, severity, description, signatures: RegExp[], safeExample, attackExample }`.
  - `WAF_RULES` — the catalog, ordered CRITICAL → LOW: `WAF_SQLI_DETECTED` (CRITICAL), `WAF_CMDI_DETECTED` (CRITICAL), `WAF_XSS_DETECTED` (HIGH), `WAF_PATH_TRAVERSAL_DETECTED` (HIGH), `WAF_RFI_DETECTED` (HIGH). SQLi/XSS signatures are the exact ones the gateway shipped with.
  - `inspectString(payload)` → first (most-severe) match → `WafVerdict { blocked, reason, category, severity, ruleName }`.
  - `inspectRequest(url, headers, body?)` — composes the payload the way the edge does, then runs the catalog.
  - `ruleCountsBySeverity`, `SEVERITY_RANK`.
- **`src/lib/gateway/waf.ts`** (edge) now imports `WAF_RULES`, iterates the catalog, and returns `WafResult { blocked, reason, threatLevel }` (severity → `threatLevel`). It retains request composition (URL + headers + body) and the `x-bug-bounty-token: bb_test_safespace` safe-harbor bypass. Invoked in the pipeline (`app/api/v1/[...route]/route.ts`) → `406`.
- **State:** none — pure; the live probe uses the org's active key.
- Invariants (unit-tested, `src/lib/__tests__/waf.test.ts`): catalog id-uniqueness + severity ordering; every rule blocks its own attackExample and allows its safeExample; each category detected with the right reason/severity; normal enrichment input (emails, company names, unicode names) passes; determinism; gateway mirror blocks + honours safe harbor; `inspectRequest` inspects the body and never throws on an unserializable body.

## 6. API & Gateway
No new endpoint — the WAF is a pipeline stage. It runs after `resolveEndpoint`, before fraud/billing, and returns `406 Not Acceptable` with the tripped rule id as `error.code`. The console's live probe sends `GET /api/v1/people/phone?email=<payload>` with the org key and reads the `406` + code.

## 7. UI
`/console/waf` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (active rules, critical count, categories covered, `406` block code).
- **Payload tester:** a textarea + preset attack/benign chips; a deterministic client verdict (blocked → rule name, id, severity, "would return 406"; or clean) rendered live via the shared catalog; a **"Probe gateway"** button that fires the payload as a real query param and surfaces the real `406`/code.
- **Rule catalog:** each rule as a card — severity badge, id/category, description, a "Blocks" (attack) and "Allows" (safe) example.
- **States:** loading skeleton; live-probe skeleton; empty-key warning ("generate a key to probe"); clean vs blocked verdicts; safe-harbor note. Framer Motion on verdict + catalog entrance.

## 8. Telemetry
`waf_viewed {rules}`, `waf_rule_tested {blocked, source}`, `waf_live_probe {status, blocked}` — via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (new `waf.test.ts`) · `next build` green (new `/console/waf`) · Playwright smoke (`e2e/waf.spec.ts`) · live: a raw SQLi query to `/api/v1/*` returns a real `406 WAF_SQLI_DETECTED`; a clean query passes.

## 10. Deferred
Anomaly/ML-based detection; customer-defined rules and allow-lists; per-rule enable/disable in the console; WAF event analytics dashboard; geo/IP reputation blocking (security.ts); response-body inspection; rule versioning/changelog. Signature set intentionally kept false-positive-safe on normal API traffic.
