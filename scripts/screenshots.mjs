#!/usr/bin/env node
/**
 * Visual review tooling — capture console routes as PNGs so a reviewer (human or Claude)
 * can *look* at the UI instead of inferring it from JSX.
 *
 *   npm run screenshots                          # default route set
 *   npm run screenshots -- /console/jobs /console/growth
 *   BASE_URL=http://localhost:3002 npm run screenshots -- /console/overview
 *
 * Captures each route in light + dark and desktop + mobile into .screenshots/ (git-ignored).
 * If no server answers at BASE_URL, a `next dev` server is started on 3111 for the run.
 * The console is auto-authenticated, so no login step is needed.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROUTES = [
  '/console/overview', '/console/explorer', '/console/jobs', '/console/analytics',
  '/console/logs', '/console/billing', '/console/growth', '/console/settings/team',
];

const routes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const targets = routes.length ? routes : DEFAULT_ROUTES;
const outDir = path.resolve(process.env.SCREENSHOT_DIR || '.screenshots');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const THEMES = ['light', 'dark'];

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500;
  } catch { return false; }
}
async function waitFor(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await isUp(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let baseUrl = process.env.BASE_URL || 'http://localhost:3002';
let server;
if (!(await isUp(baseUrl))) {
  baseUrl = 'http://localhost:3111';
  if (!(await isUp(baseUrl))) {
    console.log('No existing server — starting next dev on 3111…');
    server = spawn('npx', ['next', 'dev', '-p', '3111'], { stdio: 'ignore', detached: true });
    if (!(await waitFor(baseUrl, 90_000))) { console.error('Dev server did not come up within 90s.'); process.exit(1); }
  }
}

const browser = await chromium.launch();
const manifest = [];
const slug = (r) => r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/g, '') || 'root';

try {
  for (const route of targets) {
    for (const theme of THEMES) {
      for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(900);
        const file = path.join(outDir, `${slug(route)}--${theme}--${vpName}.png`);
        await page.screenshot({ path: file, fullPage: true });
        manifest.push({ route, theme, viewport: vpName, file, runtimeErrors: errors });
        console.log(`ok ${route} [${theme}/${vpName}]${errors.length ? `  WARN ${errors.length} runtime error(s)` : ''}`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch {} }
}

writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} screenshots -> ${outDir}/ (manifest.json lists runtime errors per capture)`);
