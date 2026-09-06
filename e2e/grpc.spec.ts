/**
 * gRPC high-throughput channel (F-077) — browser smoke.
 * Happy path: the channel explorer loads and a throughput benchmark reports req/s.
 * Edge: page renders its designed states, never blank. Auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/grpc';
const HEADING = /gRPC High-Throughput Channel/i;

test.describe('gRPC channel — smoke', () => {
  test('renders the channel explorer with proto + methods, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/enrichment\.proto/i)).toBeVisible();
    await expect(page.getByText(/Service methods/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: running a benchmark reports throughput', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /^Run$/i }).click();
    await expect(page.getByText(/req\/s/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Throughput/i).first()).toBeVisible();
  });

  test('edge case: client snippets are shown and switchable', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/grpcurl/i).first()).toBeVisible();
    await page.getByRole('button', { name: /^Go$/i }).click();
    await expect(page.getByText(/grpc\.Dial/i)).toBeVisible();
  });
});
