/**
 * Scoped key permissions (F-113) — browser smoke.
 * Happy path: the Key Scopes console loads the catalog + endpoint matrix and runs
 * live probes. Edge: designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/scopes';
const HEADING = /Scoped Key Permissions/i;

test.describe('Scoped key permissions — smoke', () => {
  test('renders catalog + endpoint matrix, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Scope catalog/i)).toBeVisible();
    await expect(page.getByText(/Endpoint . required scope/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: running probes reports allow/deny statuses', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Run probes/i }).click();
    // Each probe shows an HTTP status (200 allowed / 403 denied).
    await expect(page.getByText(/Company enrich/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/200|403/).first()).toBeVisible();
  });

  test('edge case: the scope-check KPIs are present', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/Registered keys/i)).toBeVisible();
    await expect(page.getByText(/Denials/i)).toBeVisible();
  });
});
