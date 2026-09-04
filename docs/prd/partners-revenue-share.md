# PRD: Partner Revenue-Share Program

| | |
|---|---|
| **Status** | Draft |
| **Owner** | TBD |
| **Last updated** | 2026-09-03 |
| **Prototype route(s)** | `/console/partners`, `/api/v1/partner/*` |
| **Source artifacts** | `app/console/partners/page.tsx`, `src/lib/gateway/partnerRevenue.ts`, partner sub-router in `app/api/v1/[...route]/route.ts` |

> Reverse-engineered from the prototype. It documents what the Partner portal demonstrates today and what production must add to run it at scale.

## 1. Context & Problem
Zinbit is sold both directly and through B2B2B channels — resellers, integration marketplaces (Apollo.io, HubSpot), and VC/affiliate referrers. We need to attribute end-customer revenue to the partner who referred it, compute tiered commissions, and pay partners out reliably. Today there is no system of record for partner economics; this program provides one and surfaces it to the platform operator.

## 2. Goals & Non-Goals
- **Goals:** attribute referred revenue to partners; compute commission per a tiered schedule (incl. accelerators and monthly caps); show partners' month-to-date performance and payout queue; run a month-end payout batch.
- **Non-Goals (v1):** a self-serve *partner-facing* portal (this is the operator's admin view); real money movement UX beyond triggering a batch; partner onboarding/KYC flows.

## 3. Users & Personas
- **Platform admin (operator):** the only role with access — views the program, drills into a partner, triggers payouts. (Prototype gates the page with `<RoleGuard allowedRoles={['admin']}>`.)
- **Partner (indirect):** the subject of the data; no direct access in v1.

## 4. User Stories & Flows
- As an **admin**, I see all partners with tier, lifetime revenue, and pending payout, so I can gauge the program at a glance.
- As an **admin**, I drill into a partner to see MTD revenue/earnings, projected payout, progress to the next tier, recent revenue events, and pending payouts.
- As an **admin**, I trigger a month-end payout batch and see how many payouts and what total were processed.
- Edge/empty: no partners yet → empty state; a partner with no this-month activity → "no revenue events yet"; list/dashboard loading → skeletons; API error → error panel.

## 5. Functional Requirements
- **FR-1** — The system lists all registered partners with `name`, `tier`, `referralCode`, `cumulativeRevenue`, `cumulativeEarnings`, and `pendingPayout`.
- **FR-2** — Selecting a partner shows a dashboard: `thisMonthRevenue`, `thisMonthEarnings`, `projectedPayout`, tier progress (`cumulativeRevenue` vs `nextTierAt`), accelerator status, up to the 10 most-recent revenue events, and pending payouts.
- **FR-3** — Commission per event is computed from the partner's `commissionConfig`: `percentage`/`revenue_share` (`gross × rate`) or `flat_per_call` (`credits × flatRatePerCredit`), plus an accelerator bonus when monthly revenue exceeds `acceleratorThreshold`, capped at `monthlyCap`.
- **FR-4** — A referral is attributed by linking an end-customer API key to a partner's `referralCode`; subsequent billed API calls by that key emit a revenue event crediting the partner.
- **FR-5** — Tiers (`affiliate → silver → gold → platinum → oem`) have distinct rates/caps/accelerators; a partner auto-qualifies for the next tier at defined cumulative-revenue thresholds.
- **FR-6** — An admin can trigger a month-end payout batch; the system returns the number of payouts and the total amount, and marks the included events paid.
- **FR-7** — Program KPIs (active partners, lifetime revenue attributed, pending payouts) are shown in aggregate.

## 6. Data Model
| Entity | Key fields | Notes |
|---|---|---|
| **PartnerRecord** | `partnerId`, `name`, `tier`, `referralCode`, `commissionConfig`, `cumulativeRevenue`, `cumulativeEarnings`, `pendingPayout`, `joinedAt` | one per partner |
| **CommissionConfig** | `type`, `rate`, `flatRatePerCredit?`, `monthlyCap?`, `acceleratorThreshold?`, `acceleratorBonus?` | embedded in PartnerRecord |
| **RevenueEvent** | `eventId`, `partnerId`, `referredApiKey`, `eventType`, `grossRevenue`, `creditsConsumed?`, `commissionEarned`, `timestamp` | one per attributed billable action |
| **PayoutRecord** | `payoutId`, `partnerId`, `amount`, `status`, `periodStart/End`, `events[]`, `createdAt`, `paidAt?` | one per payout period |

Relationships: PartnerRecord 1—N RevenueEvent; PartnerRecord 1—N PayoutRecord; a referred API key maps to exactly one partner.

**Prototype vs production:** stored in per-isolate in-memory Maps in `partnerRevenue.ts` (seeded at import). Production needs durable tables (`partners`, `revenue_events`, `payouts`, `referral_index`), indexes on `partnerId`/`referredApiKey`/`timestamp`, and idempotent monthly-batch bookkeeping.

## 7. API Contracts
Auth: `Authorization: Bearer <key>` (gateway-validated). Envelope: `{ success, data, metadata }`.

| Method | Path | Params | Success | Errors |
|---|---|---|---|---|
| GET | `/v1/partner/list` | — | `{ partners: PartnerRecord[] }` | 401 |
| GET | `/v1/partner/dashboard` | `id` | `PartnerDashboard` | 401, 404 |
| GET | `/v1/partner/lookup` | `code` | `PartnerRecord` | 401, 404 |
| POST | `/v1/partner/attribute` | `api_key`, `referral_code` | `{ success, partnerId, partnerName }` | 400, 401 |
| POST | `/v1/partner/payout/process` | — | `{ payouts_processed, payouts[] }` | 401 |

## 8. Non-Functional
- **Security & Auth:** operator endpoints must be **admin-scoped and server-enforced** (prototype RBAC is client-side). Referral attribution must be tamper-resistant (a customer can't self-assign a partner code for kickbacks).
- **RBAC matrix:** view program / drill-in / process payouts → **admin only**.
- **Multi-tenancy:** the program is platform-wide (operator view); partner data is not tenant-scoped, but referred API keys belong to customer tenants.
- **Financial integrity:** commission math must match the schedule exactly; monthly caps and accelerators applied deterministically; payouts idempotent (no double-pay on retry); full audit trail.
- **Compliance:** payouts imply tax/KYC (W-8/W-9, 1099) and money-movement (Stripe Connect / ACH / SWIFT) — out of prototype scope, required for production.
- **Performance/observability:** dashboards aggregate per partner in <200ms at target volume; revenue-event ingestion is async off the request path.

## 9. Dependencies & Integrations
Billing/metering (source of `grossRevenue`/`creditsConsumed`), the API-key service (for `referredApiKey` ownership), a payments provider (Stripe Connect), and tax/compliance vendors.

## 10. Milestones / Phasing
- **Phase 1:** durable data model + attribution + commission engine + operator dashboard (parity with prototype).
- **Phase 2:** real payout execution (Stripe Connect) + tax/KYC + audit exports.
- **Phase 3:** partner-facing self-serve portal + referral-link tooling + statements.

## 11. Success Metrics
% of channel revenue correctly attributed; commission calculation error rate (target 0); time-to-payout; partner-reported disputes; channel-sourced revenue growth.

## 12. Open Questions
- Attribution model: first-touch vs last-touch vs multi-touch? Attribution window?
- Clawbacks on refunds/chargebacks — how are negative revenue events handled?
- Currency & FX for international partners.
- Who approves payout batches (maker/checker)?

## 13. Out of Scope
Partner onboarding/KYC UX, partner-facing analytics, marketplace listing management, contract/OEM negotiation workflows.

---

## Changelog
- **2026-09-03** — Initial PRD reverse-engineered from the `/console/partners` prototype and `partnerRevenue.ts`. (prd skill)
