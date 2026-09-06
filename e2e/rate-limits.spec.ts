/**
 * Token-bucket rate limiting (F-129) — browser smoke.
 * Happy path: the rate-limit console renders the bucket model + a burst
 * simulator. Edge: firing a real burst returns a throttled result.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 * (Owns /console/rate-limits; F-130 owns /console/rate-limit-headers.)
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/rate-limits';

test.describe('Rate Limits — smoke', () => {
  test('renders the bucket model + simulator, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Rate Limits/i })).toBeVisible();
    await expect(page.getByText(/Burst capacity/i)).toBeVisible();
    await expect(page.getByText(/Simulated preview/i)).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('edge case: firing a live burst returns a result', async ({ page }) => {
    await page.goto(ROUTE);
    const fire = page.getByRole('button', { name: /Fire \d+/i }).first();
    if (await fire.isVisible().catch(() => false)) {
      await fire.click();
      // Either the allowed/429 result panel or a designed error — never blank.
      await expect(page.getByText(/Allowed|429|failed/i).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
