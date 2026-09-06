# PRD: Disposable Email Detection

> **A preset in the Enrichment Studio** + the single source of truth for disposable classification across the product. Ships at `/console/studio` as "Detect disposable" and powers the deliverability score's disposable check.

**Status:** Built (prototype is the spec) · **Roadmap:** F-051 (Now) · **Route:** `/console/studio` (preset `email-disposable`)
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Throwaway and temporary mailboxes (mailinator, 10minutemail, burner aliases) pollute signups, inflate lists, and evade follow-up. Teams want a fast, decisive "is this a disposable address?" check — without paying for full deliverability scoring — and one that catches not just the well-known providers but lookalike domains that never make a static blocklist. Disposable Email Detection is that check, and it becomes the one place the product decides what "disposable" means.

## 2. Goals & Non-Goals
**Goals**
- A decisive **verdict** — disposable / suspected / trusted — with the provider **category**, a **confidence**, and a plain-English **reason**.
- **Two-layer detection:** an explicit categorized list of known providers, plus a **heuristic** pass that flags unlisted domains by keyword/shape signal (→ "suspected").
- A **lightweight single-purpose endpoint** (`GET /v1/email/disposable`, 1 credit) for callers who only need this check.
- **One source of truth:** the same detector powers this endpoint and the F-011 deliverability score's "Disposable" signal — no second list.

**Non-Goals (this phase)** — a live-updating third-party blocklist feed; MX-based disposable inference; per-tenant custom allow/deny lists; blocking at the gateway (this is detection, not enforcement); catch-all detection (that is F-049, already surfaced inside F-011).

## 3. Users & Personas
- **Integrating Developer (land):** one call at signup returns a verdict + reason to gate the form.
- **Growth / RevOps (expand):** strips disposable addresses from a list before a campaign to protect deliverability.
- **Trust & Safety (expand):** the category + confidence + reason make a suppression decision auditable.
- **RBAC:** inherits the Studio's `admin | developer` gate; read-only, no mutation.

## 4. Differentiation
**Table-stakes category, shipped with two points of care** that tie to win #4/#5: **heuristic detection beyond a static list** (a "suspected" verdict for unlisted lookalikes, with the matched signal named) and a **transparent verdict** (category + confidence + reason + how it matched). The architectural point of care is that it's the **single source of truth** — F-011's disposable check was refactored to consume it, so the product can never disagree with itself about whether a domain is disposable.

## 5. Data Model & Logic
Single source of truth: **`lib/disposable-detector.ts`**.
- `detectDisposable(email): DisposableDetection | null` — null only for empty input.
- `isDisposableDomain(domain): boolean` — the fast path the email verifier (F-011) calls.
- `DisposableDetection`: `email`, `domain`, `is_disposable`, `verdict` (disposable / suspected / trusted), `category` (temporary-mailbox / throwaway / anonymizing-alias / trusted / unknown), `confidence`, `reason`, `is_free_provider`, `matched_on` (known-provider / heuristic / free-provider / no-signal).
- **Layers, in order:** known categorized provider (root-domain match, incl. subdomains) → high-confidence `disposable`; mainstream free provider → `trusted`; unlisted domain with a disposable keyword → `suspected` (heuristic, confidence scaled by hit count); otherwise → `trusted` (no signal).
- Deterministic; **no `Math.random`**.
- Invariants (unit-tested in `src/lib/__tests__/disposableDetector.test.ts`): known providers flagged (incl. subdomain); free/corporate not flagged; keyword lookalikes → `suspected` (< full confidence); case/space-insensitive; deterministic.

## 6. API & Gateway
- **Endpoint:** `GET /v1/email/disposable` (catalog id `email-disposable`), param `email`, **1 credit**.
- **Mock:** `src/lib/sandboxAPI.ts` `email-disposable` case returns `{ success, ...DisposableDetection }`; empty input → `INVALID_PARAMETERS`.
- **F-011 integration:** `lib/email-verifier.ts` now imports `isDisposableDomain` instead of a local list, so its "Disposable" check and undeliverable verdict use the same, larger, heuristic-aware classification.

## 7. UI
- **Surface:** `toEnrichmentResult` (`src/data/enrichments.ts`) gains a `disposableToResult` branch (keyed on `is_disposable` + `matched_on` + `category`), emitting a structured `disposable: DisposableView` section.
- **`DisposablePanel`** (in `app/console/studio/page.tsx`): a tone-coded verdict card — red (disposable) / amber (suspected) / green (trusted) — with a category-appropriate icon, the verdict badge, the category, the reason, a confidence bar, and how it matched. Renders only when `result.disposable` is present.
- **Preset:** "Detect disposable" (`Trash2` icon, person category); examples cover a known provider, a heuristic lookalike, and a trusted domain. **States:** loading / empty / error (empty input) / success. Semantic tokens only; light + dark.

## 8. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` events. No dedicated event — the verdict is a passive result, and the run event already records that a check was performed.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (detector suite + view-model dispatch + sandbox case + unchanged F-011 suite; 199 total) · isolated `NEXT_DIST_DIR=.next-verify next build` green · live Studio walkthrough of all three verdicts (mailinator → disposable 98%; sneaky-tempmail.io → suspected 68% heuristic; acme.com → trusted).

## 10. Deferred
Third-party blocklist feed; MX-based inference; per-tenant custom lists; gateway-level blocking; a dedicated "disposable_detected" telemetry event if a suppression funnel is added later.
