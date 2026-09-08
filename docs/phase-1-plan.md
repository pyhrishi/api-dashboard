# Zinbit — Phase 1 Launch Plan (War Room, 5 Days)

> **Visual blueprint:** https://claude.ai/code/artifact/8dbdc249-5c7a-4f41-8851-f67b3c01c521
> **Team:** 2 frontend (FE·1, FE·2) + 2 backend (BE·1, BE·2) · **Window:** 5 full working days · **Owner:** dev7@zintlr.com

This repo is the *finished-product* prototype (95 console pages, 17 admin pages, 173 endpoints,
40+ gateway modules). **Phase 1 is not a slice of it — it is the single closed loop underneath it.**
Everything built in week one serves that loop and nothing else.

---

## 1. The thesis — the one loop

> A developer self-serves a key and gets a **verified, billed, logged** enrichment call in **under ten minutes**.

```
Sign up → Create sk_test_ key → First /v1/enrich call → Billed & logged → Go live (sk_live_, masked PII)
```

**The seam must close in week one.** A key created in the console must authenticate and bill against the
*real* `/api/v1` gateway — not a mock. Billing lazily provisions any well-formed `sk_test_`/`sk_live_` key
(mirrors `src/lib/gateway/billing.ts`). If the seam works, Phase 1 is real. **It is integrated Tuesday, not Friday.**

### Scope collapse

| Surface | Finished product | Phase 1 |
|---|---:|---:|
| Console pages | 95 | **36** (≈38%) |
| Admin areas | 17 | **6** (≈35%) |
| API endpoints | 173 | **6** |
| Gateway stages | 40+ | **7** |
| Nav modules | 13 | **11** |

> **Scope note (revised):** Phase 1 was widened from the initial 9-page core to ~36 console pages
> (≈38% of the product) so the launch prototype reads as a real, coherent product rather than a
> skeleton — while still holding the line that the *closed loop* (sign-up → key → call → bill → mask →
> log) is what must be provably working end-to-end. The added modules (Credentials, Explore,
> Enrichment, Jobs, Traffic, Match, Quality, Security, Operations, Business, Resources) are the depth
> around that loop; the truly heavy deferred tracks (growth/PLG cockpit, GraphQL/gRPC, partners, data
> sharing, the full security-governance console, admin forensics) remain Phase 2–4.

---

## 2. Scope — in vs deferred

### In Phase 1

- **Identity:** sign-up, login, org auto-create, session, 3-role RBAC (`admin | developer | billing`).
- **Keys:** create / reveal-once / revoke · `sk_test_` & `sk_live_` · live-key approval gate.
- **The call:** Endpoint Explorer + Enrichment Studio → **real** `/api/v1` fetch, real response.
- **Observe:** replayable Logs · Usage & Analytics (calls, credits, cost-per-endpoint).
- **Money:** Billing & Credits — wallet balance, plan, consumption, top-up.
- **Docs:** catalog-driven API reference for the 6 live endpoints + copy-paste snippets.
- **Admin:** Overview, Customers, Wallets & Ledger, Health, Approvals.
- **Compliance:** live-key PII masking on by default (DPDP/GDPR baseline).

### Deferred (Phase 2–4, directional)

Growth/PLG (funnel, journey, lifecycle, churn, instrumentation) · Jobs & webhooks (bulk, export, async,
streaming) · Request optimization (idempotency, coalescing, compression, field selection) · Quality &
coverage (SLA, benchmarks, re-verification, corrections, golden records) · Security console (WAF,
encryption config, log-redaction UI, CORS, sessions, MFA UI) · Protocols (GraphQL, gRPC, preview) ·
Platform (partners, data sharing, roadmap, changelog, support, legal) · Admin ops (abuse, alerts,
messaging, funnel, token forensics, audit).

**Rule:** if a screen doesn't touch the sign-up → call → bill loop, it waits. Each deferred surface *wraps*
the closed core later without reopening the seam.

---

## 3. Console — 33 nav destinations · 36 surfaces across 11 modules (from 95)

The scoped console re-renders the **real** production pages behind a Phase-1-only navigation
(`app/phase-1/console/*` — each a one-line re-export; nav driven by a scoped `nav-config.tsx`),
inside a clone of the real console shell so the full chrome is intact: ⌘K Omnibar, notification
bell, sandbox/live toggle, credit-health bar, theme toggle, tenant switcher, growth-alert + nudge
watchers, and the MFA / trial-activation / impersonation banners.

| Module | Pages |
|---|---|
| _(pinned)_ | Overview |
| **API Keys** (hub) | Tabbed: Keys · Scopes · Usage · Kill Switch — 4 surfaces, 1 sidebar entry |
| **Explore & Build** | Endpoint Explorer · Enrichment Studio · Preview Program |
| **Enrichment & Identity** | Identity Resolution · Company Hierarchy · Account Grouping |
| **Jobs & Delivery** | Bulk Jobs · Bulk Export · Webhooks |
| **Traffic & Rate Limits** | Rate Limits · Throughput Tiers |
| **Match & Coverage** | Match Rate · Coverage Gaps |
| **Data Quality** | Quality SLA · Corrections |
| **Security & Compliance** | Security Hub · PII Masking · MFA Enforcement · API Regions · Sessions |
| **Operations & Monitoring** | Usage & Analytics · Logs · Request Inspector · Alert Center · Infrastructure |
| **Business & Billing** | Billing · Cost Calculator |
| **Resources & Account** | Docs · Changelog · Support · Settings |

Every screen ships designed **empty / loading (skeleton) / error** states, semantic tokens (no hardcoded
colors), RBAC gating, and org-scoped multi-tenant data. That is the Phase 1 bar, not a Phase 2 nicety.

