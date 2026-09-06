# PRD: Catch-All Domain Detection

> A domain-level deliverability check: `GET /v1/email/catch-all` and its Studio preset, sharing one catch-all decision with email verification (`lib/catch-all-detector.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-049 (Next → shipped) · **Endpoint:** `GET /v1/email/catch-all` · **Preset:** Studio → "Catch-all detection"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A catch-all (accept-all) domain accepts mail for *any* local part, so an SMTP RCPT probe to a made-up mailbox is accepted — which means per-address verification is inconclusive there. Verify Email Deliverability already carries an `is_catch_all` boolean, but there's no way to ask the question *of a domain* up front, and no guidance on what to do about it. Catch-all domain detection makes it a first-class, domain-level check with evidence and guidance — and makes catch-all a single source of truth so the two features can never disagree.

## 2. Goals & Non-Goals
**Goals**
- `GET /v1/email/catch-all?domain=` returns a decisive status (catch-all / not catch-all / unknown), confidence, MX provider, the random-mailbox probe result, per-signal evidence, and guidance.
- **Single-source the catch-all decision** so a per-address verify and this detector always agree.
- Ship as a Studio preset with a status + evidence panel.

**Non-Goals (this phase)** — a live SMTP probe against real servers (deterministic model); per-mailbox verification (that's Verify Email Deliverability); greylisting/tarpit detection beyond the existing verify signals; a bulk domain-list check (the sync path covers single domains; Batch/Jobs cover volume).

## 3. Users & Personas
- **Deliverability-conscious developer (land):** checks a domain before trusting per-mailbox verification results.
- **Growth / email ops (expand):** routes catch-all domains to pattern-confidence + engagement scoring instead of SMTP.
- **Data quality:** understands why some domains can't be mailbox-verified.
- **RBAC:** standard authenticated key; billed one credit.

## 4. Differentiation
Two moves: (1) **honesty about the probe** — it shows the exact random-mailbox RCPT result and explains what catch-all means for verification, rather than a bare flag; and (2) **coherence** — `catchAllSignal` is the one decision both this detector and email verification call, over the same domain hash, so they are provably consistent (a unit test asserts it across a sample). The guidance closes the loop to the bounce feedback loop (F-045) for catch-all domains.

## 5. Data Model & Logic
Single source of truth: **`lib/catch-all-detector.ts`**.
- `catchAllSignal(domain, { mxFound, isFreeProvider, isDisposable })` — the pure catch-all decision (MX present, not free/disposable, and the domain's FNV-1a hash falls in the catch-all band). **Email verification now imports this**, replacing its inline rule, so the two can't diverge.
- `detectCatchAll(domain)` — computes the signals (free-provider set, `isDisposableDomain`, MX via the same formula as verify), decides status, and adds confidence, provider, a deterministic random-mailbox probe, per-signal evidence, and guidance. **No `Math.random`, no wall-clock in the decision.**
- Invariants (unit-tested, `src/lib/__tests__/catchAllDetector.test.ts`, 7 tests): deterministic + well-formed; null for invalid domains; free providers are never catch-all; **agrees with `verifyEmailDeliverability` on `is_catch_all` across a domain sample** (the SSOT guarantee); status ↔ boolean consistency + guidance present; the pure-signal helper; and a mixed sample. The existing email-verifier tests still pass unchanged after the refactor.

## 6. API & Gateway
- **Endpoint:** `GET /v1/email/catch-all` (catalog entry `catch-all-detect`; mock case in `src/lib/sandboxAPI.ts`), 1 credit. Invalid domain → `INVALID_DOMAIN`. Runs the full gateway pipeline.

## 7. UI
- **Enrichment Studio preset** "Catch-all detection" (`src/data/enrichments.ts` — preset + `catchAllToResult` + dispatch keyed on `is_catch_all` + a `probe` object + an `evidence` array). Rendered by a `CatchAllPanel` in the Studio `ResultCard`: a tone-coded status header (warning for catch-all, success for not, neutral for unknown) with the provider and guidance, and an evidence list with the exact `RCPT TO <mailbox> → accepted/rejected` probe line. KPI fields (status, provider, MX) in the standard grid.
- Semantic tokens only; inherited loading / error / not-found states.

## 8. Telemetry
Reuses the generic `enrichment_run` event (preset `catch-all`) — no bespoke event.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (7 new tests incl. the verify-coherence assertion; existing email-verifier tests unchanged) · isolated `NEXT_DIST_DIR=.next-verify next build` green. Live curl is IP-gated (`::1`, SOC 2); the browser same-origin Studio path is the live surface.

## 10. Deferred
A live SMTP probe; greylist/tarpit nuance; a bulk domain-list catch-all check; per-region MX differences; caching the domain-level result alongside the negative cache.
