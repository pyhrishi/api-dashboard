# Architecture Brief — <Feature Name>

*Written before any code. Keep it decisive and short; link to files rather than restating them.*

## Why & for whom
- **Personas:** <who touches it> · **Developer 10-minute win:** <…> · **Enterprise control:** <…>
- **Benchmark:** best incumbent = <who>, falls short on <…>; **our angle:** <one of the six wins, or "table-stakes — ship clean">
- **The wow:** <one sentence>

## State (Zustand — `lib/store.ts`)
- **Entities / interfaces:** <name: fields & types>
- **Actions:** <list; which are RBAC-guarded and for which roles>
- **Persistence:** <fields added to `partialize`> · **Tenant-scoped:** <yes/no → `TenantState`> · **Env-scoped:** <sandbox/live behavior>

## Data & API
- **Reads/writes:** <store-only | real gateway routes: method + path + params + headers + billing>
- **Single sources reused:** `lib/api-config.ts` · `src/data/endpoints.ts` · `lib/insight-engine.ts` (<which hooks>)

## Edge-case decisions (from `edge-case-matrix.md`)
| Case | Behavior |
|---|---|
| Empty / first use | |
| Huge data | |
| Slow / failed API | |
| Rate limited / quota | |
| Role denied | |
| Sandbox vs live | |
| Tenant switch | |
| Reload | |
| Destructive actions | |
| <other applicable rows> | |

## UI composition
- **Route/placement:** `app/console/<area>/page.tsx`; nav under <…>, roles <…>
- **Primitives:** <GlassCard, KpiTile, DataTable, Drawer, EmptyState, Skeleton, …>
- **States:** loading = <…> · empty = <…> · error = <…> · success = <…>
- **Motion:** <entrances, hover/active, layout transitions>

## Integration
- **Cross-links:** <Logs / Analytics / Billing / Keys / Support …>
- **Insight-engine:** <what state-aware intelligence, if any>

## Telemetry (`lib/telemetry.ts`)
- `<feature>_viewed` · `<feature>_<key_action>` · `<feature>_succeeded` · `<feature>_abandoned` — props: <…>

## PLG hook
<activation nudge / upgrade prompt / invite moment — or "none natural">

## Out of scope / deferred
<…>
