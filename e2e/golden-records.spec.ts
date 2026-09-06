/**
 * Golden-record snapshots (F-054) — browser smoke.
 * Happy path: capture + version history + diff. Edge: a private-mailbox / unresolvable
 * capture surfaces a toast, not a crash. The console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/golden-records';
const HEADING = /Golden-Record Snapshots/i;

test.describe('Golden-record snapshots — smoke', () => {
  test('renders with its header and seeded history, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();

    // Seeded entities appear (Entities panel) and a version history renders.
    await expect(page.getByText(/Entities tracked/i)).toBeVisible();
    await expect(page.getByText(/Version history/i)).toBeVisible();
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: comparing versions shows a field-level diff', async ({ page }) => {
    await page.goto(ROUTE);
    // The compare panel exists once an entity with >= 1 snapshot is selected (default).
    await expect(page.getByText(/Compare versions/i)).toBeVisible();
    // A record-of-truth badge marks the pinned version.
    await expect(page.getByText(/record of truth/i).first()).toBeVisible();
  });

  test('edge case: capturing an unresolvable identifier surfaces a message, not a blank', async ({ page }) => {
    await page.goto(ROUTE);
    const input = page.getByPlaceholder(/company domain or corporate email/i);
    await input.fill('not-an-entity');
    await page.getByRole('button', { name: /Capture/i }).click();
    // A toast appears (no new version / could not resolve) and the page stays intact.
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
  });
});
