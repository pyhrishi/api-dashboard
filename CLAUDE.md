# Zinbit by Zintlr — Project Guide (CLAUDE.md)

## What this is

**Zinbit by Zintlr** — an enterprise B2B **data-enrichment API platform**, built as a
**complete, high-fidelity prototype**. The mandate: this is *not* an MVP — it is an
**exact replica of the finished product** used for leadership review, enterprise sales
demos, and as the living spec engineering builds to scale. Depth and coherence matter
more than shipping shortcuts.

## Tech stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + custom CSS-property design tokens (`app/globals.css`, `tailwind.config.ts`)
- **State:** Zustand (`lib/store.ts`) — global client state, `persist`-ed to localStorage
- **Animation:** Framer Motion · **Icons:** lucide-react (`1.33.0`) · **Charts:** Recharts
- **Backend simulation:** real Next.js edge middleware + route handlers under `app/api/v1/`

## Design & engineering rules (non-negotiable)

- **Never hardcode colors.** Use semantic tokens only: backgrounds `bg-surface` / `bg-surface-2` / `bg-glass` / `bg-overlay`; text `text-fg` / `text-fg-muted` / `text-fg-subtle`; borders `border-border` / `border-border-subtle`; accent `text-teal` / `bg-teal/10` / `border-teal/30`. Works in light + dark.
- **Every screen has states.** Design beautiful empty, loading (skeletons/spinners), and error states — never a blank screen or layout shift.
- **Micro-animations.** Interactive elements feel alive (Framer Motion or Tailwind transitions).
- **RBAC.** Gate views/actions with `<ProtectedRoute>` and `<RoleGuard allowedRoles={[...]}>`. Roles: `admin | developer | billing`.
- **Multi-tenant.** Data/actions are scoped to the active organization; account for context switching.
- **Strict TypeScript.** Interfaces for all data/props. Avoid `any` (there is a known backlog — don't add new ones).
- **No placeholders.** Generate realistic mock data; describe/reuse real assets.

## Architecture — two halves + single sources of truth

1. **Client simulation** — a ~2,250-line Zustand store (`lib/store.ts`, 35+ entities) drives ~40 highly-polished console pages. This is the "database" for the UI.
2. **A real API gateway** — `middleware.ts` (auth + token-bucket rate-limit) → `app/api/v1/[...route]/route.ts` (pipeline) → `src/lib/gateway/*` (WAF, circuit breaker, cache, billing, fraud, privacy, capacity forecast, partner revenue, data sharing). Live `/api/v1/*` requests actually run this. See `src/lib/gateway/CLAUDE.md`.

**Single sources of truth — import from these, never re-hardcode:**
- `lib/api-config.ts` — the canonical API host, auth header/scheme, URL composition. All demos/docs/CLI consume it.
- `src/data/endpoints.ts` — the endpoint catalog. Feeds docs, Explorer, code generators, OpenAPI (`app/api/docs/route.ts`), Postman (`app/api/docs/postman/route.ts`), and the CLI.
- `lib/insight-engine.ts` — deterministic, state-aware logic behind the "AI" features (RCA, triage, dedup). AI is **state-aware, never random or hardcoded**.

**Key behaviors:**
- **The seam is closed:** a key created in the console authenticates and bills against the real `/api/v1` gateway (billing lazily provisions any well-formed `sk_test_`/`sk_live_` key — `src/lib/gateway/billing.ts`).
- **Masking is live-only:** the gateway masks PII for `sk_live_` keys; `sk_test_` (sandbox) returns full synthetic data.
- The Endpoint Explorer's "Run" fires a **real** same-origin `fetch('/api/v1/...')` and logs the real response.

## Conventions & gotchas

- **`@/*` alias maps to BOTH `./` and `./src/`** (`tsconfig.json`). `@/lib/store` → root `lib/`; `@/data/endpoints` → `src/data/`; `@/lib/gateway/*` → `src/lib/gateway/`. TS resolves `./` first, then `./src/`.
- **Coherence principles:** one API identity, one catalog, **no dead/decorative affordances** (every control does something), state-aware not random.
- **lucide-react 1.33.0** is old — some icons don't exist (e.g. `Linkedin`). Verify an icon exists (tsc) before relying on it.
- **Set/Map iteration:** don't `for...of` or spread a `Set`/`Map`/iterator (tsconfig target < es2015 for iterables). Use `.forEach(...)` or `Array.from(map.entries())`.
- **Store persistence:** `partialize` in `lib/store.ts` is the persistence allowlist; `tenants` is persisted; bumping persist `version` discards stale local state (used to force a clean re-seed). The same field often lives in 3 places — `AppState`, `TenantState`, and `partialize` — keep them in sync.

## Verify before you conclude (the "green" bar)

```bash
npx tsc --noEmit          # must be 0 errors
npx next build --no-lint  # must succeed — currently 44 routes (43 static + /console/jobs/[id])
npx next lint             # baseline: 0 errors, 0 warnings (no `any` — type it or narrow from `unknown`)
```

`ignoreDuringBuilds` is on (`next.config.mjs`), so lint doesn't fail the build — but **do not add new lint errors**. "Green" = tsc clean + build ok + lint at 0. The codebase has **zero `any`** (the one boundary exception, `APIResponse.data` in `src/lib/sandboxAPI.ts`, carries an explicit eslint-disable with the reason). New code uses `unknown` + narrowing, `Record<string, unknown>`, or the domain types in `lib/store.ts` / `lib/types/json.ts`.
Run the app with the `run` skill (dev server picks the next free port — 3000 is often busy → 3002; the console is auto-authenticated).

## Product context (read before building any feature)

`docs/product/` — `icp-and-personas.md` (dev-first land · enterprise expand), `competitive-benchmark.md` (who we beat and how), `positioning.md`, and **`feature-quality-bar.md` — the Definition of Done every feature must meet**. Given only a feature *name*, `/build-feature` uses these to plan the architecture first, then builds to production depth.

**UI primitives:** compose pages from `components/ui` (GlassCard, PageHeader, KpiTile, DataTable, Drawer, Modal, EmptyState, Skeleton, StatusBadge, SegmentedControl, Button, Field, Sparkline, ConfirmAction) — see `components/ui/README.md`. **Telemetry:** emit typed events with `track()` from `lib/telemetry.ts` (in-product growth layer; optional PostHog forwarding via `NEXT_PUBLIC_POSTHOG_KEY`).

## Slash commands & agents

- Commands: `/build-feature <name>` (the full plan→build→verify→PRD workflow), `/verify`, `/coherence-check`, `/new-endpoint`, `/new-page`, `/new-store-slice`, `/prd`, `/design-review`, `/ship-check`.
- Agents: `feature-builder`, `gateway-engineer`, `state-architect`, `coherence-auditor`, `design-reviewer`, `prd-writer`, `qa-verifier`.
- The **`prd` skill** authors and reverse-engineers PRDs (the prototype is the spec) into `docs/prd/`. See `docs/prd/README.md`.
