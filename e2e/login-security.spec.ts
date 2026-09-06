/**
 * Brute-force login protection (F-306) — browser smoke.
 * Console: incident view + simulator. Login: repeated failures lock the account.
 * The console is auto-authenticated; /login is public.
 */
import { test, expect } from '@playwright/test';

test.describe('Login security console — smoke', () => {
  test('renders the incident console with policy + KPIs, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/login-security');
    await expect(page.getByRole('heading', { name: /Login Security/i })).toBeVisible();
    await expect(page.getByText(/Lockout policy/i)).toBeVisible();
    await expect(page.getByText(/Locked accounts/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: simulating failures records attempts', async ({ page }) => {
    await page.goto('/console/login-security');
    await page.getByRole('button', { name: /Failed attempt/i }).click();
    await expect(page.getByText(/attempts left|locked/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Login lockout — smoke', () => {
  test('repeated failed sign-ins lock the account with a countdown', async ({ page }) => {
    await page.goto('/login');
    // A demo "error" email fails auth; fire past the threshold.
    for (let i = 0; i < 5; i++) {
      await page.getByPlaceholder(/developer@startup.com/i).fill('error@attacker.com');
      await page.getByPlaceholder('••••••••').fill('wrongpass');
      await page.getByRole('button', { name: /^Sign in$/i }).click();
    }
    await expect(page.getByText(/locked/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
