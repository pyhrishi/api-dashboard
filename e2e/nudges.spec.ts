/**
 * Lifecycle nudges — in-product rendering (Step 1, Section F).
 * The seeded console account holds a key but has not made its first call, so the
 * orchestrator surfaces the C3-a "make your first call" activation banner. Dismiss
 * removes it and it stays gone; the CTA navigates to the Explorer.
 * The console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const NUDGE = '[data-nudge-id="n-c3a-firstfire"]';

test.describe('Nudge orchestrator — smoke', () => {
  test('surfaces the activation nudge from lifecycle state, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/console/overview');
    await expect(page.locator(NUDGE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Make your first call/i).first()).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('dismiss removes the nudge and it stays gone on reload', async ({ page }) => {
    await page.goto('/console/overview');
    const banner = page.locator(NUDGE);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole('button', { name: /^Dismiss$/i }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.locator(NUDGE)).toHaveCount(0);
  });

  test('the CTA converts and navigates to the Explorer', async ({ page }) => {
    await page.goto('/console/overview');
    const banner = page.locator(NUDGE);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole('button', { name: /Open the Explorer/i }).click();
    await expect(page).toHaveURL(/\/console\/explorer/);
  });

  test('the first real call fires the activation celebration (transition)', async ({ page }) => {
    await page.goto('/console/explorer');
    await page.getByRole('button', { name: /Find Phone by Email/i }).first().click();
    await page.getByPlaceholder('user@company.com').fill('ceo@example.com');
    const run = page.getByRole('button', { name: /Send Request/i });
    await expect(run).toBeEnabled();
    await run.click();
    await expect(page.getByText(/200 OK/)).toBeVisible({ timeout: 20_000 });
    // The one-shot celebration surfaces from the null→set firstCall transition.
    await expect(page.locator('[data-nudge-id="n-c3a-celebrate"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/First call, done/i)).toBeVisible();
  });

  test('the decision-window banner shows data-driven copy at high usage (Step 3)', async ({ page }) => {
    // Activate with a real call, then force the trial to ~82% consumed.
    await page.goto('/console/explorer');
    await page.getByRole('button', { name: /Find Phone by Email/i }).first().click();
    await page.getByPlaceholder('user@company.com').fill('ceo@example.com');
    await page.getByRole('button', { name: /Send Request/i }).click();
    await expect(page.getByText(/200 OK/)).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      try { const s = JSON.parse(localStorage.getItem('zinbit-storage') as string); s.state.creditBalance = 900; localStorage.setItem('zinbit-storage', JSON.stringify(s)); } catch { /* ignore */ }
    });
    await page.goto('/console/overview');
    const banner = page.locator('[data-nudge-id="n-c4a-decision"]');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText(/% of your trial/)).toBeVisible(); // context injected the live usage
  });

  test('the journey cockpit renders the board, lead panel and simulated clock (Step 5)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/console/journey');
    await expect(page.getByRole('heading', { name: /^Customer Journey$/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'The journey', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lead & sales routing', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Simulated clock', exact: true })).toBeVisible();
    // Advancing the clock updates the offset without a crash.
    await page.getByRole('button', { name: /\+7 days/ }).click();
    await expect(page.getByText(/Offset:/)).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('the watcher dispatches re-engagement for a stalled nudge under simulated time (Step 4)', async ({ page }) => {
    await page.goto('/console/overview');
    await page.waitForTimeout(1000); // let the store + nudge state hydrate
    // Advance the simulated clock past the activation nudge's 24h re-engagement window.
    await page.evaluate(() => {
      try {
        const key = 'zinbit-nudge-state';
        const cur = JSON.parse(localStorage.getItem(key) || '{"state":{},"version":0}');
        cur.state = cur.state || {};
        cur.state.simulatedOffsetMs = 30 * 3600000;
        localStorage.setItem(key, JSON.stringify(cur));
      } catch { /* ignore */ }
    });
    await page.reload();
    // The background watcher plans an email delivery and records it in the nudge ledger.
    await expect.poll(async () => page.evaluate(() => {
      try {
        const n = JSON.parse(localStorage.getItem('zinbit-nudge-state') || '{}');
        return (n.state?.deliveries || []).filter((d: { channel: string }) => d.channel === 'email').length;
      } catch { return 0; }
    }), { timeout: 25_000, intervals: [500, 1000, 2000] }).toBeGreaterThan(0);
  });
});
