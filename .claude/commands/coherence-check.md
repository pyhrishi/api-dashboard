---
description: Grep the codebase for coherence drift (API identity, catalog, headers, keys).
allowed-tools: Bash(grep:*), Bash(rg:*)
---

Scan for coherence drift (exclude `node_modules`; ignore test files unless noted) and report each hit with file:line, or "clean":

- Non-canonical API hosts: `b2b2b.zintlr.com`, `api.zinbit.com`, `api.zintlr.com` (canonical is `api.zinbit.zintlr.com` / `sandbox.zinbit.zintlr.com` / `console.zinbit.zintlr.com`, all via `lib/api-config.ts`).
- Wrong auth header: `Access-Token` (must be `Authorization: Bearer`).
- Wrong path prefix: `/b2b2b/`.
- Non-`sk_` key prefixes: `zinbit_live_`, `zinbit_test_`, `zintlr_live_`.
- Stale catalog comment: "12 endpoints" / "all 12".
- Phantom endpoint paths referenced in demos/docs that are **not** in `src/data/endpoints.ts`.

End with a one-line verdict: **CLEAN** or **DRIFT FOUND (n)**. Recommend fixes; apply them only if asked.
