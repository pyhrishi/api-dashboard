# PRD: PII redaction in internal logs

> The gateway's own logs — stdout and the SIEM feed — never carry a caller's PII or a secret. Every internal line is redacted by the org's policy *before* it is serialized, so no unredacted copy ever exists; PII becomes deterministic per-org correlation tokens so incidents stay traceable, secrets become the F-321 `sha256:` fingerprint, and request IDs are never touched. And it is provable, not asserted: the console runs the identical engine in the browser, the gateway serves the last lines exactly as written, and a canary self-test shows zero leaks on every report.

| | |
|---|---|
| **Status** | Built (prototype is the spec) |
| **Owner** | Product (dev7@zintlr.com) |
| **Last updated** | 2026-09-07 |
| **Roadmap** | F-322 |
| **Prototype route(s)** | `/console/log-redaction` · `GET /v1/logs/redaction` · `PATCH /v1/logs/redaction` · `POST /v1/logs/redaction/test` · `X-Log-Redaction` on every gateway response · Security Hub card · Logs privacy drawer link |
| **Source artifacts** | `lib/log-redaction.ts` (SSOT engine + persisted policy store) · `src/lib/gateway/logRedaction.ts` (gateway: policy, metrics, tail, dry run, report) · `src/lib/gateway/logger.ts` (facade) · `app/api/v1/[...route]/route.ts` (meta routes + attribution + header) · `src/lib/gateway/cors.ts` · `src/data/endpoints.ts` (`log-redaction`) · `lib/redaction-engine.ts` (console exports delegate) · `app/console/log-redaction/page.tsx` · `app/console/security/page.tsx` (card) · `app/console/logs/PrivacySettingsDrawer.tsx` · `src/lib/__tests__/logRedaction.test.ts` · `e2e/log-redaction.spec.ts` |

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The gateway logged every request (`API Request Initiated` with the full URL and parameters, fraud warnings with the raw API key) through a logger whose redaction was a private set of four regexes, with no policy, no metrics and no way to see what was actually written. The console had a second, unrelated pattern set for exported request logs, and F-313 had a third definition of PII for response masking. A security reviewer had to accept "we don't log PII" from the DPA. F-322 makes it one engine, the only path to stdout, governed per org, and inspectable end to end.

## 2. Goals & Non-Goals
**Goals**
- **One engine, three runtimes.** A pure, deterministic, Edge/browser-safe engine (`lib/log-redaction.ts`) that the gateway, the console tester and the tests all run, so "what would be written" is computed, not guessed.
- **Redact before write.** `writeLine` in `src/lib/gateway/logRedaction.ts` is the only way a line reaches stdout; it redacts message + context with the org policy, then serializes. `Logger.*` and `logRequest` are facades over it.
- **Still debuggable.** Configurable PII types default to `token`: a per-org deterministic pseudonym (`[email:tk_<12 hex>]`, `sha256(orgSalt:type:normalizedValue)`), so the same email is the same token across lines and days. Request IDs, trace IDs, status codes, durations and paths are never redacted.
- **Secrets as identity.** API keys, bearer tokens, JWTs and secret-shaped fields are written as `[secret:sha256:<16 hex>]` — the same fingerprint every F-321 key registry uses — so a leaked key in a log is identifiable, never recoverable.
- **Governed, with floors, no off switch.** Per-type strategy `partial < token < drop` with an un-relaxable floor per type; government IDs, payment cards, birth dates and secrets are fixed at `drop`. Always-redacted field names (org custom keys + the Logs privacy keys) and an allowlist for non-PII field names (values are still scanned). Retention 7 / 30 / 90 days. A PATCH can only tighten; `enabled: false` is reported as ignored.
- **Provable.** `GET /v1/logs/redaction` returns policy, strength, live metrics, the last 40 lines exactly as written, and a canary self-test (every detector fires, zero raw values survive). The console runs the identical self-test and shows a match badge. `POST …/test` dry-runs any payload without logging it; the console compares its local output byte for byte.
- **Deterministic** everything — no `Math.random`.

**Non-Goals (this phase)** — SIEM forwarder configuration (Splunk HEC / Datadog); NER for names in free text (name *fields* are caught by field name); per-line retention enforcement (retention is policy metadata); audit-log entries for policy changes; redaction of the console's own persisted request logs (the console is the client; F-206 covers export redaction, which now shares these detectors).

