/**
 * Compromised-key kill switch (F-119) — browser smoke.
 * Happy path: the incident console loads + the leak drill flips a key 200→401.
 * Edge: designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/kill-switch';
const HEADING = /Compromised-Key Kill Switch/i;

test.describe('Kill switch — smoke', () => {
  test('renders the incident console with KPIs + key list, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Blocked attempts/i)).toBeVisible();
    await expect(page.getByText(/Simulate a leak/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: the leak drill flips a key from allowed to 401', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Run drill/i }).click();
    await expect(page.getByText(/KEY_REVOKED/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/before kill/i)).toBeVisible();
  });

  test('edge case: recent kill events / registry are shown', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/Killed keys/i)).toBeVisible();
  });
});
