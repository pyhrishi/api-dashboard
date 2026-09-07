# PRD: Encryption in transit & at rest

> The crypto guarantee, made inspectable: a live, signed attestation of how data is protected on the wire (TLS 1.3 + cipher, HSTS, PFS) and at rest (AES-256-GCM envelope encryption, customer-managed KMS keys, rotation schedule, field-level PII), pullable in one API call and manageable from the console.

**Status:** Built (prototype is the spec) · **Roadmap:** F-312 · **Routes:** `/console/encryption`, `GET|POST /v1/encryption`, `X-Encryption-*` on every `/api/v1/*` response
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The gateway already enforced TLS-in-transit and set HSTS/CSP headers ([security.ts](../../src/lib/gateway/security.ts)), but that guarantee was invisible and there was nothing for **at-rest**: no key inventory, no rotation, no field-level PII story. Enterprise security reviews ask for both, in writing. F-312 turns "we encrypt everything" into something a developer can *see and pull* — a live posture endpoint and a console that inspects transit, manages the KMS keys that wrap data at rest, and emits a signed attestation for the reviewer.

## 2. Goals & Non-Goals
**Goals**
- **In transit, visible:** the negotiated TLS version + cipher, HSTS, forward secrecy, OCSP stapling — and `X-Encryption-Transit`/`X-Encryption-Rest` headers on **every** API response.
- **At rest, managed:** an AES-256-GCM envelope model — a customer-managed KMS key per purpose (data/PII/backups/exports), an encrypted-store inventory, a rotation schedule, and admin-driven **rotate now** + cadence.
- **Field-level PII encryption:** deterministic (searchable) vs randomized (always-on) modes, admin-tunable.
- **One-call attestation:** `GET /v1/encryption` returns a signed, stable digest + posture score a reviewer can trust.
- **Deterministic** everything (FNV, injected `now`) — no `Math.random`, fully unit-tested.

**Non-Goals (this phase)** — real cryptographic key material or a real KMS/HSM integration (fingerprints/digests are non-secret display artifacts); actually re-encrypting stored bytes on rotation (envelope re-wrap only); BYOK/HYOK upload; certificate/TLS-cert management; per-tenant HSTS config; feeding rotation events into the audit log; a tenant-store schema change (settings live in their own persisted store).

## 3. Users & Personas
- **Developer (land):** hits `/v1/encryption` and gets a machine-readable attestation to drop into a security questionnaire; sees the `X-Encryption-*` headers on their own traffic in seconds.
- **Security/IT admin (expand):** owns the KMS rotation cadence, rotates on demand, and sets field-level PII encryption — the enterprise checkbox for SOC2/vendor reviews.
- **RBAC:** page viewable by `admin | developer | billing`; **rotation, cadence, and field toggles are admin-only** (read-only for others). Live check + attestation copy are available to all viewers.

## 4. Differentiation
Ties to **win #6 (enterprise-grade security)**. Competitors (Stripe/AWS) bury encryption posture in static compliance PDFs; nobody gives developers a **live, self-serve encryption posture endpoint + console with a pullable signed attestation**. The depth is that transit is *proven on the wire* (real response headers, a live check) and at-rest is *operable* (real KMS rotation that visibly moves the schedule), not a marketing page.

## 5. Data Model & Logic
Single source of truth: **`lib/encryption.ts`** (pure helpers + a dedicated persisted store).
- Types: `TlsPosture`, `KmsKey`, `EncryptedStore`, `FieldEncryption`, `EncryptionPosture` (no `any`).
- Deterministic derivation: `fnv`/`fingerprint` (non-secret), `TLS_POSTURE` (TLS 1.3 / `TLS_AES_256_GCM_SHA384` / X25519 / HSTS-preload), `deriveKeys` (per-purpose KMS keys; primary follows cadence + `lastRotatedAt`), `deriveStores`, `deriveFields`, `postureScore` (transit 35 + store coverage 30 + PII coverage 20 + rotation freshness 15), `attest` (digest over **material** facts only — independent of rotation timestamp), `buildPosture`, `daysUntilRotation`.
- **`useEncryptionSettings`** — Zustand store persisted under its own key (`zinbit-encryption`), separate from the tenant store (like `useMfaPolicy`/`useLoginGuard`). State: `rotationDays`, `lastRotatedAt`, `fieldEncryption`. Actions: `setRotationCadence` (allowlisted 30/60/90/180/365), `rotatePrimaryKey`, `setFieldEncryption`, `reset`.

## 6. State / Integration
- **Gateway meta module** [`src/lib/gateway/encryption.ts`](../../src/lib/gateway/encryption.ts): `attachEncryptionHeaders` (called in the pipeline beside `attachISO27001Headers` — live keys advertise `pii=field-level`), `getEncryptionPosture` (org-scoped by key suffix, signed), `runRotationDrill` (envelope re-wrap; per-isolate rotation state), `__resetEncryption`.
- **Real endpoint** `/v1/encryption` wired into [`route.ts`](../../app/api/v1/[...route]/route.ts) before route resolution/billing: `GET` = posture, `POST` = rotate. `creditCost: 0`. Catalog entry in [`endpoints.ts`](../../src/data/endpoints.ts) → feeds docs/Explorer/OpenAPI/Postman/CLI.
- **Console** `/console/encryption`: reuses `authHeaderValue` + `activeKeys` for a real same-origin live check; console `orgId` matches the gateway handle so posture + attestation stay coherent. Nav entry (role-filtered), cross-links to Security Hub / Keys / Logs.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, DataTable, SegmentedControl, ConfirmAction, StatusBadge, EmptyState, Skeleton, Button). **Loading** — KPI skeletons. **Empty** — no API key → prompt to create one (posture needs a key handle). **Ready** — transit inspector (+ live header reveal via Framer Motion), KMS key table (sorted by next rotation, overdue in red), encrypted-store table, PII field toggle grid, attestation card. **Non-admin** — cadence/rotate/toggles read-only. **Error** — live-check failure toast + error headers. Semantic tokens only; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `encryption_viewed`, `encryption_checked` (live check, with `ok`), `encryption_key_rotated` (with cadence), `encryption_field_toggled` (field + enabled). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**16-case** suite: fnv/fingerprint determinism, TLS posture, key/store/field derivation, score rises/falls with rotation freshness + PII coverage, attestation stability + timestamp-independence, and the gateway module's headers/posture/rotation) · isolated `next build` green (`/console/encryption` present) · Playwright smoke (`e2e/encryption.spec.ts`) · live gateway drill: `GET /api/v1/encryption` returns the signed posture and the response carries `X-Encryption-Transit`/`X-Encryption-Rest`; `POST` increments the rotation counter. 0 console errors.

## 10. Deferred
Real KMS/HSM + BYOK/HYOK; actual byte-level re-encryption on rotation; TLS certificate management; per-tenant HSTS; audit-log entries for rotation/policy changes; export-specific PGP encryption (F-463); API-key-hashed-at-rest surfacing (F-321) cross-link.
