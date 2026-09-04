/**
 * Enrichment Studio smoke — the consolidated F-001/F-002 surface:
 *   pick a lookup → real gateway call → result with confidence + provenance →
 *   switch preset → run again → both flow into Logs → history persists across reload.
 */
import { test, expect } from '@playwright/test';

test.describe('Enrichment Studio', () => {
  test('runs person + company lookups through one catalog-driven workspace', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/studio');
    await expect(page.getByRole('heading', { name: 'Enrichment Studio' })).toBeVisible();

    // Default preset: resolve a person.
    await page.getByLabel(/input/i).fill('jane.doe@acme.com');
    await page.getByRole('button', { name: /^Run/i }).click();
    await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Provenance —/)).toBeVisible();

    // Switch to the company preset and enrich a domain.
    await page.getByRole('button', { name: /Enrich a company/i }).click();
    await page.getByLabel(/input/i).fill('stripe.com');
    await page.getByRole('button', { name: /^Run/i }).click();
    await expect(page.getByText('Tech stack', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Switch to Reverse IP and identify the company behind an IP.
    await page.getByRole('button', { name: /Reverse IP/i }).click();
    await page.getByLabel(/input/i).fill('8.8.8.8');
    await page.getByRole('button', { name: /^Run/i }).click();
    await expect(page.getByText('ASN', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Unified history holds both.
    await expect(page.getByText(/Recent enrichments/i)).toBeVisible();

    // Both real round-trips are in Logs.
    await page.goto('/console/logs');
    await expect(page.getByText('/v1/people').first()).toBeVisible();
    await expect(page.getByText('/v1/companies/enrich').first()).toBeVisible();
    await expect(page.getByText('/v1/enrichment/ip').first()).toBeVisible();

    // History persists across a reload.
    await page.goto('/console/studio');
    await page.reload();
    await expect(page.getByText('stripe.com').first()).toBeVisible();

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('the old /console/resolve route redirects into the Studio', async ({ page }) => {
    await page.goto('/console/resolve');
    await expect(page).toHaveURL(/\/console\/studio\?preset=person/);
    await expect(page.getByRole('heading', { name: 'Enrichment Studio' })).toBeVisible();
  });
});
