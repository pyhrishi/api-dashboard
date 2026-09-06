/**
 * Request coalescing (F-068) — browser smoke.
 * Happy path: the console loads live stats and a drill collapses a wave.
 * Edge: the page renders its designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/coalescing';
const HEADING = /Request Coalescing/i;

test.describe('Request coalescing — smoke', () => {
  test('renders with header + KPIs, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Upstream calls saved/i)).toBeVisible();
    await expect(page.getByText(/How coalescing works/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: running a drill collapses a wave to one upstream call', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Run drill/i }).click();
    // The result banner shows a "1 upstream call" badge after the wave collapses.
    await expect(page.getByText(/1 upstream call/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/coalesced/i).first()).toBeVisible();
  });

  test('edge case: recent waves list is present (seeded), not a blank area', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/Recent coalesced waves/i)).toBeVisible();
  });
});
