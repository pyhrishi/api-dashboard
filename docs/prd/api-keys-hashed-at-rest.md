# PRD: API keys hashed at rest

> A secret exists in plaintext in exactly one place: with the client it was issued to. The gateway keeps only a SHA-256 digest of every API key and keys every registry that references a key by that digest — and makes it provable: a live attestation of every registry, a fingerprint on every response that equals the one the console computes in the browser, and a verify endpoint that accepts a digest, never a key.

**Status:** Built (prototype is the spec) · **Roadmap:** F-321 · **Routes:** `/console/key-hashing`, `GET /v1/keys/hashing`, `POST /v1/keys/hashing/verify`, `X-Key-Fingerprint` on every gateway response, fingerprint chip on `/console/keys`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Billing and the IP allowlist already hashed keys, but each with its own private copy of the hash function, while the scope registry, kill switch, rate-limit buckets, idempotency store, geo-velocity tracker and partner attribution still keyed by the plaintext key. The org handle used by encryption and payload limits was built from the key's last eight characters — a plaintext fragment at rest — and the one-time-reveal fingerprint (F-115) was an unrelated FNV hash. A security reviewer had to take "we hash keys" on faith. F-321 makes it one implementation, everywhere, and inspectable.

## 2. Goals & Non-Goals
**Goals**
- **One digest, three runtimes:** a pure, synchronous SHA-256 in `lib/key-hashing.ts` that runs in the browser, the Edge middleware and Node handlers, cross-checked against Node `crypto` in tests.
- **Every registry keyed by digest:** billing, IP allowlists, geo-velocity tracker, scopes, kill switch, rate-limit buckets (Edge), idempotency, partner attribution. Registries capture a masked display string at write time, so their console views never need the plaintext back.
- **No plaintext fragments at rest:** `orgHandleForKey` and the F-115 reveal fingerprint derive from the same digest.
- **Provable:** `GET /v1/keys/hashing` returns a live audit (per registry: what it holds, how it is keyed, entries; totals; `plaintextCopies` — 0) and what is held for the presented key (digest, `sha256:<16 hex>` fingerprint, prefix, last 4, referencing registries, lookup count) — never the key.
- **Verifiable without re-sending the secret:** `POST /v1/keys/hashing/verify { hash }` accepts a full digest or a `sha256:` fingerprint, compares in constant time, and rejects a plaintext key with 400.
- **Visible:** `X-Key-Fingerprint` on every gateway response (CORS-exposed) and a fingerprint chip beside every key in API Keys.
- **Deterministic** everything — no `Math.random`.

**Non-Goals (this phase)** — peppered/HMAC digests with a server secret and hash-version migration; a password-style KDF (issued keys are 20 random base-36 characters, ~103 bits of entropy; a salt adds nothing and breaks O(1) lookup); removing the plaintext from the console's own persisted store (the console is the client — it legitimately holds the key it was issued, like an env var); a tenant-store schema change.

## 3. Users & Personas
- **Integrating developer (land):** pastes a key from an env var into the inspector and learns which key it is; sees the same `sha256:` fingerprint next to every key, in the console, in `X-Key-Fingerprint`, and in the gateway's record.
- **Security / compliance officer (expand):** pulls the attestation for the vendor review — every registry listed, keyed by digest, zero plaintext copies — and can spot-check with the verify endpoint.
- **RBAC:** page viewable by `admin | developer`. No mutations; nothing to gate.

## 4. Differentiation
Table-stakes done provably, tied to **win #6 (enterprise-grade security)**. Stripe and GitHub hash keys, but you take their word for it. Ours is inspectable: the console's browser-side fingerprint is byte-for-byte the identity the gateway keyed the request by, the audit is live rather than a PDF claim, and verification never asks for the secret again.

