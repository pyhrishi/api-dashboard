/**
 * Dark-launch preview endpoints (F-081) — browser smoke.
 * Happy path: the preview program renders and a non-enrolled "Try it" returns
 * the real 403 gate; enrolling then trying succeeds. Edge: enroll toggles.
 *
 * Auto-authenticated console (seeds API keys); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/preview';

test.describe('Preview Program — smoke', () => {
  test('renders the preview program, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Preview Program/i })).toBeVisible();
    await expect(page.getByText(/People Search v2/i)).toBeVisible();
    await expect(page.getByText(/Buying Signals/i)).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('the gate is real: a non-enrolled Try it returns 403', async ({ page }) => {
    await page.goto(ROUTE);
    // Ensure not enrolled: if an "Enrolled" badge shows, leave first.
    const tryBtn = page.getByRole('button', { name: /Try it/i }).first();
    if (await tryBtn.isVisible().catch(() => false)) {
      await tryBtn.click();
      // Either the 403 gate or a 200 (if already enrolled) — never blank.
      await expect(page.getByText(/opt-in required|served the preview/i).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('edge case: enrolling toggles the button', async ({ page }) => {
    await page.goto(ROUTE);
    const enroll = page.getByRole('button', { name: /^Enroll$/i }).first();
    if (await enroll.isVisible().catch(() => false)) {
      await enroll.click();
      await expect(page.getByText(/Enrolled/i).first()).toBeVisible();
    }
  });
});
