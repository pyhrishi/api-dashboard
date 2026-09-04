# Feature Quality Bar — Definition of Done

Every feature — no matter how small its name sounds — ships to **production-level depth**, not MVP. A feature is done only when **every** line below is true. This is the checklist `/build-feature` and `/ship-check` enforce.

## 0. Planned before built
- [ ] An **Architecture Brief** exists (see `build-feature` skill) covering state, data model, edge cases, integration, telemetry, and UI composition — *written before code*.
- [ ] The brief names the personas served, the 10-minute developer win, and the enterprise control, and states our differentiated angle (or explicitly "table-stakes").

## 1. State & data (Zustand)
- [ ] Precise TypeScript interfaces for every entity and prop. **No `any`.**
- [ ] A store slice with immutable, centralized actions; the field lives in `AppState`, the impl, and — if it must survive reload — `partialize` (and `TenantState` if tenant-scoped).
- [ ] RBAC-guarded mutations; multi-tenant and sandbox/live scoping where relevant.

## 2. Edge cases (comprehensive — see `edge-case-matrix.md`)
- [ ] First-use / empty · huge data (pagination, virtualization, truncation) · slow / failed / partial API · offline / retry
- [ ] Permission denied per role · sandbox vs live · tenant switch mid-flow · reload/persistence · concurrent edits
- [ ] Invalid / malicious input · currency & locale · long strings / unicode · timezone

## 3. UI states — never a blank screen
- [ ] **Loading** (skeletons that match the final layout, or a sleek spinner) — no layout shift
- [ ] **Empty** (icon + helpful copy + a clear next action)
- [ ] **Error** (what happened + how to fix + retry)
- [ ] **Success / confirmation** where an action has consequences

## 4. Interaction & motion
- [ ] Micro-animations on every interactive element (hover, active, enter/exit, layout) via Framer Motion or Tailwind transitions
- [ ] Optimistic or clearly-pending states for mutations; destructive actions confirm
- [ ] Keyboard accessible; focus states; `aria` where needed

## 5. Premium aesthetics (design system)
- [ ] **Semantic tokens only** — zero hardcoded colors; correct in light + dark
- [ ] Composed from `components/ui` primitives; glass/rounded-2xl language; strong typographic hierarchy; teal accent used with restraint
- [ ] Realistic mock data — **no placeholders**, no lorem ipsum

## 6. Deep integration
- [ ] Nav entry (role-filtered) and correct placement
- [ ] Cross-links into the spine where they belong (Logs, Analytics, Billing, Keys, Support)
- [ ] Reuses single sources of truth (`lib/api-config.ts`, `src/data/endpoints.ts`); "AI" behavior via `lib/insight-engine.ts` (state-aware, never random)
- [ ] If it touches the API: real gateway routes, real headers, real billing

## 7. PLG & measurement
- [ ] Emits typed telemetry events (viewed, key action, success, drop-off) via `lib/telemetry.ts`
- [ ] Has an activation/expansion hook where natural (nudge, upgrade prompt, invite) — measurable and dismissible, never a dark pattern

## 8. Verified & documented
- [ ] `npx tsc --noEmit` clean · `next build` green · no new lint
- [ ] Unit tests for logic; a Playwright smoke for the happy path (`e2e/<feature>.spec.ts` from `e2e/_feature-smoke.template.ts`); `npm run test:e2e` green
- [ ] `/coherence-check` clean · design-reviewer: ship
- [ ] PRD drafted/updated via the `prd` skill; changelog entry if user-visible

**If any box is unchecked, the feature is not done.**
