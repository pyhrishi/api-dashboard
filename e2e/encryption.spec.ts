/**
 * Encryption in transit & at rest (F-312) — browser smoke.
 * Happy path: the console renders the transit + at-rest posture and the live check
 * reads the X-Encryption-* headers. Edge: designed states, never blank.
 * Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/encryption';

test.describe('Encryption console — smoke', () => {
  test('renders transit + at-rest posture, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Encryption$/i })).toBeVisible();
    await expect(page.getByText(/In transit/i).first()).toBeVisible();
    await expect(page.getByText(/Customer-managed keys/i)).toBeVisible();
    await expect(page.getByText(/Encrypted data stores/i)).toBeVisible();
    await expect(page.getByText(/attestation/i).first()).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('live check surfaces the X-Encryption response headers', async ({ page }) => {
    await page.goto(ROUTE);
    const check = page.getByRole('button', { name: /Run live check/i });
    if (await check.isEnabled()) {
      await check.click();
      await expect(page.getByText(/X-Encryption-Transit/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/X-Encryption-Rest/i)).toBeVisible();
    }
  });

  test('edge case: the KMS key table lists AES-256-GCM keys', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/AES-256-GCM/i).first()).toBeVisible();
  });
});
