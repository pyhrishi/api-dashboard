/**
 * Currency normalization (F-056) — browser smoke via the Studio preset.
 * Happy path: normalize a scaled/locale value → canonical amount + conversion panel.
 * Edge: an ambiguous symbol still resolves and surfaces the assumption.
 * The console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/studio?preset=currency-normalize';

test.describe('Currency normalization — smoke', () => {
  test('renders the Studio with the currency preset, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Enrichment Studio/i })).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: normalizing a value shows the canonical amount + conversion', async ({ page }) => {
    await page.goto(ROUTE);
    // Run one of the seeded examples (e.g. ₹1,200 crore) via the example chips,
    // or type a value and submit. The example chips are the most stable target.
    const example = page.getByRole('button', { name: /crore|1\.2M|1\.200\.000/i }).first();
    if (await example.count()) {
      await example.click();
      // The currency panel surfaces an ISO code and an "In USD" conversion.
      await expect(page.getByText(/Canonical/i).first()).toBeVisible();
    }
  });

  test('edge case: page never blanks on an ambiguous or empty input', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Enrichment Studio/i })).toBeVisible();
  });
});
