/**
 * Standard rate-limit headers (F-130) — browser smoke.
 * Happy path: inspect a live response and read the RateLimit-* headers.
 * Edge: designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/rate-limit-headers';
const HEADING = /Standard Rate-Limit Headers/i;

test.describe('Standard rate-limit headers — smoke', () => {
  test('renders with the header reference, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/The header contract/i)).toBeVisible();
    await expect(page.getByText(/RateLimit-Policy/i).first()).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: inspecting a live response shows the parsed limit/remaining', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /^Inspect$/i }).click();
    await expect(page.getByText(/Remaining/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Raw response headers/i)).toBeVisible();
  });

  test('edge case: standard vs legacy badge is shown after inspection', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /^Inspect$/i }).click();
    await expect(page.getByText(/Standard RateLimit-\* present|Legacy X- only/i)).toBeVisible({ timeout: 10_000 });
  });
});
