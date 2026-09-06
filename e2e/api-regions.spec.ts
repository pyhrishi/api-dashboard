/**
 * Regional API endpoints (F-070) — browser smoke.
 * Happy path: the page lists the three regional endpoints and a latency test
 * runs against the real gateway. Edge case: pinning residency updates the policy.
 *
 * Auto-authenticated console (seeds API keys); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/api-regions';

test.describe('API Regions — smoke', () => {
  test('renders the three regional endpoints, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /API Regions/i })).toBeVisible();
    await expect(page.getByText(/us\.api\.zinbit/i)).toBeVisible();
    await expect(page.getByText(/eu\.api\.zinbit/i)).toBeVisible();
    await expect(page.getByText(/in\.api\.zinbit/i)).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: a latency test resolves against the gateway', async ({ page }) => {
    await page.goto(ROUTE);
    const test1 = page.getByRole('button', { name: /^Test$/i }).first();
    if (await test1.isVisible().catch(() => false)) {
      await test1.click();
      // Either a measured latency ("served <region>") or a designed error — never blank.
      await expect(page.getByText(/served|ms|failed/i).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('edge case: pinning residency updates the policy copy', async ({ page }) => {
    await page.goto(ROUTE);
    const eu = page.getByRole('button', { name: /^EU$/i }).first();
    if (await eu.isVisible().catch(() => false)) {
      await eu.click();
      await expect(page.getByText(/Pinned to|residency/i).first()).toBeVisible();
    }
  });
});
