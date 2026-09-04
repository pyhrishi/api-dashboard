---
name: run
description: Launch and drive the Zinbit app to verify a change in the real app — start the dev server, hit the console (auto-authenticated), and/or curl the API gateway with a key. Use whenever asked to run/start/screenshot the app or confirm a change works live.
---

# Running the Zinbit app

Next.js 14 app. Dev server + a real API gateway under `/api/v1/*`. The console is
**auto-authenticated** (the store seeds `isAuthenticated: true`), so no login is needed.

## Start the dev server (background) and find the port

`3000` is often occupied — Next falls through to `3001`, `3002`, … Poll for the port,
don't `sleep`:

```bash
npm run dev > /tmp/zinbit-dev.log 2>&1 &
PORT=""
for i in $(seq 1 45); do
  P=$(grep -oE "http://localhost:[0-9]+" /tmp/zinbit-dev.log | head -1 | grep -oE "[0-9]+$")
  if [ -n "$P" ] && curl -s -o /dev/null --max-time 3 "http://localhost:$P/api" 2>/dev/null; then PORT=$P; break; fi
  sleep 1
done
echo "ready on :$PORT"
```

Stop it by killing the port's listener (only the dev server — not other apps):
`lsof -ti tcp:$PORT -sTCP:LISTEN | xargs -r kill`.

## Drive it

- **Console (no login):** open `http://localhost:$PORT/console` (or `/console/explorer`, `/console/partners`, `/console/data-sharing`, `/console/changelog`). `/` redirects to `/api` (the marketing site).
- **API gateway (the real thing):** any well-formed key works (billing lazily provisions it).
  ```bash
  # sandbox = full data; live = masked PII
  curl -s "http://localhost:$PORT/api/v1/people/phone?email=ceo@example.com" \
    -H "Authorization: Bearer sk_test_demo"
  # force a compliance framework: add  -H "x-country-code: IN"
  ```
- **The CLI** talks to the same gateway: `node cli/index.mjs --key=sk_test_x /v1/people/phone --email=ceo@example.com --url=http://localhost:$PORT/api`.
- **Browser walkthrough (Playwright is installed):** `npm run test:e2e` runs `e2e/golden-path.spec.ts` against a pinned dev server on **:3111** (auto-started; `reuseExistingServer`). Add a per-feature smoke by copying `e2e/_feature-smoke.template.ts`. For ad-hoc driving, `npx playwright codegen http://localhost:$PORT/console`.

## Golden-path smoke (the demo spine)

signup → generate key (`/console/keys`) → run a call (`/console/explorer`, click **Run**) →
it appears in `/console/logs` → rolls up in `/console/analytics` → deducts in `/console/billing`.
Reload mid-flow and confirm state persists. Reset via **Settings → Profile → Reset Demo Data**.

## Verify (non-visual)

`npx tsc --noEmit` · `npx next build --no-lint` · `npx next lint` (baseline: 0) · `npm test` · `npm run test:e2e`. See `CLAUDE.md`.
