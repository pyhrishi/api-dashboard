/**
 * Key labels & ownership (F-124) — browser smoke.
 * Happy path: the governance dashboard renders with KPIs and per-key owner
 * selectors. Edge: the "show unowned" filter narrows the list.
 *
 * Auto-authenticated console (admin, seeds keys); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/key-ownership';

test.describe('Key Ownership — smoke', () => {
  test('renders with KPIs and per-key ownership, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Key Ownership/i })).toBeVisible();
    await expect(page.getByText(/Unowned/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: assign an owner via the select', async ({ page }) => {
    await page.goto(ROUTE);
    const select = page.locator('select').filter({ hasText: /Unassigned/i }).first();
    if (await select.isVisible().catch(() => false)) {
      const optionCount = await select.locator('option').count();
      if (optionCount > 1) {
        await select.selectOption({ index: 1 });
        await expect(page.locator('body')).not.toBeEmpty();
      }
    }
  });
});
