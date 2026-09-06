# PRD: Golden-Record Snapshots

> Version the canonical record for each entity — capture an immutable, point-in-time snapshot of a reconciled golden record, diff any two versions field-by-field (what changed, which source drove it, how confidence moved), and pin the record of truth.

**Status:** Built (prototype is the spec) · **Roadmap:** F-054 · **Routes:** `GET /v1/records/snapshot`, `/console/golden-records`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment tells you what's true *now*; governance and audit need to know what you believed *then*. When a golden record (the reconciled canonical values, F-027) drifts — a contact is promoted, a company changes HQ, a funding stage advances — teams lose the prior truth unless they snapshot it. Golden-record snapshots capture an immutable, versioned copy of an entity's canonical record at a point in time, so you can answer "what did we know about this account on the day we signed?", diff two versions to see exactly what moved and why, and pin the version that is your official record of truth. It's the versioning/audit layer on top of reconciliation (F-027), a sibling of the identity history graph (F-035) and the match audit trail.

## 2. Goals & Non-Goals
**Goals**
- **Capture** an immutable snapshot of an entity's golden record — content-hashed, versioned per entity, stamped with capture date and the point-in-time it reflects.
- **Diff** any two versions field-by-field: `changed` (before → after, with the driving source and confidence delta), `added`, `removed`, `unchanged`.
- **Pin** exactly one version per entity as the record of truth; **label** and **delete** versions.
- **No-op on no change** — capturing again only creates a version when the record actually differs (hash-equal ⇒ nothing stored).
- **Seeded history** so diffs are meaningful on first load (real evolution: a promotion, a relocation, a headcount jump, a funding round).
- Governed: RBAC-gated mutations, audit-logged, tenant-scoped, persisted.

**Non-Goals (this phase)** — continuous/automatic snapshotting on every enrichment (manual + seed only); snapshot-level access control beyond role gating; cross-entity rollups; restoring a snapshot back into a live source (write-back); unbounded retention policy/TTL; snapshotting arbitrary non-reconciled payloads (golden records only).

## 3. Users & Personas
- **RevOps / data governance (expand):** keeps an auditable version chain per account; pins the record of truth used for contracts and QBRs; diffs "since last review".
- **Compliance / security:** immutable, hashed history answers "what did we hold and when".
- **Integrating developer (land):** `GET /v1/records/snapshot?query=stripe.com` returns the current golden record + its content hash to store as a versioned artifact.
- **RBAC:** the page is viewable by `admin | developer | billing`; **mutations (capture / pin / label / delete) are blocked for billing** in both the store action and the UI. Billed like a lookup (1 credit) for the API.

## 4. Differentiation
Ties to **win #4 (coherent, explainable data)** and reuses **F-027 reconciliation** + the person/company resolvers + **F-028 Zinbit ID**. Most enrichment tools return the current record; treating the golden record as a **versioned, diffable, pinnable artifact** — with the *source and confidence* of each change surfaced in the diff — is the governance capability enterprises ask for and dev-first tools skip. The content-hash no-op keeps the history honest (no empty versions).

## 5. Data Model & Logic
Single source of truth: **`lib/golden-record.ts`** (pure, deterministic — FNV-1a, no `Math.random`, frozen reference "now").
- `buildGoldenRecord(query, asOf)` → `GoldenRecord { entityKey, entityType, zinbitId, display, fields: GoldenField[], overallConfidence, asOf }`. Resolves the entity (email → person, domain → company), then reconstructs each field's value **as of** `asOf` via a deterministic field-evolution model — each field carries a seeded change event (previous value + change date), so an earlier `asOf` differs from a later one in exactly the fields that changed between them. Field confidence decays slightly with staleness.
- `GoldenSnapshot` = a frozen `GoldenRecord` + `{ version, capturedAt, hash, label, pinned, origin }`.
- `hashRecord(fields)` — order-independent content hash for change detection.
- `diffSnapshots(from, to)` / `diffFields` → per-field `FieldDiff { status, before, after, sourceBefore, sourceAfter, confidenceBefore, confidenceAfter }` + counts + overall confidence delta.
- `generateSeedSnapshots()` — pre-built version chains for demo entities (stripe.com, datadoghq.com, jane.doe@acme.com) at fixed past `asOf` dates.

## 6. State / Integration
- **Store slice** (`lib/store.ts`, **tenant-scoped + persisted**): `goldenSnapshots: GoldenSnapshot[]` on `TenantState` (mirrored in `extractTenantState` / `defaultTenantState` / initial state / `partialize`). Actions: `seedGoldenSnapshots` (idempotent), `captureGoldenSnapshot(query)` (RBAC; hash no-op; new version pins itself; audit log), `pinGoldenSnapshot`, `labelGoldenSnapshot`, `deleteGoldenSnapshot` (re-pins the latest remaining if the pinned one is removed) — all billing-blocked and audit-logged.
- **Gateway:** `GET /v1/records/snapshot?query=…` (catalog entry + sandbox case) returns the current golden record + hash; feeds docs / Explorer / OpenAPI / Postman / CLI.
- **UI** (`/console/golden-records`): capture bar, KPI tiles (entities / snapshots / pinned), entity list, a **compare panel** (two version selectors → field-level diff with changed/added/removed + confidence delta), and a **version timeline** (per-version pin / label / delete, capture + reflects dates, hash, origin).

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, StatusBadge, ConfirmAction). **Empty** — no snapshots yet, prompt to capture. **Populated** — entity list + diff + timeline. **No-op capture / unresolvable** — an info toast ("no new version"), never a crash. **Read-only** — billing role sees disabled capture + a "read-only" note; mutation buttons hidden. Framer Motion on version enter/exit and layout; semantic tokens; light + dark. Destructive delete uses two-click `ConfirmAction`.

## 8. Telemetry
Via `lib/telemetry.ts`: `golden_records_viewed`, `golden_record_captured` (entity_type, version, fields), `golden_record_pinned` (version), `golden_record_deleted` (version). Emitted from the console page.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**15-case** suite: entity resolution, record build, point-in-time evolution, determinism, hash stability/order-independence/sensitivity, diff classification (changed/added/removed), confidence delta, seed chains one-pinned-latest + meaningful adjacent diffs) · isolated `next build` green (`/console/golden-records` present) · Playwright smoke (`e2e/golden-records.spec.ts`) · live gateway + console walkthrough (capture stripe.com → v-next; diff v1↔latest shows changed fields; billing role read-only). 0 console errors.

## 10. Deferred
Automatic snapshotting on enrichment / on a schedule; retention policy + TTL; restore-to-source write-back; snapshot-level ACLs; cross-entity / list-level version history (F-545); exporting a snapshot bundle; comparing snapshots across two different entities.
