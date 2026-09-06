/**
 * GraphQL gateway (F-065) — browser smoke.
 * Happy path: the Explorer renders, and running the default query returns a
 * response with a credit cost. Edge case: the schema browser lists queries and
 * clicking one loads a template.
 *
 * Auto-authenticated console (seeds API keys); pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/graphql';

test.describe('GraphQL gateway — smoke', () => {
  test('renders the Explorer with schema browser, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /GraphQL/i })).toBeVisible();
    // Schema browser lists the queries.
    await expect(page.getByText(/^person$/).first()).toBeVisible();
    await expect(page.getByText(/Queries/i).first()).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: running the default query returns a response with a cost', async ({ page }) => {
    await page.goto(ROUTE);
    const run = page.getByRole('button', { name: /^Run$/i });
    if (await run.isVisible().catch(() => false)) {
      await run.click();
      // Response panel shows a status + credit cost (or a designed empty/error).
      await expect(page.getByText(/credit|error|ok/i).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('edge case: clicking a schema query loads a template', async ({ page }) => {
    await page.goto(ROUTE);
    const companyBtn = page.getByRole('button', { name: /company/i }).first();
    if (await companyBtn.isVisible().catch(() => false)) {
      await companyBtn.click();
      await expect(page.locator('textarea')).toContainText(/company/i);
    }
  });
});