## 3. Users & Personas
- **Security / compliance officer (expand):** pulls the attestation — every detector, canary hits, written-as, zero leaks — plus the posture facts, and can spot-check any payload with the dry run.
- **Platform lead:** traces an incident from `X-Request-Id` to the internal line, correlates the same customer across lines by token, never sees the email.
- **Integrating developer (land):** pastes a payload into the tester and sees exactly what the gateway writes; sends a sample request and watches the line land with the same request ID Logs shows.
- **RBAC:** page viewable by `admin | developer | billing`; policy edits `admin` only (UI-gated via `canEditLogRedaction`; the store and the gateway independently enforce floors).

## 4. User Stories & Flows
1. *Developer:* open Log Redaction → paste a request context → right pane shows the redacted line and a findings table (field, type, found by, written as) → "Dry-run at gateway" → "identical output · nothing logged".
2. *Developer:* "Send a sample request" → toast with `X-Log-Redaction: n` → the tail shows the line with `[email:tk_…]` → expand → "Open req_… in Logs" deep-links to `/console/logs?search=<requestId>` (the sample is mirrored into the console request log so the link resolves). Send again → same token.
3. *Admin:* set Email to `partial` → badge "syncing" → "enforced at the gateway" → the next tail line shows `[email:c•••o@…]`. Try to relax Government ID → not offered (fixed).
4. *Admin:* add `internal_note` to always-redacted → `x-vendor-id` etc.; add `name` to the allowlist (company names) → an email inside that field is still caught by the value scan.
5. *Reviewer:* Attestation → "0 plaintext leaks" + "gateway matches your browser" → "Copy attestation" → JSON for the vendor file; "Invite your security reviewer".
6. *No key yet:* banner; tester works locally; tail + attestation show create-a-key empty states (the attestation still shows the browser's own run).

## 5. Functional Requirements
- **FR-1** Every internal gateway log line MUST pass through `writeLine`, which redacts message and context with the org's policy before serialization; no code path writes an unredacted line.
- **FR-2** The engine MUST detect PII by **field name** (F-313 `classifyKey` catalog + secret-shaped names + org custom keys, minus allowlisted configurable types) and by **value** in strings (emails; E.164 and formatted phones with 10–15 digits, excluding ISO/dd-mm-yyyy dates; IPv4; SSN, Aadhaar, PAN; 13–19 digit cards with an issuer prefix and valid Luhn; LinkedIn/X profile URLs; `sk_live_`/`sk_test_` keys, `Bearer` tokens, JWTs).
- **FR-3** Numbers MUST be redacted only when their field name classifies as PII (e.g. `phone: 14155550142`); durations, statuses and timestamps are untouched.
- **FR-4** Strategies MUST render as: `drop` → `[<type>:redacted]`; `token` → `[<type>:tk_<12 hex>]` with `sha256(orgSalt:type:normalizedValue)` (email lowercased, phone digits only); `partial` → `[<type>:<F-313 partial mask>]`; `secret` (any strategy) → `[secret:sha256:<16 hex>]` = `keyFingerprint(value without "Bearer ")`.
- **FR-5** Each type MUST have a floor (`minStrategy`); `government_id`, `credit_card`, `date_of_birth`, `secret` are non-configurable (`drop`). Any below-floor choice from the console store, `normalizeLogPolicy` or a PATCH MUST be clamped/dropped, never applied. There MUST be no master off switch.
- **FR-6** `allowKeys` MUST exempt only key-based classification of configurable types; values in those fields are still scanned. Secret-shaped names MUST be rejected from the allowlist.
- **FR-7** `customKeys`/`allowKeys` entries MUST be lowercased, match `^[a-z0-9_.:-]{1,64}$`, be deduped and capped at 32.
- **FR-8** `redactLogRecord` MUST be pure (input never mutated), return a deep clone, findings with JSON paths (`body.contacts[2].phone`), per-type counts and a total; findings MUST carry only the replacement (`after`), never the removed value.
- **FR-9** The gateway MUST keep, per org (F-321 digest handle): the policy, metrics (lines, findings, by type, last line at) and a newest-first ring buffer of the last 40 lines exactly as written.
- **FR-10** Lines MUST be attributed to an org via `apiKey` passed explicitly or present in the context; the key is fingerprinted in the written line. `requestId` in the context MUST be preserved verbatim. Store mutations take the acting role and are no-ops for non-admins; non-admin console sessions never PATCH the gateway policy.
- **FR-11** `GET /v1/logs/redaction` MUST return `{ org, policy, strength, metrics, tail, selfTest, posture, generatedAt }`; `selfTest` runs `CANARY_RECORD` through the org policy and reports per detector `{ redacted, survived, after }`, `leaks` (detectors with a surviving canary or zero hits) and `passed`.
- **FR-12** `PATCH /v1/logs/redaction` MUST accept `{ strategies?, customKeys?, allowKeys?, retentionDays? }`, clamp to floors, and return `{ policy, strength, ignored[] }` naming every part it did not apply (including `enabled`). Non-object bodies → 400 `VALIDATION_ERROR`.
- **FR-13** `POST /v1/logs/redaction/test` MUST redact the raw body (JSON if parseable, else text) with the org policy, write and count nothing, and cap the body at 16 KB (400 above).
- **FR-14** Every gateway response MUST carry `X-Log-Redaction: <n>` (values stripped from that request's internal lines; `0` until a line is written), CORS-exposed. Every access-log call passes the key so rejected requests (4xx/402/413) are attributed to the caller's org.
- **FR-15** The console tester MUST run the same engine locally with the same org salt (`orgHandleForKey(activeKey)`), cap input at 16 KB, treat non-JSON as text, and compare a gateway dry run byte for byte.
- **FR-16** The console policy MUST include the org's Logs privacy custom keys automatically, sync (debounced) on every change, and show sync state; after each sync it MUST re-read the report.
- **FR-17** The console MUST provide: KPIs (lines, values stripped, leaks, strength), tester with findings table, live tail with expand/copy/deep-link and "Send a sample request" (real call, mirrored into the console request log), admin policy editor, attestation table with copy + reviewer invite, posture facts; every async region has loading, empty and error+retry states.
- **FR-18** Reset Demo Data MUST clear the persisted policy store. The Security Hub MUST show an Internal logs card (leaks, strength, detectors, retention) linking to the page. The Logs privacy drawer MUST link to the page.
- **FR-19** `lib/redaction-engine.ts` (console exports / JsonViewer) MUST classify whole values using the SSOT detectors while keeping its display format.

## 6. Data Model
Single source of truth **`lib/log-redaction.ts`** (pure helpers + one persisted store).

| Entity | Fields | Notes |
|---|---|---|
| `LogPiiType` | `PiiFieldType` (F-313) ∪ `'credit_card' \| 'secret'` | 10 types |
| `LogRedactStrategy` | `'partial' \| 'token' \| 'drop'` | weakest → strongest |
| `LogPiiSpec` | `type, label, minStrategy, defaultStrategy, configurable, valueDetection, description, canary` | `LOG_PII_CATALOG`, ordered by scan priority |
| `LogRedactionPolicy` | `strategies: Record<LogPiiType, LogRedactStrategy>`, `customKeys: string[]`, `allowKeys: string[]`, `retentionDays: 7\|30\|90` | no `enabled` field by type |
| `LogRedactionPatch` | partial of the above | narrowed by `normalizeLogRedactionPatch` |
| `RedactionFinding` | `path, type, detector: 'key'\|'value', strategy, after` | never `before` |
| `RedactLogResult` | `redacted, findings[], counts, total` | |
| `SelfTestCheck` / `SelfTestResult` | `type, label, detector, redacted, survived, after` / `checks, leaks, passed` | |
| `RedactedLogLine` | `id, at, level, message, requestId, findings, types[], preview[], line` | `preview` = first replacements as written; `line` = exact stdout JSON |
| `LogRedactionMetrics` | `lines, findings, byType, lastLineAt` | per org, since isolate start |
| `LogRedactionReport` | `org, policy, strength, metrics, tail, selfTest, posture, generatedAt` | `GET` shape |
| `useLogRedactionPolicy` (store) | policy fields + `setStrategy` (floor-enforced), `add/removeCustomKey`, `add/removeAllowKey` (secret-shaped rejected), `setRetention`, `resetPolicy`, `policy()` | localStorage key `zinbit-log-redaction` |

**Prototype vs production:** gateway state is an in-memory `Map` per isolate (policy, metrics, 40-line tail) → production needs a durable policy store keyed by org, metrics in the observability stack, and the tail read from the log store with the same redaction guarantee. The salt is the org handle → production should use a per-org secret pepper held in KMS (tokens stay deterministic per org, but cannot be brute-forced from public values).

## 7. API Contracts
Auth: `Authorization: Bearer sk_test_…|sk_live_…` (any well-formed key; billing lazily provisions). All three are free (`X-Credits-Cost: 0`), handled before route resolution, and carry the standard envelope `{ success, data | error{code,message}, metadata{requestId,timestamp} }`.

| Method & path | Body / params | 200 `data` | Errors |
|---|---|---|---|
| `GET /v1/logs/redaction` | — | `LogRedactionReport` | — |
| `PATCH /v1/logs/redaction` | `{ strategies?, customKeys?, allowKeys?, retentionDays? }` | `{ policy, strength, ignored[] }` | 400 `VALIDATION_ERROR` (non-object) |
| `POST /v1/logs/redaction/test` | raw JSON or text ≤ 16 KB | `{ redacted, findings, counts, total, org, strength }` | 400 (over cap), 405 (non-POST) |
| every response | — | header `X-Log-Redaction: <n>` | — |

Catalog entry `log-redaction` in `src/data/endpoints.ts` → docs, Explorer, OpenAPI, Postman, CLI.

## 8. Non-Functional
- **Security:** redact-before-serialize; secrets never written in the clear (fingerprint only); findings never carry removed values; dry runs never persist input; the tester input is not persisted in the browser. Production: server-enforced RBAC on PATCH (admin role from a verified JWT), per-org pepper in KMS.
- **RBAC matrix:** view — admin/developer/billing; edit policy — admin (UI + store floors; gateway PATCH accepts any org key in the prototype → production must authorize).
- **Multi-tenancy:** org = F-321 digest handle of the key; policy, metrics, tail and token salt are per org; a different org's policy is untouched by a PATCH (tested).
- **Compliance:** applies to sandbox and live alike (these are our logs); one PII definition shared with response masking (F-313); retention metadata 7/30/90 days.
- **Performance:** the engine is a single pass per string per detector on small log contexts; the tester caps input at 16 KB.
- **Observability:** metrics by type; `X-Log-Redaction` per response; the tail is the audit surface. Telemetry: `log_redaction_viewed`, `log_redaction_tested` (source local|gateway, findings, matches), `log_redaction_policy_updated` (field, type, strategy / action / days / reset), `log_redaction_sample_sent` (status, stripped), `log_redaction_attested` (leaks, lines, strength, matches), `log_redaction_attestation_copied`.

## 9. Dependencies & Integrations
`lib/pii-masking.ts` (`classifyKey`, `maskValue`, `PII_CATALOG`) · `lib/key-hashing.ts` (`sha256Hex`, `keyFingerprint`) · `lib/encryption.ts` (`orgHandleForKey`) · `lib/api-config.ts` (`authHeaderValue`) · `src/data/endpoints.ts` (sample endpoint + its credit cost) · `lib/telemetry.ts` · store `privacySettings.customKeys` + `logApiRequest` (the mirrored sample stores the key's fingerprint, never the plaintext) · Security Hub card · Logs (`?search=<requestId>` deep link added to `app/console/logs/page.tsx`) · Reset Demo Data (`app/console/settings/profile/page.tsx` clears the store).

## 10. Milestones / Phasing
Phase 1 (this): engine + gateway path + console + attestation. Phase 2: SIEM forwarder config + per-org KMS pepper + audit-log entries for policy changes. Phase 3: NER for names in free text; retention enforcement in the log store.

## 11. Success Metrics
`log_redaction_tested` per active org (developer engagement); attestation copies per enterprise deal; zero `selfTest.leaks` in production monitoring; share of orgs with a tightened (`drop`) policy; PATCH `ignored` counts (attempts to weaken).

## 12. Open Questions
Should correlation tokens rotate (e.g. monthly) to limit long-range linkability? Should `retentionDays` have a plan floor (Enterprise ≥ 90)? Should the tail be filterable by level/type in the console?

## 13. Out of Scope
See Non-Goals. Also: redaction of third-party upstream provider logs; client SDK-side logging.

## Verification
`tsc` clean · lint 0/0 · `jest` **16-case** suite (catalog floors; patch narrowing incl. no off switch; strength labels; canary self-test with no raw survivors and preserved request id; URL email + fingerprinted bearer; deterministic/normalized/per-org tokens and all three renderings; phone formats vs dates/timestamps/durations; Luhn + issuer prefix, SSN/Aadhaar/PAN, IP, JWT; allowKeys/customKeys/numbers; purity + array paths; gateway writeLine redacts-before-write with attribution + tail + metrics + token equality with the console salt; tail cap newest-first; floor-clamped sync with `ignored` and per-org isolation; dry run writes nothing + header; Logger/logRequest facades + `redactPII`; console redaction-engine delegation) · Playwright `e2e/log-redaction.spec.ts` (console smoke; tester tokens/drops/fingerprints on JSON; plain-text input + designed empty state; API: real request → header ≥ 1 → report with passing self-test, no raw email/key/canary, tail line tokenized; dry run doesn't count; PATCH floor + `ignored`).

---

## Changelog
- **2026-09-07** — Initial PRD reverse-engineered from the shipped F-322 prototype (dev7@zintlr.com).
