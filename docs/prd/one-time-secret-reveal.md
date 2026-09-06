# PRD: One-Time Secret Reveal

> A new API key's full secret is shown exactly once, at creation, and never again — after that the dashboard keeps only a fingerprint and the last four characters. The Stripe model, and the safe default.

**Status:** Built (prototype is the spec) · **Roadmap:** F-115 (Now → shipped) · **Applied on:** `/console/key-pairs` · **Source:** `lib/secret-reveal.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
A secret that stays revealable in a dashboard is a standing liability: anyone with a session (or a shoulder) can lift it long after creation. The best platforms (Stripe, GitHub) show a secret in full exactly once and then only ever display a masked, identifiable form. Zinbit already cleared the raw token after first view for standalone keys; F-115 generalizes that into a reusable primitive and adds the missing half — a persistent *fingerprint* so a key stays identifiable without being re-exposable — and applies it to the new key-pairs surface.

## 2. Goals & Non-Goals
**Goals**
- Show a secret in full exactly once (at creation), then never again.
- After the reveal, keep an identifiable-but-safe form: prefix + last-4 + a deterministic fingerprint.
- A reusable primitive other secret surfaces can adopt.

**Non-Goals (this phase)** — retrofitting the standalone Keys page (it already clears the raw token; adding the fingerprint there is F-113's/its owner's call); re-issuing a lost secret (that's key rotation); encrypting-at-rest of the stored token (the gateway needs the real value to authenticate — masking is a display concern).

## 3. Users & Personas
- **Developers (land):** copy the secret once at creation, store it safely; afterward see only the fingerprint — no accidental exposure in the dashboard.
- **Security/enterprise:** the assurance that a secret can't be lifted from the console after issuance.
- **RBAC:** applies wherever secrets are shown (here, `/console/key-pairs`).

## 4. Differentiation
Table-stakes for a Stripe-grade platform (Win #5, DX/trust), shipped clean. The coherence detail: the gateway still needs the true token to authenticate, so the secret isn't destroyed — `key.key` keeps it (masking is a *display* concern; never store bullets, they break HTTP headers). The one-time gate is `key.rawToken`, which exists only until the reveal is acknowledged; `clearRawToken` removes it and `canReveal` turns false forever. The fingerprint is deterministic (same secret → same fingerprint), so it's safe to persist and display.

## 5. Data Model & Logic
- **`lib/secret-reveal.ts`** (SSOT) — `fingerprint(secret)` (deterministic two-round FNV-1a → 8 hex chars), `secretTail(secret, n=4)`, `maskedWithFingerprint(secret)` (`sk_live_····a1b2 · fp_8f3c92e1`), `canReveal(key)` (true only while `rawToken` is present), `fingerprintLabel`. No `Math.random`, no wall-clock.
- **State:** reuses the existing `MockKey.rawToken` + `clearRawToken(id)` store action — no new store field. A key-pair's keys are minted with `rawToken` set (F-112's `buildKeyPair`); acknowledging the reveal calls `clearRawToken` on both.
- Invariants (unit-tested, `src/lib/__tests__/secretReveal.test.ts`, 5 tests): fingerprint deterministic + 8-hex + distinguishes secrets + `''`→`00000000`; tail; `maskedWithFingerprint` shows prefix/tail/fingerprint and never the middle; `canReveal` gated on `rawToken`; `fingerprintLabel`.

## 6. API & Gateway
No gateway change — this is a console display-and-lifecycle concern. The real token continues to authenticate against `/api/v1` exactly as before; only the *dashboard's* ability to re-show it changes.

## 7. UI
Applied on `/console/key-pairs` (F-112):
- **At creation:** a one-time reveal Modal shows both the test and live secrets in full, each copyable, behind a clear warning ("Copy both keys now… they can't be shown again — only a fingerprint remains"). Its only dismissal is **"Done — I've saved them,"** which clears both raw tokens.
- **A pair whose secrets aren't saved yet** (raw tokens still present) surfaces a "Secrets not saved yet" warning and a **Reveal secrets** button that reopens the one-time modal — so navigating away doesn't strand you.
- **After acknowledgement:** each key row shows only `maskedWithFingerprint(key)` — prefix, `····`, last-4, and `fp_…` — with a tooltip explaining the one-time model. No reveal, no copy of the full secret.
- Semantic tokens only; `semantic-warning` for the reveal urgency; Framer Motion on the modal.

## 8. Telemetry
`secret_reveal_acknowledged {pairId}` — via `lib/telemetry.ts`, fired when the user confirms they've saved the secrets (the moment the raw tokens are cleared). **PLG hook:** the ack is a completed-activation signal.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (5 new tests) · `next build` green · a generated key pair reveals both secrets once, and after acknowledgement the rows show only fingerprints — the full secret is unreachable from the console.

## 10. Deferred
Applying the fingerprint model to the standalone Keys page; a "copy fingerprint" affordance; re-reveal within a short grace window; encrypting the stored token at rest; a downloadable secret file at creation.
