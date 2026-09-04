---
description: Scaffold a new API endpoint end-to-end (catalog + mock + verify it flows everywhere).
argument-hint: <endpoint name or path, e.g. "Company Firmographics /v1/companies/firmographics">
---

Add a new API endpoint: **$ARGUMENTS**

Use the **gateway-engineer** agent (or follow `src/lib/gateway/CLAUDE.md` directly):
1. Add the entry to `src/data/endpoints.ts` (`id`, `name`, `method`, `path` with `/v1/` prefix, `creditCost`, `parameters` with examples/validation, next-step recs). This alone flows into docs, OpenAPI, Postman, and the CLI.
2. Add its mock response in `src/lib/sandboxAPI.ts` `generateMockResponse()`, keyed by the endpoint `id`, returning realistic (synthetic) data.
3. Verify: `npx tsc --noEmit`; start the dev server and `curl -H "Authorization: Bearer sk_test_x" http://localhost:<port>/api<path>` → expect `200` with real gateway headers.

Report the new endpoint and confirm it appears in the OpenAPI spec (`/api/docs`) and the CLI catalog.
