/**
 * Content-Security-Policy (F-315) — browser smoke.
 * Verifies the console serves a CSP header on page navigations and the console
 * renders the policy + violation feed. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

test.describe('CSP — smoke', () => {
  test('a page navigation carries the report-only CSP header', async ({ page }) => {
    const res = await page.goto('/console/csp');
    const headers = res?.headers() ?? {};
    const csp = headers['content-security-policy-report-only'] ?? headers['content-security-policy'];
    expect(csp, 'a CSP header should be present').toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('report-uri /api/csp-report');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('the console renders the policy + directives + feed', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/console/csp');
    await expect(page.getByRole('heading', { name: /Content Security Policy/i })).toBeVisible();
    await expect(page.getByText(/Active policy/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Violation feed/i })).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('the report collector answers GET with stats', async ({ request }) => {
    const res = await request.get('/api/csp-report');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('recent');
  });
});
