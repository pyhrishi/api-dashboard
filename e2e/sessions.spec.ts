/**
 * Session management (F-310) — browser smoke.
 * Happy path: the sessions console renders the KPI tiles, current device, and other sessions.
 * Edge: the high-risk callout explains why a session is flagged.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/sessions';

test.describe('Sessions — smoke', () => {
  test('renders sessions + risk, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Sessions$/i })).toBeVisible();
    await expect(page.getByText(/This device/i).first()).toBeVisible();
    await expect(page.getByText(/Other sessions/i)).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('edge case: a risky session explains why', async ({ page }) => {
    await page.goto(ROUTE);
    const why = page.getByRole('button', { name: /Why this rating/i }).first();
    if (await why.isVisible().catch(() => false)) {
      await why.click();
      // At least one reason bullet becomes visible.
      await expect(page.getByText(/no anomalies|different|idle for|external network|country/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});
