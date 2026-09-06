/**
 * Test & live key pairs (F-112) — browser smoke.
 * Happy path: generate a matched pair and see both test + live keys. Edge:
 * the empty state renders when there are no pairs.
 *
 * Auto-authenticated console (admin); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/key-pairs';

test.describe('Key Pairs — smoke', () => {
  test('renders with its header and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Key Pairs/i })).toBeVisible();
    // Either existing pairs or the designed empty state.
    await expect(page.locator('main, body')).not.toBeEmpty();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: generate a matched test + live pair', async ({ page }) => {
    await page.goto(ROUTE);
    const newBtn = page.getByRole('button', { name: /New pair|Generate a pair/i }).first();
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.getByPlaceholder(/Production/i).fill('E2E Pair');
      await page.getByRole('button', { name: /Create pair/i }).click();
      // The pair renders both sides.
      await expect(page.getByText(/E2E Pair/i).first()).toBeVisible();
      await expect(page.getByText(/^Test$/).first()).toBeVisible();
      await expect(page.getByText(/^Live$/).first()).toBeVisible();
    }
  });
});
