---
description: Scaffold a new console page to the design system (RBAC, nav, states).
argument-hint: <page name and purpose, e.g. "Audit Exports — download signed audit bundles">
---

Build a new console page: **$ARGUMENTS**

Use the **feature-builder** agent (or follow `app/console/CLAUDE.md`):
- Create `app/console/<area>/page.tsx` as a default-exported client component.
- Semantic tokens only; Framer Motion; glass/rounded-2xl; **loading + empty + error** states.
- Add RBAC via `<RoleGuard>` if restricted, and a nav entry in `app/console/layout.tsx` with a **verified** lucide icon (1.33.0 — confirm it exists).
- Reuse `Portal`, `useToast`, `useStore`; if it needs API data, fetch the real `/api/v1/...` routes with `authHeaderValue(apiKey)`.
- No dead affordances.

Finish with `npx tsc --noEmit` and `npx next build --no-lint`; report the result and the new route.
