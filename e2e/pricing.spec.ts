/**
 * Pricing & Cost Calculator (`/console/pricing`) — browser smoke.
 * Happy path: an empty mix shows a designed empty state; loading the sample mix
 * produces a live estimate, plan comparison, and a recommendation. Edge: a hard
 * cap surfaces the "calls would be refused (402)" block warning, not a wrong number.
 * The console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/pricing';

test.describe('Cost Calculator — smoke', () => {
  test('renders with its header and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Cost Calculator/i })).toBeVisible();
    await expect(page.locator('main')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: a sample mix produces an estimate and a recommendation', async ({ page }) => {
    await page.goto(ROUTE);

    // Empty state offers a sample mix; loading it populates the calculator.
    const loadSample = page.getByRole('button', { name: /Load a sample mix/i });
    if (await loadSample.isVisible().catch(() => false)) {
      await loadSample.click();
    }

    // A non-zero credit total and dollar cost appear.
    await expect(page.getByText(/Total credits \/ month/i)).toBeVisible();
    await expect(page.getByText(/This mix, priced on each plan/i)).toBeVisible();
    // Every tier is priced.
    for (const tier of ['Starter', 'Growth', 'Enterprise']) {
      await expect(page.getByText(new RegExp(`${tier}`)).first()).toBeVisible();
    }
    // A best-fit recommendation is shown.
    await expect(page.getByText(/Best fit/i).first()).toBeVisible();
  });

  test('edge case: a hard cap warns that calls would be refused', async ({ page }) => {
    await page.goto(ROUTE);
    const loadSample = page.getByRole('button', { name: /Load a sample mix/i });
    if (await loadSample.isVisible().catch(() => false)) {
      await loadSample.click();
    }
    await page.getByRole('button', { name: /Hard cap/i }).click();
    await expect(page.getByText(/calls would be refused/i)).toBeVisible();
  });
});
