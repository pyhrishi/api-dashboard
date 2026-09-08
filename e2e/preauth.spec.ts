/**
 * Pre-auth TOFU (Step 6, Section F C0-b) — signup SSO.
 * The GitHub / Google buttons complete a one-click signup and funnel into the trial
 * activation flow; `signup_started` fires on the gate. The landing mock-sandbox gate
 * (C0-a) is covered by the funnel engine's components.
 */
import { test, expect } from '@playwright/test';

test.describe('Signup SSO — pre-auth', () => {
  test('GitHub SSO completes signup and funnels into activation, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/signup');
    await expect(page.getByRole('button', { name: /Continue with GitHub/i })).toBeVisible();
    await page.getByRole('button', { name: /Continue with GitHub/i }).click();
    await expect(page).toHaveURL(/\/console\/activate/, { timeout: 15_000 });
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('Google SSO is a real, working alternative (not a dead affordance)', async ({ page }) => {
    await page.goto('/signup');
    const google = page.getByRole('button', { name: /Continue with Google/i });
    await expect(google).toBeVisible();
    await google.click();
    await expect(page).toHaveURL(/\/console\/activate/, { timeout: 15_000 });
  });

  test('landing on the signup gate records signup_started (C0-b)', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForTimeout(600);
    const started = await page.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('zinbit-storage') || '{}');
        return (s.state?.telemetryEvents || []).some((e: { name: string }) => e.name === 'signup_started');
      } catch { return false; }
    });
    expect(started).toBe(true);
  });
});
