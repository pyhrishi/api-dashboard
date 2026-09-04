---
description: Scaffold a Zustand store slice (interface + actions + persistence) kept in sync.
argument-hint: <entity/slice name and what it holds>
---

Add a store slice for: **$ARGUMENTS**

Use the **state-architect** agent (or follow `CLAUDE.md`):
- Define a precise `interface` for the entity (no `any`).
- Add the field/actions to the `AppState` interface, the store implementation, and — if it should survive reload — the `partialize` allowlist. If it's tenant-scoped, include it in the `TenantState` snapshot.
- Actions use immutable `set((state) => ({...}))`; RBAC-guard mutations that must be blocked for some roles.
- If the change breaks previously-persisted state, bump the persist `version` and note it.

Verify with `npx tsc --noEmit` and report where the field now lives (interface / impl / partialize / tenant snapshot).
