---
description: Type-check, build, and lint the app; report against the green baseline.
allowed-tools: Bash(npx tsc:*), Bash(npx next lint:*), Bash(npx next build:*)
---

Run the verification gate and report results plainly:

1. `npx tsc --noEmit` — expect **0 errors**.
2. `npx next build --no-lint` — expect **success (44 routes: 43 static + the dynamic /console/jobs/[id])**.
3. `npx next lint` — baseline is **0 errors, 0 warnings**. Report any finding (including `no-explicit-any`) as a regression.

Summarize as **GREEN** (tsc clean + build ok + lint at 0) or **RED** with the specific failures. Do not fix anything unless asked — this command just reports.
