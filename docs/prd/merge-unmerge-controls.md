# PRD: Merge & Unmerge Controls

> A human-in-the-loop entity-resolution console: the `/console/identity` merge center, backed by a Zustand slice and a deterministic seed (`lib/merge-seed.ts`).

**Status:** Built (prototype is the spec) · **Roadmap:** F-033 (Next → shipped) · **Page:** `/console/identity` · **State:** `lib/store.ts` merge slice
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Automated de-duplication (F-026) and persistent IDs (F-028) get you most of the way, but the last mile of identity resolution needs a human: confirm a suspected duplicate, or split a bad merge. Without operator controls, a wrong auto-merge is unrecoverable and a suspected duplicate sits unresolved. Merge & unmerge controls give a data steward a reviewable, **reversible** way to confirm or split entity-resolution decisions, with a full audit trail.

## 2. Goals & Non-Goals
**Goals**
- Surface suspected-duplicate groups (the same person across sources) and let an operator **merge** them into one canonical entity, choosing the surviving record.
- Make every merge **reversible** (unmerge/split), with who/when/why captured.
- Write both actions to the audit log; persist merge decisions across reloads.
- RBAC: billing role is read-only.

**Non-Goals (this phase)** — auto-applying merges without review; cross-tenant identity graphs; field-level conflict resolution (which value wins — that's F-027 Cross-source reconciliation); bulk merge/unmerge; merging across entity types; a merge API endpoint (this is a console-state feature this phase).

## 3. Users & Personas
- **Data steward / RevOps (expand):** reviews suspected duplicates, confirms merges, and reverses mistakes — the core loop.
- **Admin:** relies on the audit trail for governance.
- **Developer:** sees canonical golden IDs form from the records.
- **RBAC:** `admin | developer` mutate; `billing` views read-only (buttons gated + the store actions throw for billing).

## 4. Differentiation
The angle is **reversibility with receipts**: unlike a one-way "dedupe" button, every merge here is a first-class, auditable, undoable decision — pick the survivor, see exactly which records were absorbed into which canonical Zinbit ID, and split them back at will. It closes the loop on the identity stack (dedup → persistent ID → human confirm/split) that the rest of this batch built.

## 5. State & Data Model
Types + deterministic seed: **`lib/merge-seed.ts`**.
- `MergeableEntity` (`id, zid, name, company, email, source, confidence, groupId`) — curated suspected-duplicate groups (John/Jhon/J. Smith @ Stripe; Sarah/Sara Chen; Robert/Bob Johnson; María/Maria García; Michael/Micheal Chen) across five sources, with a display-only stable `zid`. `generateMergeCandidates()` builds them deterministically — **no `Math.random`, no wall-clock**.
- `EntityMerge` (`id, canonicalZid, survivingEntityId, mergedEntityIds, reason, mergedBy, mergedAt, status: 'active'|'reverted', revertedAt?, revertedBy?`).

Zustand slice (`lib/store.ts`, added by the state-architect, keeping `AppState` / initial state / `partialize` in sync):
- State: `mergeableEntities` (seeded, not persisted) and `entityMerges` (persisted in `partialize`).
- Actions: `seedMergeCandidates()` (idempotent, on mount); `mergeEntities(survivingId, mergedIds, reason) → id`; `revertMerge(mergeId)`. Both mutations throw for the billing role and prepend an audit log (`entity.merged` / `entity.unmerged`) via the existing `generateAuditLog`.

## 6. API & Gateway
None this phase — the merge center is a console-state feature. A `/v1` merge/unmerge endpoint is a natural follow-up (deferred).

## 7. UI
- **`/console/identity`** (`app/console/identity/page.tsx`, client component, `RoleGuard`):
  - **KPI row:** records, suspected duplicate groups, active merges, records merged away.
  - **Suspected duplicates:** one card per unresolved group; each member is a radio row (name, company, source badge, `zid`, email) — pick the survivor — with a reason input and a "Merge N into <survivor>" action. A merged group animates out.
  - **Merge history:** each merge shows the canonical `zid`, the absorbed names, the reason, actor + relative time, and an inline **click-to-confirm Unmerge**; reverted merges show muted with a Reverted badge.
- Semantic tokens only; Framer Motion on group/merge transitions; toasts on success/error. **States:** loading skeleton, a true empty state (no groups + no history), the resolved-all state, and per-role gating — no layout shift.
- **Nav:** a role-filtered "Identity Resolution" entry (GitMerge icon) after Enrichment Studio.

## 8. Telemetry
Typed events (`lib/telemetry.ts`): `merge_center_viewed` on mount, `entities_merged` (`{ merged, canonical }`) on a merge, `merge_reverted` (`{ mergeId }`) on an unmerge — so review-loop engagement lands in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green · isolated `NEXT_DIST_DIR=.next-verify next build` green (`/console/identity` route emitted). Browser walkthrough: merge a group → it leaves suspected and appears in history with the canonical id → unmerge → it returns to suspected; billing role sees controls gated.

## 10. Deferred
A `/v1` merge/unmerge endpoint; field-level conflict resolution (F-027); bulk merge/unmerge; tenant-scoped merge graphs; auto-apply of high-confidence merges; merging across entity types.
