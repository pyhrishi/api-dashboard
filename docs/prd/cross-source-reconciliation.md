# PRD: Cross-Source Reconciliation

> When providers disagree on a field, pick the value to trust — weighted by provider reliability and recency — cluster formatting variants, and surface genuine conflicts with the losing candidates.

**Status:** Built (prototype is the spec) · **Roadmap:** F-027 · **Routes:** `GET /v1/reconcile`, `/console/reconciliation`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enrichment draws on many providers, and they don't always agree — one says "VP, Engineering", another "VP Eng", a third an outdated "Senior Engineer". Entity de-duplication (F-026) collapses duplicate *records*; cross-source reconciliation resolves conflicting *field values* into one trusted golden value, showing which source won and why. It's the field-level counterpart to dedup, and it makes the source attribution (F-043) actionable: not just "who said what", but "what to believe".

## 2. Goals & Non-Goals
**Goals**
- **Reconcile per field:** given multiple source observations, pick the winning value weighted by **provider reliability × recency**.
- **Cluster variants:** treat formatting/near-identical values as the same (Jaro-Winkler) so they don't look like conflicts.
- **Surface conflicts:** flag a field when a materially different, well-supported value exists, and list every candidate with its sources, score, and latest-observed date.
- **Explainable:** report the winning source, confidence (winner's share of weight), and agreement (share of sources) per field, plus a record-level conflict count and overall confidence.

**Non-Goals (this phase)** — a customer-defined weighting policy (reliability × recency is the built-in rule); learning weights from feedback; reconciling across a customer's *own* uploaded records (input is a single entity's multi-source observations); auto-writing the reconciled value back into a CRM; merging list/array fields element-wise (scalar fields only this phase).

## 3. Users & Personas
- **Data/RevOps (expand):** sees exactly why a field resolved the way it did and where providers conflict — the trust layer for a golden record.
- **Integrating developer (land):** `GET /v1/reconcile` returns a reconciled record they can trust, with conflicts flagged for review.
- **Support/compliance:** an auditable, deterministic reason for every chosen value.
- **RBAC:** the console tool inherits the `admin | developer` gate.

## 4. Differentiation
Ties to **win #4 (coherent, explainable data)** and builds on **F-043 source attribution** + **F-024 fuzzy matching**: the same provider catalog that attributes each field now *weights* it, and the same string-similarity engine that powers fuzzy matching clusters the variants. Deterministic and fully explained — not a black-box "trust score".

## 5. Data Model & Logic
Single source of truth: **`lib/reconciliation.ts`** (pure, deterministic, no `Math.random`).
- `reconcileField({ field, observations })` → `ReconciledField` and `reconcile(fields)` → `ReconciliationResult`.
- Each observation `{ source, value, observedAt }` gets a weight = `resolveProvider(source).reliability × recencyFactor(observedAt)` (recency floored so old-but-reliable data still counts; reference month fixed for determinism).
- Values are clustered by Jaro-Winkler ≥ 0.92 (formatting variants merge); the winning cluster is the highest total weight. `confidence` = winner ÷ total weight; `agreement` = winner's observation share; `winningSource` = the strongest observation's provider; `conflict` = a runner-up cluster that is materially different (JW < 0.85) *and* has real support (≥ 25% of winner). Candidates (all clusters) are returned with sources, score, and latest date.

## 6. State / Integration
- **Gateway:** a normal-pipeline `GET /v1/reconcile` (catalog entry in `src/data/endpoints.ts`) with a deterministic sandbox case that builds multi-source observations for a resolved entity (reusing `resolvePersonFromEmail` — each field seen by 2–3 catalog providers, with a seeded stale/divergent observation) and returns `reconcile(...)`. Feeds docs / Explorer / OpenAPI / Postman / CLI.
- **No route.ts change, no enrichments/studio change** — deliberately kept off the busiest files; reconciliation is its own tool.
- **No store slice** — the console reads the live gateway.

## 7. UI
`/console/reconciliation` (icon `Combine`): enter an identifier, and see the golden record as a table — each field's reconciled value, a confidence bar, the winning source, an agreement figure, and a conflict badge; expanding a conflicted field reveals every candidate value with its contributing sources, weight, and last-observed date. A record-level header shows overall confidence and the conflict count. Beautiful loading (skeletons), empty, and error (retry) states. Semantic tokens; Framer Motion; light + dark. Cross-links to Identity Resolution (dedup) and the Studio.

## 8. Telemetry
`reconciliation_viewed` and `reconciliation_run` (fields, conflicts, overall confidence) via `lib/telemetry.ts`.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (7-case suite: variant clustering, reliability+recency winner, stale-minority not-a-conflict, real-conflict detection, recency tiebreak, record roll-up, empty + determinism) · isolated build green (`/console/reconciliation`) · live gateway + browser walkthrough (reconciled golden record with a flagged conflict), 0 console errors.

## 10. Deferred
Customer-defined weighting policies; learned weights from correction feedback (F-046 loop); reconciling a customer's own uploaded record sets; write-back to CRM; array/list-field reconciliation; a "resolve this conflict" action that feeds the corrections queue.
