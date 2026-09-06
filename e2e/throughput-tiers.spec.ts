/**
 * Tier-based throughput (F-131) — browser smoke.
 * Happy path: the tier ladder + current tier render, and "Verify live" confirms the limit.
 * Edge: designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/throughput-tiers';
const HEADING = /Tier-Based Throughput/i;

test.describe('Tier-based throughput — smoke', () => {
  test('renders the tier ladder + current tier, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Your key’s tier|Your key's tier/i)).toBeVisible();
    await expect(page.getByText(/Starter/).first()).toBeVisible();
    await expect(page.getByText(/Enterprise/).first()).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: verify-live confirms the gateway limit', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Verify live/i }).click();
    await expect(page.getByText(/RateLimit-Limit/i)).toBeVisible({ timeout: 10_000 });
  });

  test('edge case: burst/sustained KPIs are present', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/Sustained/i).first()).toBeVisible();
  });
});
