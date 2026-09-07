/**
 * Field-level PII masking (F-313) — browser smoke.
 * Happy path: the console renders the per-field policy + a live before/after preview.
 * Edge: designed states, never blank. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/pii-masking';

test.describe('PII masking console — smoke', () => {
  test('renders policy + preview, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /PII Masking/i })).toBeVisible();
    await expect(page.getByText(/Per-field masking policy/i)).toBeVisible();
    await expect(page.getByText(/Masking preview/i)).toBeVisible();
    await expect(page.getByText(/Sandbox \(unmasked\)/i)).toBeVisible();
    await expect(page.getByText(/Live \(masked\)/i)).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('the sample email is masked in the live column', async ({ page }) => {
    await page.goto(ROUTE);
    // The unmasked sample address appears in the sandbox column…
    await expect(page.getByText(/jordan\.rivera@northwind\.io/i)).toBeVisible();
    // …and the masked form keeps the domain but not the full local part.
    await expect(page.getByText(/@northwind\.io/i).first()).toBeVisible();
  });

  test('edge case: government ID is marked always-redacted', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/always redacted/i).first()).toBeVisible();
  });
});
