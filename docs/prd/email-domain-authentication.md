# PRD: Email Domain Authentication (SPF / DKIM / DMARC)

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Domain auth (SPF/DKIM/DMARC)" preset. The domain-level complement to Email Deliverability Scoring (`email-deliverability-scoring.md`, F-011).

**Status:** Built (prototype is the spec) · **Roadmap:** enhancement layer on F-011 · **Route:** `/console/studio` (preset `email-domain-auth`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Email deliverability (F-011) answers "can I reach this inbox." It does not answer the other half of email trust: "is this domain authenticated to send, and can a third party spoof it." Security teams vetting a vendor, and GTM teams worried about spoofed lookalike domains, need the domain's SPF/DKIM/DMARC posture at a glance. Email Domain Authentication is that domain-level check, layered cleanly beside the mailbox-level deliverability score.

## 2. Goals & Non-Goals
**Goals**
- One domain (or email) in → its email sending-authentication posture: **SPF** record + policy, **DKIM** selectors, **DMARC** policy + coverage.
- A single **anti-spoofing score (0-100)** with a **Strong/Partial/Weak/None** grade and a plain **spoofable** verdict.
- Per-check records and **provenance** (which DNS lookup produced each finding).
- Deterministic per domain; reuses `GET /v1/email/domain-auth` (1 credit), the generic `enrichments` slice, and the Studio renderer — no new page, nav, or store slice.
- **Non-overlapping with F-011:** distinct endpoint, resolver, preset, and result shape; F-011 was left untouched (its PRD flagged this as a deferred add).

**Non-Goals (this phase)** — live DNS resolution (synthetic, deterministic mock); BIMI; MTA-STS/TLS-RPT; per-selector key inspection; bulk domain auditing (that is Bulk Jobs); remediation guidance beyond the spoofable verdict.

## 3. Users & Personas
- **Integrating Developer (land):** checks a domain's auth posture in one call; copies JSON/cURL.
- **Security / Compliance (expand):** confirms a vendor domain enforces DMARC and isn't spoofable before approving.
- **RevOps (expand):** flags lookalike/unprotected domains in a target list.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Tied to win #5 (operator-grade): the actual SPF/DKIM/DMARC records and the exact DNS signal behind each finding, plus a single decisive anti-spoofing score — not a vague "authenticated: yes/no." Complements F-011 so Zinbit covers both inbox reachability and domain trust from one workspace.

## 5. Data Model & Logic
Single source of truth: **`lib/email-domain-auth.ts`** → `checkDomainAuth(domainOrEmail): DomainAuthResult | null`.
- Normalizes protocol/www/path and email-address input to the apex domain, then derives SPF presence/policy, DKIM selectors, and DMARC policy/pct/rua from a deterministic FNV-1a hash — **no `Math.random`**.
- `DomainAuthResult`: `domain`, `score`, `grade`, `spoofable`, `spf`/`dkim`/`dmarc` objects, `checks[]` (per-check status + record), `confidence`, `last_verified`, `provenance[]`.
- Scoring: SPF `-all` 35 / `~all`|`?all` 20; DKIM present 25; DMARC `reject` 40 / `quarantine` 26 / present-only 12. `spoofable` = DMARC not quarantining/rejecting. Grade bands: ≥80 Strong, ≥55 Partial, ≥25 Weak, else None.
- Invariants (unit-tested in `src/lib/__tests__/emailDomainAuth.test.ts`): deterministic; domain/email normalization; score ∈ [0,100]; grade tracks score; spoofable ⇔ no DMARC enforcement; all three checks carry records + provenance.

## 6. API & Gateway
- **Endpoint:** `GET /v1/email/domain-auth` (catalog id `email-domain-auth`, `src/data/endpoints.ts`), param `domain`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `email-domain-auth` case returns `{ success, ...DomainAuthResult }`; no resolvable domain returns `INVALID_DOMAIN`.
- Infrastructure metadata (public DNS), so no PII masking; reuses the `domain` `InputKind`.

## 7. UI
- **Surface:** `toEnrichmentResult` gains a `domainAuthToResult` branch, selected when the response carries a boolean `spoofable` + a `dmarc` object (distinct from F-011's `verdict`-keyed shape).
- **Result card** (Studio `ResultCard`, `kind: 'company'`): title = domain; badges = grade + Spoofable/Protected; fields = SPF, DKIM, DMARC, Anti-spoofing (score/grade), Spoofable; right rail = confidence % + per-check provenance.
- **Preset:** "Domain auth (SPF/DKIM/DMARC)" (`ShieldCheck` icon, company category). **States:** loading, empty (preset prompt), invalid (`INVALID_DOMAIN`), success (the card).

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events recorded in the shared `enrichments` slice. No new event type.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (6 new tests + existing suites) · Playwright smoke: Studio "Domain auth" turns `stripe.com` into an SPF/DKIM/DMARC breakdown with an anti-spoofing score, grade, spoofable verdict, and provenance.

## 10. Deferred
Live DNS resolution; BIMI, MTA-STS, TLS-RPT; per-selector key strength; bulk domain auditing; remediation playbook.
