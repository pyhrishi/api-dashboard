# PRD: Admin Panel — B2B2B operations console

> A **separate internal application** (not a mode of the customer console) for Zintlr staff — ops, support, sales, finance — over every B2B2B customer: the funnel with its KPIs and sales triggers, a working "preview as customer" mode, full token management, a metadata-only API ledger with status-code and cost breakdowns, wallet trends with early-exhaustion projection, and access requests as a one-pager with logs. Section **E. Admin Panel** of the product requirements.

| | |
|---|---|
| **Status** | Built — complete prototype as a **standalone app** (`/Users/admin/Desktop/zinbit-admin`, port 3200); the prototype is the spec. Production home: the internal admin repo behind Zintlr SSO |
| **Deployment** | **Separate app** (decision 2026-09-08): its own repo and deployment behind Zintlr internal SSO + MFA, consuming the shared auth service and the products' admin APIs. Not part of the customer console. |
| **Owner** | Product (dev7@zintlr.com) |
| **Last updated** | 2026-09-08 |
| **Roadmap** | F-575 (super-admin impersonation), F-521 (AE handoff triggers), F-509 (PQL scoring), F-191 (per-key usage attribution), F-236 (billing & quota events), F-168 (spend caps), F-351 (RBAC) |
| **Prototype route(s)** | **zinbit-admin:** `/login` (mock SSO + role) · `/overview` · `/funnel` (funnel, triggers, handoffs) · `/customers` · `/customers/[id]` (Tokens · Ledger · Wallet · Access · Audit + Preview as customer) · `/tokens` · `/ledger` · `/wallets` · `/access-requests` · `/access-requests/[id]` · `/audit` · mock admin API `/api/admin/*`. **Customer console consumer:** `/console/preview-session?token=…` + `components/ImpersonationBanner.tsx`. Customer-facing precedents reused for conventions: `/console/keys` (create · revoke · roll · IP allow-list · credit limit · expiry), `/console/key-usage`, `/console/logs` (timeframe + status filter, shows bodies), `/console/analytics` (4xx/5xx by endpoint), `/console/billing` (quota forecast), `/console/growth` (funnel KPIs, F-530), `/console/partners`, `/console/trial-gate` (challenge ledger + overrides) |
| **Related PRDs** | [PLG KPI framework](./growth-kpi-framework.md) (funnel & KPIs — item 1 is covered there) · [Risk-based phone OTP](./auth-risk-based-phone-otp.md) (access at activation) · [API keys hashed at rest](./api-keys-hashed-at-rest.md) · [Last-used & usage per key](./last-used-and-usage-per-key.md) |

## 1. Context & Problem
Zintlr staff have no single place to run the B2B2B business. Funnel questions are answered in the customer-facing Growth dashboard, but there is no operator view across customers and no trigger that hands a hot account to sales. Support manages customer tokens by asking the customer to do it. Finance sees wallet balances only per account and only after the fact, so wallets hit zero before anyone notices. Access requests arrive as tickets with no timeline. And the one operator affordance that exists today — **preview mode for a B2B2B customer** — is broken: the customer's secret key is rendered as a masked string, and that masked value is then used to call the sandbox, so every preview request fails authentication. (The same defect class was fixed in the customer console: keys are stored as real header-safe tokens and masked only at display time; the admin preview still renders the mask and passes it through.)

## 2. Goals & Non-Goals
**Goals**
1. **Funnel & KPIs (item 1).** One admin view of the entire funnel with the key KPIs — delivered by the *Advanced Analytics* work (PLG KPI framework) and surfaced in the admin panel as the cross-customer view, not rebuilt.
2. **Sales triggers.** When an account crosses a defined funnel stage or usage threshold, fire a trigger to the sales team with the evidence, and record the handoff.
3. **Preview mode that works.** "Preview as customer" for a B2B2B account renders the real (or a scoped, short-lived impersonation) key so sandbox calls succeed; the secret is never shown in the clear beyond the one-time reveal convention.
4. **Token management.** Create, edit, delete, update status (active / suspended / revoked), edit IP allow-list, regenerate (roll), and update limits (credit cap, rate tier, expiry) for any customer's keys, with audit.
5. **Key insight.** Flag keys that are near expiry **and** in use, so nobody's production traffic dies on a calendar date.
6. **API ledger.** Time-frame-based view of every call per customer with a status-code breakdown and a consumption & cost view — **metadata only**, never the response body.
7. **Trends.** Consumption rate over time and wallet balance vs usage, with a projection of *early* exhaustion (or delayed, when usage slows) relative to the current top-up cadence.
8. **Wallet insight.** Flag wallets below 10 % of their last top-up value and wallets that have hit 0.
9. **Access requests.** A one-pager per request (who, what, why, status, decision) with its full log.

