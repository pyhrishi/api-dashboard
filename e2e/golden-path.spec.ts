/**
* The golden path — the demo spine that must never break:
*   console (auto-authenticated) → Explorer runs a REAL gateway call → it appears in Logs
*   → survives a reload → shows up as adoption in Growth.
* Plus the two gateway invariants the console relies on (console keys work; live-only masking).
*/
import { test, expect } from '@playwright/test';

test.describe('Golden path', () => {
  test('a console user runs a real call and sees it flow through the spine', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1. Explorer — pick a real endpoint, fill its required param, run it.
    await page.goto('/console/explorer');
    const endpointButton = page.getByRole('button', { name: /Find Phone by Email/i }).first();
    await expect(endpointButton).toBeVisible();
    await endpointButton.click();

    await page.getByPlaceholder('user@company.com').fill('ceo@example.com');
    const run = page.getByRole('button', { name: /Send Request/i });
    await expect(run, 'the seeded sandbox key must have scope for this endpoint').toBeEnabled();
    await run.click();

    // The response panel renders the real gateway status.
    await expect(page.getByText(/200 OK/)).toBeVisible({ timeout: 20_000 });

    // 2. Logs — the real round-trip is in the shared log stream.
    await page.goto('/console/logs');
    await expect(page.getByText('/v1/people/phone').first()).toBeVisible();

    // 3. Persistence — state survives a reload.
    await page.reload();
    await expect(page.getByText('/v1/people/phone').first()).toBeVisible();

    // 4. Growth — the run was measured (explorer_run event).
    await page.goto('/console/growth');
    await expect(page.getByText(/explorer run/i).first()).toBeVisible();

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('a console-created key authenticates and bills against the real gateway', async ({ request }) => {
    const res = await request.get('/api/v1/people/phone?email=ceo@example.com', {
      headers: { Authorization: 'Bearer sk_test_e2e_console_key' },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(res.headers()['x-credits-remaining']).toBeDefined();
    expect(res.headers()['x-ratelimit-limit']).toBeDefined();
  });

  test('sandbox responses are unmasked; live responses are DPDP-masked', async ({ request }) => {
    const headers = (key: string) => ({ Authorization: `Bearer ${key}`, 'x-country-code': 'IN' });
    const sandbox = await (await request.get('/api/v1/people/phone?email=ceo@example.com', { headers: headers('sk_test_e2e_mask') })).json();
    const live = await (await request.get('/api/v1/people/phone?email=ceo@example.com', { headers: headers('sk_live_e2e_mask') })).json();
    expect(sandbox.data.email).toBe('ceo@example.com');
    expect(live.data.email).toContain('***');
  });
});
