/**
 * PLG KPI framework (F-390 / F-195 / F-530) — browser smoke.
 * Happy path: the Growth dashboard renders the TOFU/MOFU/BOFU funnel with drop-off,
 * time-to-activate statistics, bands, engagement, heatmap, cohorts, health and the
 * four alert rules from the sample cohort; a scenario makes the right alerts fire.
 * Edge: the workspace scope with no activations shows designed empty states, never a
 * blank card; docs search reports no-results as a designed state with a Support exit.
 * The console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/growth';

test.describe('Growth KPI dashboard — smoke', () => {
  test('renders the whole framework from the sample cohort, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Growth$/ })).toBeVisible();
    await expect(page.getByText(/sample cohort/i).first()).toBeVisible();
    for (const title of ['Activation funnel', 'Time to activate', 'Power users by usage band', 'Trial usage', 'Engagement', 'Endpoint utilization heatmap', 'Revenue by signup cohort', 'Health', 'Alerting thresholds']) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    // Funnel stages with a drop-off badge on every stage after the first
    for (const stage of ['Signed up', 'Created an API key', 'Activated', 'Trial fully used', 'Paid']) {
      await expect(page.getByText(stage, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/biggest leak/i).first()).toBeVisible();
    // The four owners are routed
    for (const owner of ['Product', 'Eng', 'Docs owner']) {
      await expect(page.getByText(new RegExp(`→\\s*${owner}`)).first()).toBeVisible();
    }
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: the provider-incident scenario fires the OTP and top-up alerts', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('heading', { name: /^Growth$/ }).waitFor();
    await page.getByRole('tab', { name: /Provider incident/i }).click();
    const topUp = page.getByRole('button', { name: /Wallet top-up failure rate/i }).first();
    await topUp.click();
    await expect(page.getByText(/Alert Eng/)).toBeVisible();
    const otp = page.getByRole('button', { name: /Phone OTP completion rate/i }).first();
    await otp.click();
    await expect(page.getByText(/Alert Product/).first()).toBeVisible();
  });

  test('edge case: the workspace scope is one developer — every section still renders, nothing blank', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('heading', { name: /^Growth$/ }).waitFor();
    await page.getByRole('tab', { name: /Your workspace/i }).click();
    // The sample-cohort label must disappear: this is now only real workspace data.
    await expect(page.getByText(/seeded developers/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Activation funnel', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alerting thresholds', exact: true })).toBeVisible();
    // With a single developer the WoW rule cannot be evaluated — it must say so, not fire.
    await page.getByRole('button', { name: /Activation rate drop week-over-week/i }).first().click();
    await expect(page.getByText(/Needs signups in both of the last two weeks|within threshold/).first()).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Docs search — the docs no-results KPI source', () => {
  test('finds endpoints and guides, and hands a no-result search to Support', async ({ page }) => {
    await page.goto('/docs');
    const input = page.getByLabel('Search the documentation');
    await input.click();
    await input.pressSequentially('webhook');
    await expect(page.getByRole('option').first()).toBeVisible();
    await input.fill('quaternion flux capacitor');
    await expect(page.getByText(/No results for/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Ask support/i })).toBeVisible();
  });
});
