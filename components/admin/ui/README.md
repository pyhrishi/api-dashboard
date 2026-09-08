# `components/ui` — Zinbit primitives

Token-themed (light + dark), motion-ready, with loading/empty states built in. **Compose
pages from these first**; hand-roll only when nothing fits — then consider adding a primitive.

```ts
import { GlassCard, PageHeader, KpiTile, DataTable, Drawer, Modal, EmptyState, Skeleton,
         StatusBadge, SegmentedControl, Button, Field, Input, Select, Sparkline, ConfirmAction } from '@/components/ui';
```

| Primitive | Use for | Notes |
|---|---|---|
| `GlassCard` | Any panel/card | `padding`, `interactive` (hover lift), `selected` (teal ring) |
| `PageHeader` | Top of every console page | `icon`, `description`, `actions` slot |
| `KpiTile` | Stat cards | `trend` (%), `lowerIsBetter`, `hint`, `loading` |
| `DataTable<T>` | Lists/tables | typed columns, `sortValue` → sortable, `pageSize` → pagination, skeleton loading, built-in empty state, `onRowClick` |
| `Drawer` | Side panels (config, detail) | Portal-based, Esc/backdrop close, `footer` |
| `Modal` | Focused dialogs | Portal-based, Esc/backdrop close, `footer` |
| `EmptyState` | Zero-data / error screens | `icon`, `action`, `tone="error"` |
| `Skeleton` / `SkeletonLines` | Loading placeholders | size to match final layout — no shift |
| `StatusBadge` | Status pills | `tone` success/warning/error/info/teal/neutral, `dot`, `pulse` |
| `SegmentedControl` | Tabs / toggles | sliding pill; give each instance a unique `layoutId` |
| `Button` | All buttons | `variant` primary/secondary/ghost/danger, `size`, `loading`, `icon` |
| `Field` + `Input` / `Select` | Forms | label/hint/error wrapper; `invalid`, `mono` |
| `Sparkline` | Inline trends | pure SVG; color via `text-*` token |
| `ConfirmAction` | Destructive actions | two-click confirm, auto-disarms |

## Rules
- Semantic tokens only — never hardcode a color inside or around these.
- Every list/table needs `loading` + an empty state; every mutation needs a pending state (`Button loading`).
- Destructive actions use `ConfirmAction` (or a `Modal` with explicit confirm).
- Overlays (`Drawer`, `Modal`) always render through `Portal` — already handled.
- Keep motion subtle: entrances ≤ 250ms, springs for panels, `active:scale-[0.98]` on buttons.
