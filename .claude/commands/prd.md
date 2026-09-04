---
description: Create, update, or reverse-engineer a PRD for the engineering handoff.
argument-hint: <feature/area, e.g. "partners revenue-share" or "new: bulk export">
---

Invoke the **`prd` skill** for: **$ARGUMENTS**

- If the feature already exists in the prototype → **reverse-engineer** its PRD (read the route, store slice, gateway backend, and tests; derive requirements/data-model/API-contracts/RBAC/non-functionals from the real artifacts).
- If it's new (prefixed "new:") → **author** a PRD from the template.
- If a PRD already exists in `docs/prd/` → **update** it (revise the affected sections, bump status, append to the Changelog).

Write to `docs/prd/<area>-<feature>.md` using `.claude/skills/prd/references/prd-template.md`. Be explicit about prototype-simulated vs production-required. Flag open questions rather than inventing answers.
