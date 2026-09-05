# PRD: Email Deliverability Scoring

> **A preset in the Enrichment Studio** (see `enrichment-studio.md`). Ships at `/console/studio` as the "Verify deliverability" preset — no separate page or nav entry.

**Status:** Built (prototype is the spec) · **Roadmap:** F-011 (Now) · **Route:** `/console/studio` (preset `email-verify`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Sending to a bad address burns sender reputation, inflates bounce rates, and wastes spend. Teams want to know *before* they send whether an address will reach the inbox — and *why*. Incumbents (ZeroBounce, NeverBounce, Kickbox) return a status and a few sub-checks, but the scoring is opaque: you get "risky" with no decomposition and no per-signal confidence. Email Deliverability Scoring turns any address into a transparent 0-100 inbox-reachability score with a decisive verdict, decomposed into every check that produced it — each with its own result and provenance.

## 2. Goals & Non-Goals
**Goals**
- One email in → a **0-100 score** + a **verdict** (`deliverable` / `risky` / `undeliverable` / `unknown`) out.
- A full **signal breakdown**: syntax, MX records, SMTP mailbox handshake, catch-all, disposable, role-based, free-provider (and greylisting when it applies) — each `pass` / `warn` / `fail` / `info` with a plain-English detail.
- **Did-you-mean** correction for common typo domains (gmial.com → gmail.com).
- Per-signal **provenance** and an overall **verdict confidence** (lower when the mailbox is genuinely ambiguous, e.g. catch-all).
- Deterministic: the same address always returns the same verdict (Studio, Explorer, CLI). **Domain-level** signals (MX, provider, catch-all, greylist) agree across every mailbox on a domain; only the **mailbox-level** SMTP handshake and role check vary per address.
- Reuses `GET /v1/email/verify` (1 credit), the generic `enrichments` slice/history, and the Studio renderer — no new page, nav, or store slice.

**Non-Goals (this phase)** — bulk/CSV list verification (that is Bulk Enrichment Jobs); SPF/DKIM/DMARC domain-authentication deep-dive (a natural follow-on check group); real SMTP probing (synthetic, deterministic mock); bounce-feedback learning (roadmap F-045); writing results back to an ESP/CRM.

## 3. Users & Personas
- **Integrating Developer (land):** validates an address in one call before creating a contact; copies JSON/cURL; sees the call in Logs.
- **Growth / RevOps (expand):** gates a campaign on the verdict to protect domain reputation and reduce bounce.
- **Deliverability / Compliance (expand):** reads the per-signal breakdown + provenance to justify why an address was suppressed — auditable sourcing.
- **RBAC:** admin + developer run the lookup (consumes credits/keys); billing role sees the Studio's role explainer.

## 4. Differentiation
Category is **table-stakes** (everyone verifies emails), but incumbents hide the math. Our angle ties to **win #4 (radical usage transparency)** — explicit 1-credit cost + a fully decomposed score you can see behind — and **win #5 (operator-grade console)** — every signal explained with provenance, deterministic, and replayable in Logs. The **domain-vs-mailbox** signal split (MX/catch-all are domain-wide; SMTP/role are per-mailbox) is a correctness detail cheaper vendors get wrong.

## 5. Data Model & Logic
Single source of truth: **`lib/email-verifier.ts`** → `verifyEmailDeliverability(email): EmailDeliverability | null` (null only for empty input; a malformed address is a valid `undeliverable` result, not an error).
- **Syntax** is checked for real (RFC-5322-lite regex). **Free-provider**, **disposable**, and **role-based** are backed by real lists/sets. Everything else is derived from two FNV-1a hash streams — **`hash(domain)`** for MX, provider, catch-all, and greylist (so every mailbox on a domain agrees) and **`hash(email)`** for the SMTP RCPT handshake — **no `Math.random`**.
- `EmailDeliverability`: `email`, `domain`, `verdict`, `score` (0-100), `is_valid_syntax`, `mx_found`, `smtp_check`, `is_catch_all`, `is_disposable`, `is_role_based`, `is_free_provider`, `is_greylisted`, `did_you_mean`, `provider`, `checks: DeliverabilityCheck[]`, `confidence`, `last_verified`, `provenance[]`.
- **Score** is an additive-penalty composite (no MX −92; disposable −62; catch-all −28; mailbox rejection −72; role-based −16; free −6; greylist −10), clamped to 0-100.
- **Verdict** applies hard rules first (no MX / disposable / mailbox rejection → `undeliverable`), then catch-all/role/greylist/`score < 80` → `risky`, else `deliverable`.
- Invariants (unit-tested in `src/lib/__tests__/emailVerifier.test.ts`): deterministic per normalized email; malformed → `undeliverable` + syntax `fail`; disposable → `undeliverable`; role-based never `deliverable`; free provider never `undeliverable` on that basis alone; typo domains yield `did_you_mean`; `score ∈ [0,100]`; `confidence ∈ (0,0.99]`; catch-all lowers verdict confidence below 0.8.

## 6. API & Gateway
- **Endpoint:** `GET /v1/email/verify` (catalog id `email-verify`, `src/data/endpoints.ts`), param `email`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `email-verify` case returns `{ success, ...EmailDeliverability }`; empty input returns `INVALID_PARAMETERS`.
- **Masking:** deliverability signals are infrastructure metadata, so sandbox and live both return the full score; the privacy layer masks only the echoed `email` on `sk_live_` keys.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) has a `deliverabilityToResult` branch, selected when the response carries a `verdict` string + numeric `score` + a `checks` array. It emits a structured `deliverability: DeliverabilityView` section (not flat `fields`) so the Studio renders a purpose-built scored panel.
- **`DeliverabilityView`:** `verdict`, `score`, `provider`, `domain`, `didYouMean`, `flags: { label, tone }[]`, `checks: DeliverabilityCheckView[]`. Flags are toned (Disposable `error`, Catch-all/Role-based/Greylisted `warning`, Free provider `info`, Mailbox confirmed `success` — suppressed when the verdict is undeliverable to avoid contradiction).
- **`DeliverabilityPanel`** (new component in `app/console/studio/page.tsx`): an animated SVG score ring (green ≥80 / amber ≥45 / red below) with the number in the center; the verdict `StatusBadge`; a one-line summary (`domain` via `provider`); the flag chips; a teal did-you-mean nudge when present; and a signal-breakdown list where each check shows a status icon (`CircleCheck`/`CircleAlert`/`CircleX`/`CircleDot`) toned by result, its label, and its detail.
- **Right rail:** overall verdict confidence % + bar + per-signal provenance (unchanged Studio pattern).
- **Preset:** "Verify deliverability" (`MailCheck` icon, person category). **States:** loading (skeleton), empty (preset prompt), error (empty input / out-of-credits / rate-limited), success (the scored panel). Semantic tokens only; correct in light + dark.

## 8. Telemetry
- Reuses the Studio's `enrichment_run` / `enrichment_failed` events in the shared `enrichments` slice.
- Adds **`email_deliverability_checked`** (`lib/telemetry.ts`), fired on a successful verification with `{ verdict, score, environment }` — measures verdict distribution and how often addresses fail, a health signal for the growth dashboard.

## 9. PLG
- Out-of-credits shows the existing upgrade prompt (tracked `upgrade_prompt_shown`/`_clicked`).
- `nextStepRecommendations` bridge to **Bulk Jobs** ("Verify a whole list") — the natural expansion moment — and to person resolution ("Resolve the person") once an address is confirmed deliverable.

## 10. Verification
`tsc` clean · isolated `NEXT_DIST_DIR=.next-verify next build` green · lint clean · `jest` green (email-verifier suite + view-model + sandbox tests; 149 total) · live Studio walkthrough of deliverable (datadoghq.com), risky (catch-all), and undeliverable (disposable) verdicts.

## 11. Deferred
Bulk list verification (Bulk Jobs); SPF/DKIM/DMARC authentication deep-dive; real SMTP probing; bounce-feedback learning (F-045); catch-all sub-address probing; ESP/CRM write-back.
