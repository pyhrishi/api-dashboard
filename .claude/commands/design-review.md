---
description: Run the design-reviewer agent against a page or the current diff.
argument-hint: [page path or "diff"]
---

Run the **design-reviewer** agent on: **${ARGUMENTS:-the current git diff}**

Review against the Zinbit design guidelines: semantic tokens (no hardcoded colors, light+dark), loading/empty/error states, Framer Motion polish, typographic hierarchy and density, accessibility, and consistency with sibling pages. Report findings grouped by severity (blocker / polish / nit) with file:line and concrete suggestions, and a verdict (ship / polish-first). Read-only — do not edit.

## Look at it, don't only read it

Static JSX review misses rendered-only defects: contrast in dark mode, layout shift, overflow, a broken empty state. Before reporting, capture the target so the review is grounded in pixels:

```bash
npm run screenshots -- <route>        # e.g. /console/jobs — writes .screenshots/ + manifest.json
```

Read the PNGs (light + dark, desktop + mobile) and `manifest.json` (per-capture runtime errors). If the **Playwright MCP** server is connected (`.mcp.json`), drive the page live instead — navigate, resize, toggle theme, and screenshot. Treat any runtime error in the manifest as a **blocker**.
