---
description: Build a complete, production-depth feature from just its name (plan first, then ship).
argument-hint: <feature name, e.g. "Bulk Enrichment Jobs">
---

Build this feature to the Zinbit quality bar: **$ARGUMENTS**

Invoke the **`build-feature` skill** and follow all seven steps in order:
1. **Discover** — personas, developer 10-minute win, enterprise control, competitive angle, the wow (`docs/product/*`).
2. **Architect** — write the Architecture Brief *before code* (state slice, data/API, full edge-case matrix, UI composition from `components/ui`, integration, telemetry, PLG hook).
3. **Build** — production depth: precise types (no `any`), every state (loading/empty/error/success), micro-animations, semantic tokens only, realistic data.
4. **Integrate** — nav, cross-links into Logs/Analytics/Billing, single sources of truth, insight-engine where valuable.
5. **Instrument** — typed telemetry events.
6. **Verify** — `/ship-check` + browser walkthrough; fix until green.
7. **Document** — PRD via the `prd` skill; changelog entry.

Present the brief first (briefly), then execute. Meet every line of `docs/product/feature-quality-bar.md` before calling it done.
