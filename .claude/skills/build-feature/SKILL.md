---
name: build-feature
description: Build a complete, production-depth Zinbit feature from just its name — planned architecture-first, then implemented with comprehensive edge cases, Zustand state, loading/error/empty states, micro-animations, deep dashboard integration, premium design-system aesthetics, telemetry, and a PRD. Use whenever the user names a feature to build or says "build <feature>".
---

# Build a feature (extraordinary, not MVP)

The input is often just a **name**. Your job is to make it the best version of that
feature for Zinbit's users — developer-first to land, enterprise to expand — and to
**plan the architecture before writing code**. Follow the seven steps in order; don't
skip to Build.

Read first: `CLAUDE.md`, `docs/product/feature-quality-bar.md` (the Definition of Done),
`docs/product/icp-and-personas.md`, `docs/product/competitive-benchmark.md`.

## 1. Discover — what would extraordinary be?
- Which personas touch this? Name the **developer's 10-minute win** and the **enterprise control** it needs.
- Benchmark: who does this best today, where they fall short for our ICP, and **our differentiated angle** (tie to one of the six wins in the benchmark — or declare it table-stakes and ship it clean).
- Define the "wow" moment in one sentence.

## 2. Architect — write the brief *before code*
Fill `references/architecture-brief-template.md` (keep it short, decisive). It must cover:
- **State:** the Zustand slice — interfaces (no `any`), actions, persistence (`partialize`), tenant scoping (`TenantState`), RBAC on mutations.
- **Data / API:** entities; if it touches the API, the real routes, params, headers, billing.
- **Edge-case matrix:** walk `references/edge-case-matrix.md` and decide the behavior for each applicable row.
- **UI composition:** which `components/ui` primitives; the loading/empty/error/success states; motion.
- **Integration:** nav placement, cross-links (Logs/Analytics/Billing/Keys/Support), insight-engine hooks, single sources of truth reused.
- **Telemetry:** the typed events it emits (viewed / key action / success / drop-off).
- **PLG hook:** an activation or expansion moment if natural.
Present the brief succinctly, then proceed (pause for the user only if a decision materially changes the work).

## 3. Build
- Use the **feature-builder**, **state-architect**, and **gateway-engineer** agents (or do it directly) per the brief.
- Semantic tokens only; primitives from `components/ui`; realistic mock data; every state designed.

## 4. Integrate
Nav entry (role-filtered) in `app/console/layout.tsx`; cross-links; reuse `lib/api-config.ts`, `src/data/endpoints.ts`, `lib/insight-engine.ts`.

## 5. Instrument
Emit the events from the brief via `lib/telemetry.ts`. Confirm they land in the events slice / Growth dashboard.

## 6. Verify
`/ship-check` (tsc · build · lint-vs-baseline · coherence · tests · design review) and a browser walkthrough of the happy path + one edge case. Fix until green.

## 7. Document
Draft the PRD with the `prd` skill (reverse-engineer from what you built) into `docs/prd/`, add a changelog entry if user-visible, and summarize: what shipped, the wow, edge cases covered, events emitted, and anything deferred.

## Non-negotiables
Depth over MVP · plan before code · no hardcoded colors · no dead affordances · no `Math.random()` in scrutinized UI · no new `any` · no new lint errors · every state designed.
