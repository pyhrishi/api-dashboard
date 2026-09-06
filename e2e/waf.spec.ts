/**
 * Web Application Firewall (F-303) — browser smoke.
 * Happy path: the WAF console renders the rule catalog + payload tester.
 * Edge: pasting a SQLi payload surfaces a "Blocked" verdict.
 *
 * Auto-authenticated console; pinned dev server on :3111.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/waf';

test.describe('Firewall (WAF) — smoke', () => {
  test('renders the rule catalog + tester, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /Web Application Firewall/i })).toBeVisible();
    await expect(page.getByText(/Rule catalog/i)).toBeVisible();
    await expect(page.getByText(/SQL Injection/i).first()).toBeVisible();

    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('edge case: a SQLi payload is flagged Blocked', async ({ page }) => {
    await page.goto(ROUTE);
    const box = page.getByLabel(/Payload to inspect/i);
    await box.fill("'; DROP TABLE users; --");
    await expect(page.getByText(/Blocked/i).first()).toBeVisible({ timeout: 5000 });
  });
});
