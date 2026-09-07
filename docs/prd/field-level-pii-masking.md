# PRD: Field-level PII masking

> Per-field control over how personal data is masked in live API responses — each PII type gets a masking strategy (partial / hash / tokenize / redact), enforced at the gateway on `sk_live_` keys with a floor that keeps the most sensitive fields un-relaxable, and a live before/after preview driven by the exact masking engine the gateway runs.

**Status:** Built — phase 1 (prototype is the spec) · **Roadmap:** F-313 · **Routes:** `/console/pii-masking`; gateway masking in `privacy.ts` (live keys)
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
The gateway already redacted `email`/`phone` on live-key responses, but only when a geo-framework (GDPR/CCPA/DPDP) was detected, only two field types, via key-name substring matching, and with **no configurability or visibility**. F-313 elevates that into a governed, per-field masking policy: for every kind of PII the org picks a masking strategy, the gateway applies it field-by-field at the edge on live keys, and the console makes it inspectable with a faithful before/after preview. Sandbox (`sk_test_`) keys stay unmasked so developers can test against full synthetic data.

## 2. Goals & Non-Goals
**Goals**
- **Per-field strategy:** each PII type → `none | partial | hash | tokenize | redact`, with a **floor** (`minStrategy`) so government IDs / DOB can never be returned in the clear.
- **Comprehensive coverage:** email, phone, government ID, date of birth, street address, IP, full name, social URL — matched by key patterns, deep-walked through nested objects and arrays.
- **Deterministic masking:** same value + strategy → same output (FNV-derived hashes/tokens; no `Math.random`), so the console preview and the gateway agree exactly.
- **Live enforcement:** the gateway masks `sk_live_` responses via the shared engine; sandbox is untouched.
- **A faithful preview:** a before/after view on a representative record, computed by the *same* `maskPayload` the gateway uses.

**Non-Goals (this phase)** — real reversible tokenization / a token vault (tokens are deterministic display artifacts); masking non-string PII (numbers, blobs); ML-based PII detection (key-pattern classification only); a tenant-store schema change (policy lives in its own persisted store). **Deferred to phase 2** (blocked only by another session's concurrent edits to the shared integration files): the org-policy→gateway sync over a `/v1/masking` meta route, the `X-PII-Masked` response header, the nav entry, telemetry wiring, catalog entry, roadmap/changelog. Phase-1 gateway masking uses the default policy.

## 3. Users & Personas
- **Developer (land):** sees exactly which fields are masked and how, and tests against unmasked sandbox data — no guessing what live returns.
- **Compliance/security admin (expand):** configures the masking policy per field (the enterprise control, sibling of F-328 "configure which fields are ever returned"); the floor guarantees a safe minimum.
- **RBAC:** page viewable by `admin | developer | billing`; **policy edits (master switch, per-field strategy, reset) are admin-only** — others see a read-only policy.

## 4. Differentiation
Ties to **win #6 (enterprise-grade security)**. Competitors bury masking in a static setting or don't expose it; nobody gives developers a **live per-field masking policy with a truthful before/after preview** rendered by the very engine that runs at the edge. The depth is the shared deterministic engine (`lib/pii-masking.ts`) used by the gateway, the console preview, and the tests alike — so what you see is what live callers get — plus an un-relaxable floor on the most sensitive fields.

## 5. Data Model & Logic
Single source of truth: **`lib/pii-masking.ts`** (pure helpers + a dedicated persisted store).
- Types: `PiiFieldType`, `MaskStrategy`, `PiiFieldSpec`, `MaskingPolicy`, `MaskingPatch`, `MaskPayloadResult` (no `any`).
- `PII_CATALOG` (field specs with `keyPatterns`, `minStrategy`, `defaultStrategy`), `classifyKey` (key → PII type), `isStrategyAllowed`/`strategyRank` (floor logic), `maskValue` (per-strategy deterministic transform — partial keeps email domain / phone last-4; hash = `sha256:…`; tokenize = `tok_…`; redact = `•••`), `maskPayload` (deep, non-mutating, reports masked keys), `defaultPolicy`/`normalizePolicy`/`normalizeMaskingPatch` (untrusted-body narrowing — clamps below-floor, drops unknowns, never throws), `policyStrength` (0–100), `SAMPLE_RECORD` (the preview fixture).
- **`useMaskingPolicy`** — Zustand store persisted under its own key (`zinbit-pii-masking`), separate from the tenant store (like `useMfaPolicy`/`useEncryptionSettings`). State: `enabled`, `strategies`. Actions: `setEnabled`, `setStrategy` (enforces the floor in the store, not just the UI), `resetPolicy`, `policy()`.

## 6. State / Integration
- **Gateway** [`privacy.ts`](../../src/lib/gateway/privacy.ts): `applyPrivacyMasking` now delegates to `maskFieldLevelPii` (the shared engine, default policy) instead of the old email/phone-only logic — richer, deterministic field-level masking wherever live-key masking already runs. `maskFieldLevelPii(payload, policy?)` is exported for the phase-2 header + route.
- **Console** `/console/pii-masking`: master on/off, a per-field strategy table (admin-editable `Select`, floor-gated options), KPIs (masking on/off, policy strength, fields governed, masked-in-sample), and a live before/after preview (`maskPayload(SAMPLE_RECORD, policy)`). Cross-links to Encryption / Security Hub / Logs.
- **Phase-2 wiring (deferred, see §2):** `/v1/masking` GET/PATCH meta route + per-org policy sync (so a custom policy reaches the edge), `X-PII-Masked` header, nav row, telemetry, catalog, roadmap/changelog.

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, SegmentedControl, Select, StatusBadge, ConfirmAction, Button). **On** — full policy table + preview. **Off** — policy dimmed, preview shows PII in the clear (with a "not recommended" note). **Non-admin** — read-only policy, no selectors. **Floor** — sensitive rows badge "always redacted"; below-floor options are disabled + a toast if attempted. Framer Motion on masked-value transitions. Semantic tokens; light + dark.

## 8. Telemetry (phase 2)
`pii_masking_viewed`, `pii_masking_policy_updated`, `pii_masking_previewed`, `pii_masking_probe_run` — stubbed at the call sites now (TODO), emitted once the telemetry union lands with the phase-2 wiring.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**19-case** suite: key classification, per-strategy determinism, floor enforcement, policy normalization + untrusted-patch narrowing, deep non-mutating `maskPayload`, arrays, `policyStrength`, store-floor) · Playwright smoke (`e2e/pii-masking.spec.ts`). Isolated build deferred until the concurrent F-314 edits settle (shared files are another session's dirty set). Phase-2 adds a live gateway drill (`X-PII-Masked` on a live-key response).

## 10. Deferred
Phase-2 integration (§2/§6/§8); reversible tokenization with a vault; masking numeric/binary PII; ML PII detection; per-endpoint or per-scope masking overrides; feeding masked-field counts into the logs/analytics; opt-out registry unification with the masking policy.
