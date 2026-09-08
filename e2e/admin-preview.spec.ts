/**
 * Admin Panel stitch — the console side of "Preview as customer" (F-575) and the
 * launcher to the separate Zinbit Admin app. The admin app deep-links
 * /console/preview-session?token=sk_test_… ; the console must accept a REAL token
 * (never a masked display string — the original bug) and label every screen.
 */
import { test, expect } from '@playwright/test';

const REAL_TOKEN = 'sk_test_a1b2c3d4e5f60718293a'; // sk_test_ + 20 url-safe chars, like the admin mint
const future = () => Date.now() + 30 * 60_000;

test.describe('Operator preview handoff', () => {
  test('a real sandbox token opens the console as the customer and labels every screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`/console/preview-session?token=${REAL_TOKEN}&customer=Meridian%20Labs&expires=${future()}&operator=ops@zintlr.com`);
    await expect(page.getByText(/viewing as Meridian Labs/i).first()).toBeVisible();
    await expect(page.getByText(/expires in/i).first()).toBeVisible();
    // The preview key is added to API Keys and the banner rides every console page.
    await page.goto('/console/overview');
    await expect(page.getByText(/Viewing as Meridian Labs/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Exit preview/i })).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('a masked display string is rejected (the old admin-panel bug cannot recur)', async ({ page }) => {
    await page.goto(`/console/preview-session?token=${encodeURIComponent('sk_test_••••abcd')}&customer=Acme&expires=${future()}`);
    await expect(page.getByText(/isn’t usable|masked display string/i)).toBeVisible();
  });

  test('an expired session is refused', async ({ page }) => {
    await page.goto(`/console/preview-session?token=${REAL_TOKEN}&customer=Acme&expires=${Date.now() - 1000}`);
    await expect(page.getByText(/has expired/i)).toBeVisible();
  });
});

test.describe('Zinbit Admin launcher (stitch on the prototype)', () => {
  test('the console links out to the separate admin app for admins', async ({ page }) => {
    await page.goto('/console/overview');
    const launcher = page.locator('a[href="http://localhost:3200"]');
    await expect(launcher).toHaveCount(1);
    await expect(launcher).toHaveAttribute('target', '_blank');
    await expect(launcher).toHaveAttribute('rel', /noopener/);
  });
});
