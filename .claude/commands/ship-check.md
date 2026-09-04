---
description: Full pre-handoff gate — verify + coherence + tests + e2e + telemetry + design review.
allowed-tools: Bash(npx tsc:*), Bash(npx next lint:*), Bash(npx next build:*), Bash(npm test:*), Bash(npm run test:e2e:*), Bash(npx playwright:*), Bash(grep:*), Bash(rg:*)
---

Run the complete pre-demo / pre-handoff gate and give one consolidated verdict:

1. **Verify:** `npx tsc --noEmit`, `npx next build --no-lint`, `npx next lint` (baseline = **0 errors, 0 warnings** — any lint error, including `no-explicit-any`, is a regression).
2. **Coherence:** run the `/coherence-check` greps (API host, `Access-Token`, `/b2b2b/`, non-`sk_` keys, "12 endpoints", phantom paths).
3. **Unit tests:** `npm test` — all green.
4. **E2E:** `npm run test:e2e` (Playwright golden path) — passes. If Playwright isn't installed, say so explicitly rather than skipping silently.
5. **Telemetry:** for any feature in the diff, confirm it emits events — `grep -rn "track('" <changed files>` shows at least a `*_viewed`/key-action event (the console layout emits `feature_viewed` for every route automatically; features must still emit their own action/success events).
6. **Design:** launch the **design-reviewer** agent on the current diff.
7. **Definition of Done:** walk `docs/product/feature-quality-bar.md` for any feature in the diff and list unchecked boxes.

Report each section pass/fail, then a single **SHIP / HOLD** verdict. If HOLD, list exactly what's blocking. Don't fix — report.