**Non-Goals (this phase)** — replacing the customer console (customers keep self-service); billing/invoicing itself (finance system of record); custom alert rules beyond the defined triggers (F-194); AI recommendations beyond the deterministic insights above.

## 3. Users & Personas (internal)
- **Ops / Support engineer:** fixes a customer's key, whitelists an IP, extends an expiry, previews the customer's sandbox to reproduce an issue.
- **Sales / AE:** receives triggers ("account X crossed 10k calls on a trial", "wallet < 10 %"), sees the funnel position and consumption before the call.
- **Finance:** wallet trends, exhaustion projections, cost view per customer.
- **Trust & Safety:** access requests, status changes, audit trail (shares the override/ledger conventions of the trial gate).
- **RBAC (internal):** `superadmin` (all), `ops` (tokens, preview, ledger), `sales` (read funnel, triggers, trends), `finance` (wallets, cost). Roles come from Zintlr internal SSO groups; every mutation is audit-logged with actor + reason.

## 4. User Stories & Flows
1. *Sales* opens the funnel view → filters to accounts that moved to "activated" this week with > 5k calls → a trigger already created a task with the account card; they mark it "contacted".
2. *Support* opens customer *Meridian Labs* → Tokens tab → sees "key `sk_live_…a4b1` expires in 6 days and served 41k calls last week" (near-expiry-and-in-use insight) → extends expiry, adds an IP, saves; the audit row shows who and why.
3. *Support* clicks **Preview as customer** → the console opens as that customer in sandbox; the Explorer runs a real sandbox call and it **succeeds**, because the impersonation key is a real token, not the masked display string.
4. *Finance* opens Wallets → sorted by "projected exhaustion" → *Helioz* will exhaust 9 days before its usual top-up → flags it to sales; *Contoso* has been at 0 for 3 days → the insight was already emitted as `wallet_hit_zero`.
5. *Ops* opens the API ledger for a customer → last 7 days → status-code breakdown (200 / 402 / 429 / 5xx) and cost by endpoint → drills into one request and sees **metadata only** (time, endpoint, status, latency, credits, key fingerprint, region, request id) — no response body anywhere in the admin panel.
6. *T&S* opens Access Requests → a one-pager: requester, account, what was requested (live key / higher limit / region), justification, risk evaluation, decision, and the timeline log → approves with a reason.

## 5. Functional Requirements
**Funnel & triggers**
- **FR-1** The admin funnel view MUST reuse the PLG KPI framework's stage definitions and KPIs (TOFU / MOFU / BOFU, drop-off, time-to-activate, power-user bands) computed **across all customers**, filterable by product, plan, region and date range.
- **FR-2** Sales triggers MUST be configurable rules of the form *stage crossed* or *metric threshold crossed* (e.g. activated + calls ≥ N in 7 days; trial usage ≥ 80 %; wallet < 10 %) that create a **handoff record** (account, trigger, evidence, owner, state: new → contacted → converted/closed) and emit an event to the sales channel (Slack / CRM webhook). Each trigger fires at most once per account per rule per 30 days.

**Preview mode**
- **FR-3** Preview as customer MUST use a real, header-safe token: either the customer's stored token (server-side, never rendered) or a **scoped impersonation key** minted for the session (sandbox only, 30-minute TTL, audit-logged), so every sandbox call from preview authenticates.
- **FR-4** The admin UI MUST render secrets masked at display time only (`sk_test_••••abcd` + `sha256:` fingerprint) and MUST never pass a masked display string into any request. A test MUST assert that the Authorization header sent from preview is a valid `sk_test_`/`sk_live_` token.
- **FR-5** Preview MUST be visibly labelled ("Viewing as Meridian Labs — sandbox — expires in 27 min") with a one-click exit, and every action taken in preview MUST be attributed to the operator in the audit log.

**Token management**
- **FR-6** Operators MUST be able to create, edit (name, scopes), delete, change status (active / suspended / revoked), edit the IP allow-list, regenerate (roll with overlap window), and update limits (credit cap, rate tier, expiry) for any customer key. Each mutation requires a reason and is audit-logged; regenerate shows the new secret once (one-time reveal convention) and syncs to the gateway registries (billing, scopes, kill switch, rate limits — all keyed by digest).
- **FR-7** Key insight: a key is **near expiry and in use** when `expiresAt − now ≤ 14 days` (configurable) AND it served ≥ 1 request in the last 7 days. It MUST be listed at the top of the customer's tokens and on the operator home, with "extend 90 days" and "notify customer" actions.

