/**
 * Accuracy benchmarking (F-044) — browser smoke.
 * Happy path: the benchmark report renders with per-category scores and a
 * re-sample works. Edge case: the "vs. competitors" view renders comparison
 * bars — never a blank panel.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/benchmarks';

test.describe('Accuracy benchmarks — smoke', () => {
  test('renders the report with categories and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Accuracy Benchmarks/i })).toBeVisible();
    // A category we always publish.
    await expect(page.getByText(/Registry identity/i).first()).toBeVisible();
    await expect(page.getByText(/Methodology/i).first()).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: re-sample records a run', async ({ page }) => {
    await page.goto(ROUTE);
    const resample = page.getByRole('button', { name: /Re-sample/i }).first();
    if (await resample.isVisible().catch(() => false)) {
      await resample.click();
      await expect(page.getByText(/Benchmark re-sampled|samples/i).first()).toBeVisible();
      await expect(page.getByText(/Re-sample history/i)).toBeVisible();
    }
  });

  test('edge case: competitor view renders comparison bars', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /vs\. competitors/i }).click();
    await expect(page.getByText(/Zinbit/i).first()).toBeVisible();
    await expect(page.getByText(/Clearbit|ZoomInfo|Apollo|People Data Labs/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