## 4. Admin — 6 areas (from 17)

Scoped clone of the production `AdminShell` chrome (operator identity, role-filtered nav, mobile
Drawer, session guard → `/admin/login`), re-rendering the real admin pages.

| Group | Pages |
|---|---|
| **Operate** | Overview · Customers (list + detail) |
| **Wallets & Ledger** | Wallets · API Ledger |
| **Govern** | Approvals (live-key gate) · Account Health |

`Adjust credits` in admin writes to the **same ledger** the gateway meters against — one source of truth
across console and admin.

---

## 5. API surface — 6 endpoints, 7-stage pipeline

**Every `/api/v1` request runs the real gateway:**

```
01 Auth (middleware) → 02 Rate limit (token bucket) → 03 Meter (billing) →
04 Route (router) → 05 Enrich (deterministic graph) → 06 Mask (PII on sk_live_) → 07 Log (logger)
```

| Method | Endpoint | Returns | Cost |
|---|---|---|---:|
| POST | `/v1/enrich/person` | email/phone/LinkedIn → contact record | 2 cr |
| POST | `/v1/enrich/company` | domain → firmographics | 1 cr |
| POST | `/v1/resolve/identity` | cross-identifier resolution | 2 cr |
| GET | `/v1/identity/director` | registry-verified director (MCA CIN/DIN) — **the differentiator** | 3 cr |
| GET | `/v1/company/{cin}` | government-registry company (IDS engine) | 3 cr |
| GET | `/v1/usage` | credits consumed / remaining / per-endpoint | free |

**Deferred from the pipeline:** WAF, circuit breaker, cache/coalescing, idempotency, compression, async
jobs, webhook delivery, partner revenue, opt-out engine. They wrap this core later without changing it.

**Masking demo (compliance-by-default):** the same call on `sk_test_` returns full synthetic PII; on
`sk_live_` the phone is masked (`+91 98••••••21`). Sandbox is unmasked, live is masked — enforced at stage 06.

---

## 6. The 5-day war-room plan

Four lanes, one critical path. Auth unblocks everything → Monday. The seam is integrated Tuesday.

| | **Mon** — Foundations | **Tue** — Key + Call | **Wed** — Truth + Money | **Thu** — Operate | **Fri** — Seal + Ship |
|---|---|---|---|---|---|
| **FE·1** _App & Identity_ | App shell + tokens, auth screens, RBAC, dark/light | API Keys page (create/reveal/revoke) | Logs + Usage & Analytics | Admin shell + Customers | Golden-path QA, states, a11y, bug bash |
| **FE·2** _Product & Admin_ | Console shell + Overview (skeleton/empty) | Studio + Explorer → live `/v1` fetch | Billing + Docs (catalog-driven) | Admin: Wallets, Health, Approvals + Settings | Seed data + demo dry-run |
| **BE·1** _Auth & Identity_ | Auth + schema (orgs, users, keys, wallets, logs) | Key lifecycle (hash-at-rest, reveal-once) + wallet | Registry + resolve + PII masking | Admin APIs (customers, ledger, adjust, approvals) | Harden + close seam + staging deploy |
| **BE·2** _Gateway & metering_ | Gateway skeleton (key-validation, token bucket, logging) | Enrich endpoints (person/company) + metering | Usage aggregation + credit ledger + top-up | Health + approval flow + hardening | Load test (p99), rate-limit tuning, final integration |

### Integration checkpoints — the daily "is it real?" test

| When | Gate | Test |
|---|---|---|
| Mon EOD | Auth works | signup → session → RBAC route |
| **Tue EOD** | **The seam closes** | **console key → 200 from `/v1`** |
| Wed EOD | Call is metered | billed · masked · in Logs |
| Thu EOD | Operator loop | admin sees + adjusts credits |
| Fri PM | Golden path green | deployed to staging |

### Risks managed on purpose

- **CRITICAL — the seam is the whole thesis.** Billing must lazily provision any well-formed key so
  console and gateway agree with no handshake. _Mitigation: integrate Tuesday; Tue-EOD is a hard gate._
- **CRITICAL — auth is the critical path.** All four lanes depend on it. _Mitigation: BE·1 does nothing
  else Monday; shared TypeScript contract agreed at hour zero._
- **WATCH — deterministic enrichment graph.** Same input must always return the same record, or Logs
  replay and demos break. _Mitigation: seed a fixed graph._
- **WATCH — scope creep from the prototype.** 95 finished pages are a constant temptation. _Mitigation:
  §2 is the contract; anything off the loop is a Phase-2 ticket, logged not built._

---

## 7. Definition of done — the golden path

Phase 1 has shipped when a new developer can walk this on staging **without a human unblocking them**:

1. **Sign up cold** → org auto-created → Overview with a designed empty state.
2. **Mint `sk_test_`** → revealed once, copied; reload and only the prefix remains.
3. **First call in Explorer → 200** → real `/v1/enrich/person`, full sandbox data.
4. **Call appears in Logs** → replayable, with request/response/latency/cost.
5. **Request a live key → admin approves** → live call returns **masked** PII.
6. **Credits decrement everywhere** → one ledger; balance drops identically in Overview, Usage, Billing.
7. **Admin sees the org and tops it up** → adjustment reflects in the developer's wallet in real time.

**Quality bar every screen clears:** empty/loading/error states · light + dark via tokens (no hardcoded
colors) · RBAC-gated · org-scoped multi-tenant · actionable error messages · p99 within target under load.

---

_After Phase 1, the same architecture absorbs the deferred surfaces without rework — each wraps the closed
core; none of it reopens the seam._
