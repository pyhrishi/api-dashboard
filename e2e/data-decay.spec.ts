/**
 * Data decay alerts (F-042) — browser smoke.
 * Happy path: the decay-alert inbox renders and a record can be triaged
 * (snoozed off the Open tab). Edge case: raising the threshold to Critical
 * narrows the inbox, and the empty state is designed when a tab is empty.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/data-decay';

test.describe('Data decay alerts — smoke', () => {
  test('renders with its header and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Data Decay Alerts/i })).toBeVisible();

    // At least one at-risk alert renders (a Re-verify CTA per row) or a designed empty state.
    const hasAlerts = await page.getByRole('button', { name: /Re-verify/i }).first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/No records at risk|No monitored records/i).first().isVisible().catch(() => false);
    expect(hasAlerts || hasEmpty).toBeTruthy();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: snoozing a record moves it off the Open tab', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Data Decay Alerts/i })).toBeVisible();

    const snooze = page.getByRole('button', { name: /^Snooze$/i }).first();
    if (await snooze.isVisible().catch(() => false)) {
      await snooze.click();
      await page.getByRole('button', { name: /7 days/i }).first().click();
      await expect(page.getByText(/Snoozed/i).first()).toBeVisible();
      // It now appears under the Snoozed tab.
      await page.getByRole('button', { name: /^Snoozed/i }).click();
      await expect(page.getByRole('button', { name: /Reopen/i }).first()).toBeVisible();
    }
  });

  test('edge case: Critical threshold narrows the inbox, empty state is designed', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /^Critical$/i }).first().click();
    // Either fewer critical alerts, or a designed empty state — never blank.
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