## 5. Data Model & Logic
Single source of truth: **`lib/key-hashing.ts`** (pure helpers, no store).
- `sha256Hex` (FIPS 180-4, pure TS, UTF-8), `hashApiKey`, `keyFingerprint` (`sha256:` + first 16 hex), `fingerprintFromHash`, `keyPrefix`, `isWellFormedApiKey`, `redactKey` (`sk_live_••••abcd`), `constantTimeEqual`, `isSha256Hex`.
- `KeyAtRest` — `{ hash, fingerprint, prefix, last4, algorithm }`, no plaintext field **by type**; `toKeyAtRest(plaintext)`.
- `KEY_HASHING_POSTURE` — algorithm, encoding, 256 stored bits, 64 fingerprint bits, unsalted (with the reason), constant-time compare, plaintext revealed once, lookup by digest.
- `RegistryDescriptor` — `{ id, label, holds, keyedBy: 'sha256' | 'plaintext', entries, runtime: 'edge' | 'node' }`, implemented by each registry as a `*StorageDescriptor()` plus a `has*For(hash)` probe.
- `lib/secret-reveal.ts` `fingerprint()` = first 8 hex of the digest. `lib/encryption.ts` `orgHandleForKey` = `org_` + first 8 hex of the digest.

## 6. State / Integration
- **Registries converted** (plaintext API unchanged, storage by digest): `scopes.ts` (entry keeps `display`), `keyBlock.ts` (record keeps `display`), `rateLimiter.ts` (Edge — the pure digest makes this possible), `idempotency.ts` (composite key uses the digest), `security.ts` (fraud tracker; IP allowlist now via the SSOT), `partnerRevenue.ts` (attribution index), `billing.ts` (SSOT digest; `hasBillingRecordFor` probe without lazy provisioning).
- **Gateway module** [`src/lib/gateway/keyHashing.ts`](../../src/lib/gateway/keyHashing.ts): `auditKeyStorage`, `describeKeyAtRest`, `verifyHash`, `attachKeyFingerprintHeader`, `__resetKeyHashing`. A `REGISTRIES` list is the one place to add a new key-referencing registry.
- **Pipeline** [`route.ts`](../../app/api/v1/[...route]/route.ts): header attached beside the payload-limit headers (every gateway response); `/v1/keys/hashing` GET + `/verify` POST handled as free meta routes before route resolution. **CORS** exposes `X-Key-Fingerprint`.
- **Catalog** entry `key-hashing` → docs/Explorer/OpenAPI/Postman/CLI. **API Keys** page shows the `sha256:` chip (links to the console).
- **Console** `/console/key-hashing` (nav row pending the nav-config refactor by another workstream; page routable directly).

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, DataTable, StatusBadge, EmptyState, Skeleton). **Loading** — KPI tiles in `loading` + block skeletons. **No key** — banner + inspector still works; attestation shows a create-a-key empty state. **Keys at rest** — table with copyable fingerprints. **Inspector** — password-type input with show/hide and clear, malformed-shape warning, result card (recognised key badge or "not one of your keys", fingerprint + full digest copyable), gateway verify result inline. **Attestation** — skeleton / error with retry / record card + registry table, "no plaintext at rest" and console↔gateway match badges. **Storage policy** — six posture facts. Semantic tokens; light + dark; staggered entrances; `aria-live` on results.

## 8. Telemetry
Via `lib/telemetry.ts`: `key_hashing_viewed` (keys), `key_hash_inspected` (wellFormed, recognised — debounced, never the secret), `key_hash_verified` (match), `key_hashing_attested` (clean, registries, plaintextCopies, matches). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**16-case** suite: pure SHA-256 vs Node across padding boundaries + unicode, the billing seed digest, fingerprint/redaction/prefix/well-formedness, constant-time compare, `KeyAtRest` has no plaintext by shape, F-115 fingerprint + org handle derive from the digest, billing resolves seeds by digest, scopes + kill switch + rate limiter + idempotency work through the plaintext API while storing digests and never leaking the key in snapshots, audit lists 8 registries all `sha256` with 0 plaintext copies, `describeKeyAtRest` references + lookups, `verifyHash` digest/fingerprint/plaintext/constant-time, header equals console fingerprint) · isolated `next build` green (`/console/key-hashing` present) · Playwright (`e2e/key-hashing.spec.ts`: console smoke, local inspector hashes a pasted key + recognises non-ownership, malformed candidate flagged; API: GET attests 0 plaintext + header equals digest + never contains the key, verify accepts digest / rejects plaintext with 400).

## 10. Deferred
Peppered (HMAC) digests with `kid` + hash-version migration; forgetting the plaintext in the console after the one-time reveal (the console-as-client trade-off); a "leaked key" k-anonymity check by digest prefix; audit-log entries for verify calls; a nav row once the nav-config refactor lands.