**API ledger**
- **FR-8** The ledger MUST list requests per customer for a selected time frame (15 m / 1 h / 24 h / 7 d / 30 d / custom) with: timestamp, endpoint, method, status, latency, credits charged, key fingerprint, region, request id, cache/idempotency flags. **No request or response body** is stored in or served to the admin panel.
- **FR-9** The ledger MUST show a **status-code breakdown** (2xx / 4xx by code / 5xx) for the selected frame, and a **consumption & cost view**: calls and credits by endpoint and by key, total cost at the customer's plan rate, and cost per successful match.
- **FR-10** Export of the ledger MUST be metadata-only CSV/JSON (same fields as FR-8).

**Trends & wallet insight**
- **FR-11** Trends MUST show consumption rate (calls/day and credits/day, 7- and 30-day rolling) and **wallet balance vs usage** on one chart, with a projection line: at the trailing-7-day burn, the wallet exhausts on date D; compared with the account's top-up cadence (median gap between top-ups), label it **early** (D before next expected top-up), **on track**, or **delayed** (usage slowed).
- **FR-12** Wallet insights MUST flag: **below 10 %** of the last top-up value (`balance < 0.10 × lastTopUpAmount`) and **hit 0** (`balance ≤ 0`, with time-at-zero). Both emit events (`wallet_below_10pct`, `wallet_hit_zero`) usable by FR-2 triggers, and appear on the operator home.

**Access requests**
- **FR-13** Every access request (live key, limit increase, region, enterprise feature, trial-gate override) MUST have a one-pager: requester, account, what/why, risk context (trial-gate evaluation, wallet, usage), current status, decision + reason + actor, and a chronological **log** of every state change and comment. Approve/deny require a reason; the log is immutable.

**Cross-cutting**
- **FR-14** Every mutation in the admin panel is audit-logged (actor, account, action, before/after, reason) and exportable per customer.
- **FR-15** The admin panel is a separate application with its own deployment, behind Zintlr internal SSO + MFA (roles per §3). It never shares a session, cookie domain or bundle with the customer console; it talks to the products through authenticated admin APIs (§7) and to the shared auth service for preview/impersonation.
- **FR-16** Preview as customer (FR-3) MUST open the *customer console* in a new tab with the scoped impersonation token — the admin app does not re-implement customer screens.

## 6. Data Model
| Entity | Fields | Notes |
|---|---|---|
| `CustomerAccount` | `id, name, domain, productIds[], plan, region, createdAt, activatedAt, funnelStage, owner (AE)` | joins customer orgs across products |
| `SalesTrigger` (rule) | `id, name, condition: { stage?, metric?, op, value, windowDays }, channel, owner, enabled, cooldownDays (30)` | |
| `Handoff` | `id, accountId, triggerId, firedAt, evidence, state: new\|contacted\|converted\|closed, ownerId, notes[]` | |
| `ImpersonationSession` | `id, operatorId, accountId, env: 'sandbox', keyFingerprint, startedAt, expiresAt (30 min), endedAt, actions[]` | FR-3/5 |
| `ManagedKey` | customer `MockKey` fields + `status: active\|suspended\|revoked, rateTier, creditLimit, allowedIps[], expiresAt, lastUsedAt, requests7d` | never stores plaintext (F-321) |
| `KeyInsight` | `keyId, kind: 'near_expiry_in_use', daysLeft, requests7d, at` | FR-7 |
| `LedgerEntry` | `requestId, accountId, keyFingerprint, ts, method, endpoint, status, latencyMs, credits, region, cache, idempotent` | metadata only |
| `WalletSnapshot` | `accountId, balance, lastTopUpAmount, lastTopUpAt, burn7d, burn30d, projectedExhaustAt, topUpCadenceDays, label: early\|on_track\|delayed` | FR-11/12 |
| `AccessRequest` | `id, accountId, requesterId, type, payload, justification, riskContext, status, decision?, log: { at, actor, action, note }[]` | FR-13 |
| `AuditEntry` | `id, actorId, accountId, action, before, after, reason, at` | FR-14 |

