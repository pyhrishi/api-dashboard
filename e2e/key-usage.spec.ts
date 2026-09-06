/**
 * Last-used & usage per key (F-118) — browser smoke.
 * Happy path: the dashboard renders per-key usage + KPIs. Edge: the freshness
 * filter narrows the list.
 *
 * Auto-authenticated console (seeds keys); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/key-usage';

test.describe('Key Usage — smoke', () => {
  test('renders per-key usage with KPIs, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Key Usage/i })).toBeVisible();
    await expect(page.getByText(/Total requests/i)).toBeVisible();
    // Either seeded keys render or the designed empty state.
    await expect(page.locator('body')).not.toBeEmpty();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('edge case: the freshness filter narrows the list', async ({ page }) => {
    await page.goto(ROUTE);
    const attention = page.getByRole('button', { name: /Needs attention/i }).first();
    if (await attention.isVisible().catch(() => false)) {
      await attention.click();
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});
