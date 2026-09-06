# PRD: Hashed-Email (SHA-256) Lookups

> Privacy-preserving identity resolution: `GET /v1/identity/hashed` and its Enrichment Studio preset, matching a SHA-256 email hash against a deterministic index (`lib/hashed-email-resolver.ts`, `lib/sha256.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-021 (Next → shipped) · **Endpoint:** `GET /v1/identity/hashed` · **Preset:** Studio → "Hashed-email lookup"
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Privacy-conscious teams — and entire adtech workflows — can't send raw email addresses to a third party. The standard is to exchange the SHA-256 hash of a normalized email instead: the provider matches on the hash without ever seeing the plaintext. Hashed-email lookups add exactly that to Zinbit: enrich against `sha256(lower(trim(email)))` with no raw PII on the wire.

## 2. Goals & Non-Goals
**Goals**
- `GET /v1/identity/hashed?email_sha256=<64hex>` resolves a full person from an email hash, when the hash is in the opted-in dataset.
- Never require (or accept) the plaintext email — the hash is the only identifier.
- A Studio preset that hashes an email **in the browser** and sends only the digest, proving the privacy model end to end.
- Deterministic and coherent — a hashed match equals the plaintext lookup exactly (same identity graph).

**Non-Goals (this phase)** — other hash algorithms (MD5/SHA-1) or salted/peppered hashes; hashed *phone* lookups; a bulk hashed-match endpoint (the sync Batch / async Jobs paths cover volume); reversing a hash to plaintext; a real opt-in/consent ledger.

## 3. Users & Personas
- **Privacy/compliance-bound developer (land):** enriches a CRM keyed by hashed email without moving raw PII — GDPR-friendly.
- **Adtech / data-partnership engineer (expand):** performs a privacy-preserving match against a partner's hashed list.
- **Security reviewer:** confirms in the request log that only the digest was transmitted.
- **RBAC:** standard authenticated key; billed one credit like other identity lookups.

## 4. Differentiation
Table-stakes for a privacy-serious data API, shipped clean and *demonstrated*: the Studio hashes locally and shows the exact digest it matched, so the "plaintext never left the page" claim is visible, not just asserted. Coherence is the moat — a hashed match resolves through the same `person-resolver` as a plaintext lookup, so the two can never disagree, and the client and server share one SHA-256 implementation so a browser-computed hash always matches the server index.

## 5. Data Model & Logic
Two single sources of truth:
- **`lib/sha256.ts`** — a pure-JS, dependency-free SHA-256 (`sha256Hex`, `isSha256Hex`) with its own UTF-8 encoder, so it runs identically in the browser and on the server (and under jest). Verified against the NIST vectors for `""` and `"abc"`.
- **`lib/hashed-email-resolver.ts`** — builds a deterministic **hashed-identity index**: a curated set of example identities (so the Studio examples always resolve) plus a generated corporate set (`first.last@domain`), each keyed by `sha256(lower(trim(email)))`. `resolveByEmailHash(hash)` normalizes the digest (accepts a `sha256:` prefix), validates it's 64-hex, looks it up, and on a hit resolves the person via `resolvePersonFromEmail`. **No `Math.random`, no wall-clock.**
- Invariants (unit-tested, `src/lib/__tests__/hashedEmail.test.ts`, 10 tests): NIST SHA-256 vectors; trim+lowercase normalization; a known identity resolves from its hash with `plaintext_received:false`; deterministic; an unknown hash is a clean no-match; an invalid digest returns `null`; the `sha256:` prefix is accepted; the index is non-trivial; and a match flows through the Studio dispatch into a person view-model badged "SHA-256 match".

## 6. API & Gateway
- **Endpoint:** `GET /v1/identity/hashed` (catalog entry in `src/data/endpoints.ts`; mock case in `src/lib/sandboxAPI.ts`), 1 credit, param `email_sha256`. A match → `200` with the person + privacy metadata; a hash not in the dataset → `404 NOT_FOUND` (kept honest for match-rate math); a syntactically invalid digest → `400 INVALID_PARAMETERS`. Runs the full gateway pipeline like every `/v1` route.

## 7. UI
- **Enrichment Studio preset** "Hashed-email lookup" (`src/data/enrichments.ts` — preset + `hashedEmailToResult` + dispatch keyed on `matched===true && person && email_sha256`, placed before the generic person branch). A new preset-level `transform: 'sha256'` flag drives a client-side hash in the Studio `run()`: the typed email is hashed with `lib/sha256.ts` and **only the digest** is placed on the wire and into the request log; the input placeholder tracks the email, not the digest.
- The result renders as the resolved person, prefixed with privacy provenance — a "SHA-256 match" badge and fields for *Matched via*, the *Hash* (truncated, mono), and *Plaintext sent: Never*.
- **States:** loading spinner; the standard not-found state for an unmatched hash; error panel for an invalid digest / 402 / 429 — all inherited from the Studio.

## 8. Telemetry
Reuses the generic `enrichment_run` event (preset `hashed-email`) — no bespoke event, so the telemetry surface stays minimal and adoption still lands in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (10 new tests, incl. NIST vectors + the dispatch chain) · isolated `NEXT_DIST_DIR=.next-verify next build` green (SHA-256 bundles cleanly into the client). Live curl is IP-gated (`::1`, SOC 2 policy) as for all `/v1` routes; the browser same-origin Studio path is the live surface.

## 10. Deferred
Additional/salted hash algorithms; hashed-phone lookups; a bulk hashed-match endpoint; a real consent/opt-in ledger; a "hash this list" client utility.
