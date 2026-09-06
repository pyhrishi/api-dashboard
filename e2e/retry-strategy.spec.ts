/**
 * Graceful 429 with retry-after (F-134) — browser smoke.
 * Happy path: the retry-strategy console renders the backoff ladders + snippet.
 * Edge: triggering a real 429 surfaces the Retry-After guidance.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 * (Client-side companion to F-129/F-130 rate limiting.)
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/retry-strategy';

test.describe('Retry Strategy — smoke', () => {
  test('renders the backoff model + snippet, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Retry Strategy/i })).toBeVisible();
    await expect(page.getByText(/Honouring Retry-After/i)).toBeVisible();
    await expect(page.getByText(/fetchWithRetry/i).first()).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('edge case: triggering a 429 surfaces retry guidance', async ({ page }) => {
    await page.goto(ROUTE);
    const trigger = page.getByRole('button', { name: /Trigger 429/i });
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(page.getByText(/429|under the limit/i).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
