/**
 * Per-feature browser smoke — copy to `e2e/<feature>.spec.ts` when you build a feature.
 * Keep it to the happy path + one edge case; the golden-path spec covers the spine.
 *
 * The console is auto-authenticated (the store seeds `isAuthenticated: true`), so no login.
 * Tests run against a pinned dev server on :3111 (see playwright.config.ts).
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/<area>';          // ← the feature's route
const HEADING = /<Feature title>/i;       // ← the PageHeader title

test.describe('<Feature> — smoke', () => {
  test('renders with its header and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();

    // The page must never be blank: either real content or a designed empty state.
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: <primary action> works', async ({ page }) => {
    await page.goto(ROUTE);
    // await page.getByRole('button', { name: /<primary action>/i }).click();
    // await expect(page.getByText(/<success signal>/i)).toBeVisible();
  });

  test('edge case: <empty | error | permission> state is designed, not blank', async ({ page }) => {
    await page.goto(ROUTE);
    // e.g. filter to nothing and assert the EmptyState copy is visible.
  });
});
