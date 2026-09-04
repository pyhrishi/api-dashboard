/**
 * Email → Person Resolution smoke — the F-001 flagship happy path:
 *   Resolve page → run a real gateway resolve → profile renders with confidence + provenance
 *   → the call flows into Logs → the resolution persists across a reload.
 */
import { test, expect } from '@playwright/test';

test.describe('Email → Person Resolution', () => {
  test('resolves an email to a profile and flows through the spine', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/console/resolve');
    await expect(page.getByRole('heading', { name: /Person Resolution/i })).toBeVisible();

    // Enter an email and resolve against the real gateway.
    await page.getByLabel('Work email to resolve').fill('jane.doe@acme.com');
    await page.getByRole('button', { name: /^Resolve/i }).click();

    // The profile assembles: name, confidence meter, and provenance.
    await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Provenance/i)).toBeVisible();
    await expect(page.getByText(/confidence/i).first()).toBeVisible();

    // Determinism: re-running the same email yields the same person.
    await page.getByLabel('Work email to resolve').fill('jane.doe@acme.com');
    await page.getByRole('button', { name: /^Resolve/i }).click();
    await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible();

    // Recent resolutions history shows the entry.
    await expect(page.getByText(/Recent resolutions/i)).toBeVisible();

    // The real round-trip is in Logs.
    await page.goto('/console/logs');
    await expect(page.getByText('/v1/people').first()).toBeVisible();

    // Persistence — history survives a reload.
    await page.goto('/console/resolve');
    await page.reload();
    await expect(page.getByText('jane.doe@acme.com').first()).toBeVisible();

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
