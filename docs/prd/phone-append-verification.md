# PRD: Phone Append & Verification

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). This lookup ships at `/console/studio` as the "Email → phone" preset; there is no separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-003 (Now) · **Route:** `/console/studio` (preset `email-to-phone`)
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Appending a phone number is table stakes; appending a phone number a team can safely and legally *dial* is not. Incumbents (ZoomInfo, Lusha) return a direct dial as an opaque string with no line type, no live-status signal, and no Do-Not-Call (DNC) standing — leaving the caller to discover the number is a dead landline, or that dialing it violates a national DNC registry, only after the fact. Our Integrating Developer wants a verified mobile from one call; the RevOps buyer wants reachability to justify spend; the Compliance reviewer must know the DNC standing and that the number is masked in production. Phone Append & Verification is the depth layer on the `email-to-phone` lookup that serves all three.

## 2. Goals & Non-Goals
**Goals**
- One email in → a phone number out, enriched with **line type**, **verification status**, **carrier**, **region**, a **reachability score**, and **DNC standing**.
- **Per-field provenance** (carrier HLR lookup · number intelligence · DNC registry check) — the operator-grade differentiator.
- Deterministic: the same email always appends the same number and verification, everywhere (Studio, Explorer, CLI).
- Enterprise parity: **live keys mask the number**; sandbox returns the full synthetic number.
- Reuses the existing `GET /v1/people/phone` endpoint (2 credits) and the shared, tenant-scoped `enrichments` history — no new endpoint, page, nav, or store slice.

**Non-Goals (this phase)** — bulk/CSV phone append (that is Bulk Enrichment Jobs); real carrier HLR integration (synthetic, deterministic mock); real-time DNC registry sync; SMS/WhatsApp reachability; number formatting per every locale beyond national/E.164.

## 3. Users & Personas
- **Integrating Developer (land):** pastes an email, gets a verified number, copies the JSON/cURL, sees the call in Logs.
- **RevOps / Data Leader (expand):** reads reachability + confidence to gauge dial-list quality and spend.
- **Security / Compliance (expand):** confirms DNC standing surfaces on every result and that live keys mask the number.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Tie to two of the six competitive wins: **compliance-native** (DNC standing on every result; number masked on live keys) and **radical usage transparency** (2-credit cost shown before running; reachability and confidence exposed, not hidden). Best incumbent today is ZoomInfo/Lusha for raw direct dials; they fall short on verification transparency and DNC/TCPA safety for our ICP.

## 5. Data Model & Logic
Single source of truth: **`lib/phone-verifier.ts`** → `verifyPhoneForEmail(email): PhoneVerification | null`.
- Builds on `resolvePersonFromEmail` for the base identity (number, `phone_verified`, `confidence`, `last_verified`), then derives verification depth from a deterministic FNV-1a hash of the normalized email (lower-cased, trimmed) — **no `Math.random`**.
- `PhoneVerification` fields: `phone`, `phone_national`, `line_type` (`mobile | direct_dial | landline | voip`), `verified`, `verification_status` (`verified | unverified | unreachable`), `carrier`, `country`, `region`, `dnc`, `dnc_safe`, `reachability` (0..1), `confidence` (0..1), `last_verified`, `provenance[]`.
- Invariants (unit-tested in `src/lib/__tests__/phoneVerifier.test.ts`): deterministic per normalized email; `dnc_safe === !dnc`; `verified === (verification_status === 'verified')`; `reachability ∈ [0, 0.99]`; `phone_national` carries no country prefix.

## 6. API & Gateway
- **Endpoint:** `GET /v1/people/phone` (catalog id `email-to-phone`, `src/data/endpoints.ts`), param `email`, **2 credits**. Description updated to reflect the verification fields.
- **Mock:** `src/lib/sandboxAPI.ts` `email-to-phone` case returns `{ success, ...PhoneVerification }`; a null resolve returns `NOT_FOUND`.
- **Masking:** the gateway's existing privacy layer masks any field whose name contains `phone` (`phone`, `phone_national`) for `sk_live_` keys under GDPR/DPDP frameworks; sandbox is unmasked. No new masking code.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `phoneToResult` branch, selected when the response carries `line_type` + `verification_status`.
- **Result card** (existing Studio `ResultCard`): title = number; badges = verification status, line type, and **DNC-safe / On DNC**; fields = Phone (verified + masked flags), Line type, Carrier, Region, Reachability %, Do-Not-Call; right rail = confidence % + bar + per-field provenance.
- **States:** loading (Studio phase machine), empty (preset picker prompt), error/not-found (`No result` empty state), success (the card). Motion via the card's existing Framer entrances.

## 8. Telemetry
Reuses the Studio's events (`enrichment_run` / result recorded in the shared `enrichments` slice). No new event type required.

## 9. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (5 new tests + existing sandbox/enrichment suites) · Playwright smoke: Studio "Email → phone" renders the verified card.

## 10. Deferred
Bulk phone append; real HLR/DNC integration; TCPA time-zone dialing windows; per-locale formatting; phone→email verification depth (reverse lookup keeps its current shape).
