/**
 * Bulk Enrichment Jobs — the feature's smoke path:
 *   New job → sample data → map/validate → cost preview → run through the REAL gateway
 *   → rows succeed/skip → results downloadable → calls visible in Logs.
 */
import { test, expect } from '@playwright/test';

test.describe('Bulk Enrichment Jobs', () => {
  test('a developer runs a sample job end-to-end', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/jobs');
    await expect(page.getByRole('heading', { name: 'Bulk Jobs' })).toBeVisible();
    await page.getByRole('button', { name: 'New job' }).click();

    // Step 1 — endpoint + source
    await page.getByLabel('Endpoint').selectOption('email-to-phone');
    await page.getByRole('button', { name: 'Load sample dataset' }).click();
    await expect(page.getByText('Loaded')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — mapping auto-filled, key auto-selected, validation preview shows skips
    await expect(page.getByLabel('Job name')).not.toHaveValue('');
    await expect(page.getByText(/will be skipped/i)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — cost preview, then run
    await expect(page.getByText('Credit cost', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Create & run/i }).click();

    await expect(page).toHaveURL(/\/console\/jobs\/job_/);
    await expect(page.getByText(/^Completed/).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Succeeded').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();

    // Every row went through the gateway → visible in Logs.
    await page.goto('/console/logs');
    await expect(page.getByText('/v1/people/phone').first()).toBeVisible();

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
