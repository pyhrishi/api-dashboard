# PRD: Test & Live Key Pairs

> One credential, two keys: a sandbox key (sk_test_…) for building and a live key (sk_live_…) for production, matched by name and scopes. Generate the pair together, revoke it together — build against test, flip to live to ship.

**Status:** Built (prototype is the spec) · **Roadmap:** F-112 (Now → shipped) · **Console:** `/console/key-pairs` · **Source:** `lib/key-pairs.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Zinbit keys already carry an `environment` (sandbox/live), and the Keys page manages them per mode — but they're independent. Developers coming from Stripe/Twilio expect a *paired* mental model: one logical credential exposed as a test secret and a live secret, so you build against test and promote the same credential to live. Treating test and live keys as unrelated objects makes rotation and revocation error-prone (revoke the live key, forget its test twin) and obscures which test key corresponds to which live key. Key pairs make the relationship explicit and give it a linked lifecycle.

## 2. Goals & Non-Goals
**Goals**
- Generate a matched test+live key pair in one action, sharing a name, scopes, and a `pairId`.
- Present a pair as a unit — both secrets side by side, shared metadata, per-side status.
- A linked lifecycle: revoke both keys of a pair together.
- Leave standalone (unpaired) keys and the Keys page untouched.

**Non-Goals (this phase)** — rotating one side of a pair independently (a later action); converting existing standalone keys into a pair; per-pair credit limits; promoting a pair between orgs; the scope *enforcement* seam (that's F-113 Scoped key permissions).

## 3. Users & Personas
- **Developers (land):** generate a pair, build with the test key, ship with the live key — the 10-minute win.
- **Platform/security:** revoke a compromised credential's *both* halves at once — the enterprise control.
- **RBAC:** page visible to `admin | developer | billing`; **only admins** create or revoke pairs (gated in UI + store).

## 4. Differentiation
Table-stakes for a Stripe-grade developer platform (Win #5, operator-grade DX) — shipped clean. The differentiation is coherence: a pair is a real linked object (shared `pairId`), not a naming convention; the pair is mode-agnostic (both keys exist regardless of the console's current environment toggle); and it reuses the exact same key/secret model as the rest of the platform, so a pair's keys authenticate and bill against the real gateway like any other key.

## 5. Data Model & Logic
- **`lib/key-pairs.ts`** (SSOT) — `deriveKeyPairs(keys)` groups `activeKeys` sharing a `pairId` into `KeyPair` (name, scopes, `test`/`live` MockKey, `completeness`: complete/test_only/live_only, `degraded` when a side is revoked/expired/compromised), newest first; `unpairedKeys` returns the rest. `buildKeyPair(name, scopes)` mints the two MockKeys (shared `pairId`, independent scope arrays, correct `sk_test_`/`sk_live_` prefixes). Secret strings are random (a credential, not scrutinized logic).
- **State (Zustand):** `MockKey` gains an optional `pairId?` (non-breaking; standalone keys have none — already persisted via `activeKeys`). Actions `createKeyPair(name, scopes)` → adds both sides to `activeKeys` **regardless of the current mode** (a pair is mode-agnostic), returns the `pairId`; `revokeKeyPair(pairId)` → sets both sides `revoked` and clears their raw tokens. Both **admin-only**, audit-logged (`key_pair.created` / `key_pair.revoked`).
- Invariants (unit-tested, `src/lib/__tests__/keyPairs.test.ts`, 8 tests): derivation completeness (complete/test_only), unpaired excluded, degraded flag; `buildKeyPair` shared pairId + prefixes + independent scope arrays; store create (both sides, either mode) + revoke-both + admin-only + blank-name rejection.

## 6. API & Gateway
No new gateway route — a pair's keys are ordinary `sk_test_`/`sk_live_` keys that authenticate and bill against the real `/api/v1` gateway exactly like standalone keys (billing lazily provisions them). The pairing is a console/store concept over the same credential.

## 7. UI
`/console/key-pairs` — composed from `components/ui`, semantic tokens only.
- **3 KpiTiles** (pairs, complete pairs, degraded).
- **Pair cards:** name, completeness badge, a degraded badge, the shared scope chips, and the **two key rows side by side** (Test / Live) — each showing the masked secret with its fingerprint (one-time reveal, F-115) + per-side status; a two-click **Revoke pair** (`ConfirmAction`) that revokes both.
- **Generate modal:** name + scope toggles → `createKeyPair`.
- **States:** loading skeleton; a designed empty state (generate your first pair / go to Keys for non-admins); billing/non-admin read-only; toast on create/revoke. Framer Motion on card enter/exit. Cross-links to standalone Keys + Logs.

## 8. Telemetry
`key_pairs_viewed` (view), `key_pair_created {scopes}` (create), `key_pair_revoked {pairId}` (revoke) — via `lib/telemetry.ts`. **PLG hook:** creating a pair is an activation signal (a developer moving from build toward ship).

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (8 new tests) · `next build` green (new `/console/key-pairs`) · Playwright smoke (`e2e/key-pairs.spec.ts`) · a generated pair's live key authenticates against the real gateway like any `sk_live_` key.

## 10. Deferred
Independent rotation of one side; converting standalone keys into a pair; per-pair credit limits/scopes UI (scope *enforcement* is F-113); cross-org pair promotion; a "reveal once at creation" secret flow.