## 7. API Contracts (admin service, internal — Zintlr SSO)
| Method & path | Purpose |
|---|---|
| `GET /admin/funnel?product&plan&region&from&to` | cross-customer funnel + KPIs (reuses KPI framework computations) |
| `GET/POST/PATCH /admin/triggers`, `GET/PATCH /admin/handoffs` | FR-2 |
| `POST /admin/accounts/:id/preview` → `{ sessionId, token (once), expiresAt }`; `DELETE /admin/preview/:sessionId` | FR-3 |
| `GET /admin/accounts/:id/keys`; `POST …/keys`; `PATCH …/keys/:keyId` (name, scopes, status, allowedIps, creditLimit, rateTier, expiresAt); `POST …/keys/:keyId/regenerate`; `DELETE …/keys/:keyId` | FR-6, reason required |
| `GET /admin/insights/keys?kind=near_expiry_in_use` | FR-7 |
| `GET /admin/accounts/:id/ledger?from&to&status&endpoint&key&cursor`; `GET …/ledger/summary` (status breakdown, cost by endpoint/key); `GET …/ledger/export` | FR-8–10, metadata only |
| `GET /admin/accounts/:id/wallet/trend`; `GET /admin/insights/wallets` | FR-11–12 |
| `GET /admin/access-requests`, `GET …/:id`, `POST …/:id/decision { action, reason }`, `POST …/:id/comments` | FR-13 |
| `GET /admin/audit?accountId&actor&from&to` | FR-14 |

## 8. Non-Functional
Security: separate internal auth (SSO + MFA), least-privilege roles, impersonation keys sandbox-only and short-lived, no response bodies at rest in the admin store, secrets shown once. Privacy: ledger holds only metadata; PII from request parameters is not stored (consistent with F-322 internal-log redaction). Performance: ledger paginated by cursor; summaries precomputed per hour. Observability: every trigger fire, preview session and override emits an event. Reliability: trigger evaluation idempotent per account/rule/cooldown.

## 9. Dependencies & Integrations
PLG KPI framework (`lib/growth-kpis.ts`) for funnel definitions · key registries keyed by digest (F-321) · kill switch / scopes / rate-limit / billing gateway modules · trial-gate evaluation for access-request risk context · Slack / CRM webhook for sales triggers · Zintlr SSO.

## 10. Milestones / Phasing
0. **Prototype (done):** standalone `zinbit-admin` app — engines (`lib/admin/insights.ts`), deterministic seed, in-memory service with RBAC + mandatory reasons + audit + one-time secrets, mock admin API, all screens, jest (11 cases) + Playwright (4 specs). Preview mode mints a real `sk_test_` token, returned once (never stored in the session record), and the console's `/console/preview-session` adds it as a sandbox key and shows the "Viewing as …" banner — sandbox calls succeed.
1. **Fix preview mode in production** (FR-3–5) — the only broken production behavior; ship first, using the prototype's contract.
2. Token management + near-expiry-in-use insight (FR-6–7) and the metadata-only ledger with status/cost views (FR-8–10).
3. Wallet trends + insights and sales triggers with handoffs (FR-2, 11–12); funnel view wired to Advanced Analytics (FR-1).
4. Access requests one-pager + audit export (FR-13–14).

*Prototype plan:* a **new standalone Next.js app** (same stack and design tokens as this console, its own repo) with its own mock admin API: customer list → customer detail (Tokens · Ledger · Wallet · Access) · Funnel & Triggers · Access requests · Preview mode that opens this customer console with a real sandbox token. This repo contributes the admin API contracts (§7) and, where useful, exports of the shared engines (`lib/auth/*`, `lib/growth-kpis.ts`, key hashing).

## 11. Success Metrics
Preview-mode sandbox call success rate = 100 % · median time for support to fix a token < 5 min · % of keys that expired while in use → 0 · sales handoffs created per week and conversion of triggered accounts · wallets reaching 0 unnoticed → 0 · access-request median decision time.

## 12. Open Questions
- Which CRM/Slack channel do sales triggers post to, and who owns trigger definitions (Growth or Sales ops)?
- Exact thresholds: near-expiry window (14 days?), "in use" (≥ 1 call / 7 days?), wallet 10 % of *last top-up* vs of *plan allowance*.
- Should impersonation ever be allowed against **live** (billed) environments, or sandbox-only forever?

## 13. Out of Scope
Customer-facing changes; invoicing; custom alert rules (F-194); notification delivery infra (reuse F-250 Slack app when built).

---

## Changelog
- **2026-09-08** — Authored from section E. Admin Panel of the product requirements (funnel & KPIs via Advanced Analytics, sales triggers, broken B2B2B preview mode, token management, near-expiry-in-use insight, metadata-only API ledger with status/cost views, wallet trends and insights, access-request one-pager). (dev7@zintlr.com)
- **2026-09-08** — Decision: the admin panel is a **separate app**, not a console mode. Added Deployment row, FR-15/16, standalone prototype plan; removed the open question. (dev7@zintlr.com)
- **2026-09-08** — Built the complete prototype as the standalone `zinbit-admin` app (sibling repo) plus the console-side preview consumer. Status → Built. Deviations from the draft: trigger rules are the five seeded rules with editable thresholds/enable/channel (no free-form rule builder yet); ledger export is the first 200 rows of the frame; wallet 10 % is measured against the *last top-up* (open question resolved by default). (dev7@zintlr.com)
