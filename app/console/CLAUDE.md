# Console pages (`app/console/`) — Guide

The authenticated developer console. Every page is a `'use client'` component that reads
the Zustand store (`@/lib/store`) and is rendered inside `app/console/layout.tsx`.

## New-page checklist

1. **Route:** `app/console/<area>/page.tsx`, default-exported client component.
2. **RBAC:** wrap in `<RoleGuard allowedRoles={['admin', ...]}>` when the page (or an action) is role-restricted. Mutations that must be blocked for some roles should also be guarded in the store action.
3. **Nav:** add an entry to `allNavItems` in `app/console/layout.tsx` (name, `href`, a **verified** lucide icon, `roles`). Nav is role-filtered and there's an "Unauthorized Scope" screen for direct hits.
4. **Design system:** semantic tokens only (`bg-surface-2`, `bg-glass`, `text-fg`, `text-fg-muted`, `border-border`, `text-teal`…). Framer Motion for entrances/interactions. Rounded-2xl cards, glass panels.
5. **States:** always render beautiful **loading** (skeletons / `Loader2` spinner), **empty** (icon + copy), and **error** states — never a blank div or layout shift.
6. **Env + tenant scoping:** filter data by the store's `environment` (`sandbox`/`live`) where relevant; billing/infra are disabled in sandbox; per-org data comes through the tenant model.

## Patterns to reuse

- **Start with `components/ui` primitives** (`GlassCard`, `PageHeader`, `KpiTile`, `DataTable`, `Drawer`, `Modal`, `EmptyState`, `Skeleton`, `StatusBadge`, `SegmentedControl`, `Button`, `Field`, `Sparkline`, `ConfirmAction`) — they bake in tokens, motion, and states. Only hand-roll when no primitive fits, then consider adding one.
- **Emit telemetry:** `track('<feature>_viewed', {...})` etc. from `@/lib/telemetry` on view, key action, success, and drop-off.

- **Drawers/modals:** render through `@/components/Portal` (see `AlertConfigDrawer`, the create-org modal in `layout.tsx`).
- **Toasts:** `const toast = useToast()` from `@/components/Toast`; `toast.success(message, description?)`.
- **Gateway-backed pages** (like `partners/`, `data-sharing/`): fetch real routes with `Authorization: authHeaderValue(apiKey)` from `@/lib/api-config`, using `activeKeys[0]?.key`. Use `import type` for gateway interfaces so the server engine isn't bundled into the client.
- **Live API calls from the UI:** fetch `/api${endpoint.path}` (same-origin) with `Authorization: Bearer <key>`, then write the result to `apiLogs` via `logApiRequest` so it flows into Logs / Analytics / Security.
- **"AI" features:** call `@/lib/insight-engine` (deterministic, reads real state) — never hardcode the output.

## Don't

- Don't leave dead affordances — every button/link/search does something (or is removed).
- Don't hardcode the API domain, auth header, or endpoint paths — import from `@/lib/api-config` and `@/src/data/endpoints`.
- Don't use `Math.random()` for anything a user might scrutinize twice (it changes on re-render); prefer derived/seeded values.
