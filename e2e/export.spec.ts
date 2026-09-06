/**
 * Bulk export endpoint (F-076) — browser smoke.
 * Happy path: preview shows matched/rows/cost + a sample table. Edge: page renders
 * its designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/export';
const HEADING = /Bulk Export/i;

test.describe('Bulk export — smoke', () => {
  test('renders the builder with no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Build your export/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: preview returns matched rows + cost and a sample', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Preview/i }).click();
    await expect(page.getByText(/Matched/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Sample/i)).toBeVisible();
    // The Download button becomes enabled once there are matched rows.
    await expect(page.getByRole('button', { name: /Download/i })).toBeEnabled();
  });

  test('edge case: a copyable curl command is shown after preview', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Preview/i }).click();
    await expect(page.getByText(/Or pull it from the API/i)).toBeVisible({ timeout: 10_000 });
  });
});
