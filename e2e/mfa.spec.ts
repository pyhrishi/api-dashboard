/**
 * MFA enforcement (F-309) — browser smoke.
 * Happy path: the MFA console renders policy + compliance and enrollment works.
 * Edge: designed states, never blank. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/mfa';
const HEADING = /MFA Enforcement/i;

test.describe('MFA enforcement — smoke', () => {
  test('renders policy + compliance, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
    await expect(page.getByText(/Organization policy/i)).toBeVisible();
    await expect(page.getByText(/Member compliance/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: the enrollment flow reveals a secret + recovery codes', async ({ page }) => {
    await page.goto(ROUTE);
    const setup = page.getByRole('button', { name: /Set up authenticator/i });
    if (await setup.count()) {
      await setup.click();
      await expect(page.getByText(/Add this secret/i)).toBeVisible();
      await expect(page.getByText(/recovery codes/i)).toBeVisible();
    } else {
      // Already enrolled — the enrolled state is shown.
      await expect(page.getByText(/Enrolled/i).first()).toBeVisible();
    }
  });

  test('edge case: compliance KPIs are present', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/Compliance/i).first()).toBeVisible();
  });
});
