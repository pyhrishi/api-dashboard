/**
 * Completeness hygiene — the affordances that make the console feel finished:
 *   global ⌘K palette on every route · Security Hub reachable from nav · Explorer deep links
 *   · Organization settings (rename persists across reload).
 */
import { test, expect } from '@playwright/test';

test.describe('Console hygiene', () => {
  test('the command palette works from any route and runs an action', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/logs');
    await page.getByRole('button', { name: 'Open command palette' }).click();
    const input = page.getByPlaceholder(/Search endpoints, pages, requests/i);
    await expect(input).toBeVisible();

    // Results are derived from the catalog, not hardcoded: an endpoint name resolves.
    await input.fill('phone by email');
    await expect(page.getByRole('option', { name: /Run Find Phone by Email/i })).toBeVisible();

    // Keyboard flow: type an action, Enter runs it.
    await input.fill('invite');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/console\/settings\/team/);

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Security Hub is reachable and Explorer deep links preselect the endpoint', async ({ page }) => {
    await page.goto('/console/security');
    await expect(page.getByText(/Unauthorized Scope/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Security Hub/i })).toBeVisible();

    await page.goto('/console/explorer?endpoint=email-to-phone');
    await expect(page.getByPlaceholder('user@company.com')).toBeVisible();
  });

  test('an admin can rename the organization and it persists', async ({ page }) => {
    await page.goto('/console/settings/organization');
    const name = page.getByLabel(/Organization name/i);
    await expect(name).toBeVisible();

    await name.fill('Acme Robotics');
    await page.getByRole('button', { name: /Save changes/i }).click();
    await expect(page.getByText(/Organization updated/i)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/Organization name/i)).toHaveValue('Acme Robotics');
  });
});
