/**
 * Payload size & depth limits (F-314) — browser + API smoke.
 * Happy path: the console renders limits + analyzer, a sample shows a violation with
 * a chunk plan, and the gateway dry run agrees. Edge: an oversized real request is
 * refused with an explaining 422 and lands in the ledger. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/payload-limits';
const KEY = 'sk_test_e2e_payload_00000001'; // sandbox → Starter limits
const auth = { Authorization: `Bearer ${KEY}` };

test.describe('Payload Limits console — smoke', () => {
  test('renders limits, analyzer and ledger, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Payload Limits$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Your limits/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Payload analyzer/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Recent rejections/i })).toBeVisible();
    await expect(page.getByText(/Body size/i).first()).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: a 1,200-item sample shows the 422 + chunk plan, and the dry run agrees', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Batch of 1,200 emails/i }).click();
    await expect(page.getByText(/422 PAYLOAD_ARRAY_TOO_LONG/).first()).toBeVisible();
    await expect(page.getByText(/Chunk plan:/i)).toBeVisible();
    const dry = page.getByRole('button', { name: /Dry run at gateway/i });
    if (await dry.isEnabled()) {
      await dry.click();
      await expect(page.getByText(/Live dry run/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/would return 422 PAYLOAD_ARRAY_TOO_LONG/i)).toBeVisible();
      await expect(page.getByText(/^X-Payload-Limit-Bytes:/)).toBeVisible();
    }
  });

  test('edge case: a healthy sample is within every limit', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Batch of 200 emails/i }).click();
    await expect(page.getByText(/Within every limit/i)).toBeVisible();
  });
});

test.describe('Payload limits gateway — /v1/limits/payload', () => {
  test('GET advertises limits + ledger and every response carries the limit headers', async ({ request }) => {
    const res = await request.get('/api/v1/limits/payload', { headers: auth });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-payload-limit-bytes']).toBe('262144');
    expect(res.headers()['x-payload-limit-depth']).toBe('16');
    const body = await res.json();
    expect(body.data.tier).toBe('Starter');
    expect(Array.isArray(body.data.rejections)).toBe(true);

    const other = await request.get('/api/v1/people/phone?email=ceo@example.com', { headers: auth });
    expect(other.headers()['x-payload-limit-bytes']).toBe('262144');
  });

  test('an oversized real request is refused with an explaining 422 that lands in the ledger', async ({ request }) => {
    const before = (await (await request.get('/api/v1/limits/payload', { headers: auth })).json()).data.stats.total as number;
    const inputs = Array.from({ length: 1200 }, (_, i) => ({ email: `person${i}@example.com` }));
    const res = await request.post('/api/v1/batch/enrich', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { inputs } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('PAYLOAD_ARRAY_TOO_LONG');
    expect(body.error.details).toMatchObject({ dimension: 'arrayLength', measured: 1200, limit: 500, tier: 'Starter' });
    expect(body.error.details.fix).toContain('3 requests of ≤400 items');
    const after = (await (await request.get('/api/v1/limits/payload', { headers: auth })).json()).data;
    expect(after.stats.total).toBe(before + 1);
    expect(after.rejections[0].code).toBe('PAYLOAD_ARRAY_TOO_LONG');
  });

  test('the escape hatch is open: the same 1,200 inputs are accepted by POST /v1/jobs', async ({ request }) => {
    const inputs = Array.from({ length: 1200 }, (_, i) => ({ email: `person${i}@example.com` }));
    const res = await request.post('/api/v1/jobs', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { endpoint: 'people-phone', inputs } });
    const body = await res.json();
    expect(body?.error?.code ?? null).not.toBe('PAYLOAD_ARRAY_TOO_LONG');
    expect(res.status()).not.toBe(422);
  });

  test('the dry run measures without executing; PATCH tightens and null clears', async ({ request }) => {
    let v: unknown = { email: 'a@b.co' };
    for (let i = 0; i < 39; i++) v = { wrapper: v };
    const dry = await request.post('/api/v1/limits/payload/check?target=/v1/batch/enrich', { headers: { ...auth, 'Content-Type': 'application/json' }, data: v });
    expect(dry.status()).toBe(200);
    expect((await dry.json()).data.wouldReturn).toEqual({ status: 422, code: 'PAYLOAD_TOO_DEEP' });

    const tightened = await request.patch('/api/v1/limits/payload', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { maxArrayLength: 100, maxBodyBytes: 99999999 } });
    const t = (await tightened.json()).data;
    expect(t.limits.maxArrayLength).toBe(100);
    expect(t.limits.maxBodyBytes).toBe(262144); // ceiling wins
    const cleared = await request.patch('/api/v1/limits/payload', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { maxArrayLength: null, maxBodyBytes: null } });
    expect((await cleared.json()).data.limits.maxArrayLength).toBe(500);
  });
});
