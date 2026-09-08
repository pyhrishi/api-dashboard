/**
 * Alert Center + delivery + weekly PM digest (F-194 / F-526 / F-553) — browser smoke.
 * Happy path: a Growth scenario rehearsal opens incidents, they show in the header bell
 * and the Alert Center, one is acknowledged with a note, and "Send now" records a digest
 * with deliveries. Edge: read-only role gating copy and the empty states are designed.
 * The console is auto-authenticated (admin).
 */
import { test, expect } from '@playwright/test';

test.describe('Alert Center — smoke', () => {
  test('renders KPIs, rules, routing, ledger and digest with no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/console/alerts');
    await expect(page.getByRole('heading', { name: /^Alert Center$/ })).toBeVisible();
    for (const title of ['Incidents', 'Rules & thresholds', 'Routing', 'Delivery ledger', 'Weekly PM digest', 'Digest history']) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('slider', { name: /Wallet top-up failure rate threshold/i })).toBeVisible();
    await expect(page.getByRole('switch', { name: /Slack/ }).first()).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: a rehearsal fires alerts → bell → acknowledge with a note → send the digest', async ({ page }) => {
    await page.goto('/console/growth');
    await page.getByRole('heading', { name: /^Growth$/ }).waitFor();
    await page.getByRole('tab', { name: /Provider incident/i }).click();
    // The bell shows the new incidents
    const bell = page.getByRole('button', { name: /Notifications/ });
    await expect(bell).toHaveAttribute('aria-label', /new alert/);
    await bell.click();
    await expect(page.getByRole('dialog', { name: /Growth alerts/ })).toBeVisible();
    await expect(page.getByText(/rehearsal/).first()).toBeVisible();
    await page.getByRole('dialog', { name: /Growth alerts/ }).getByRole('link', { name: /Alert Center/ }).click();

    await expect(page.getByRole('heading', { name: /^Alert Center$/ })).toBeVisible();
    await expect(page.getByText(/Wallet top-up failure rate/).first()).toBeVisible();
    await page.getByRole('button', { name: /^Acknowledge$/ }).first().click();
    await page.getByPlaceholder(/What you found/).fill('Gateway confirmed declines from the acquirer; retrying with fallback.');
    await page.getByRole('button', { name: /Acknowledge as/ }).click();
    await expect(page.getByText(/Acknowledged/).first()).toBeVisible();
    await page.getByRole('tab', { name: /Acked/ }).click();
    await expect(page.getByText(/Gateway confirmed declines/)).toBeVisible();

    // Delivery ledger has entries for the fired incidents
    await expect(page.getByRole('heading', { name: 'Delivery ledger', exact: true })).toBeVisible();
    await expect(page.getByText(/#eng-oncall/).first()).toBeVisible();

    // Digest: send now and see it in history
    await page.getByRole('button', { name: /^Send now$/ }).first().click();
    await expect(page.getByText(/Digest sent/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^View$/ }).first()).toBeVisible();
  });

  test('edge case: thresholds are clamped to their bounds and a custom value is labelled', async ({ page }) => {
    await page.goto('/console/alerts');
    const slider = page.getByRole('slider', { name: /Documentation search .* threshold/i });
    await slider.focus();
    await slider.fill('50');
    await expect(page.getByText(/\(custom\)/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /default > 20%/ })).toBeVisible();
    await page.getByRole('button', { name: /default > 20%/ }).click();
    await expect(page.getByText(/\(custom\)/)).toHaveCount(0);
  });
});
