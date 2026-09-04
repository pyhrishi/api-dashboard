/**
 * Domain → Company Enrichment smoke (F-002): enrich page → real gateway enrich →
 * dossier renders with confidence + provenance → flows into Logs → persists across reload.
 */
import { test, expect } from '@playwright/test';

test.describe('Domain → Company Enrichment', () => {
  test('enriches a domain to a dossier and flows through the spine', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/enrich');
    await expect(page.getByRole('heading', { name: /Company Enrichment/i })).toBeVisible();

    await page.getByLabel('Company domain to enrich').fill('stripe.com');
    await page.getByRole('button', { name: /^Enrich/i }).click();

    // Dossier assembles: confidence meter + provenance + tech stack.
    await expect(page.getByText(/Provenance/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Tech stack', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Headcount', { exact: true }).first()).toBeVisible();

    await expect(page.getByText(/Recent enrichments/i)).toBeVisible();

    // The real round-trip is in Logs.
    await page.goto('/console/logs');
    await expect(page.getByText('/v1/companies/enrich').first()).toBeVisible();

    // Persistence — history survives a reload.
    await page.goto('/console/enrich');
    await page.reload();
    await expect(page.getByText('stripe.com').first()).toBeVisible();

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
