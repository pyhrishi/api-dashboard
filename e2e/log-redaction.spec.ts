/**
 * PII redaction in internal logs (F-322) — browser + API smoke.
 * Happy path: the Redaction Tester runs the gateway engine locally on a pasted payload;
 * a real request lands in the internal log tail with its PII stripped. Edge: designed
 * states, never blank; the policy can't be weakened below its floors. Console is
 * auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/log-redaction';
const KEY = 'sk_test_e2e_logredact_00000001';
const auth = { Authorization: `Bearer ${KEY}` };
const EMAIL = 'e2e.person@northwind.io';

test.describe('Log Redaction console — smoke', () => {
  test('renders KPIs, tester, tail, policy and attestation, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Log Redaction$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Redaction Tester/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Internal log tail/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Redaction policy/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Attestation/i })).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: the tester redacts a pasted payload locally with correlation tokens', async ({ page }) => {
    await page.goto(ROUTE);
    const input = page.getByLabel(/Before — what you paste/i);
    await input.fill(JSON.stringify({ email: 'ceo@example.com', note: 'card 4111 1111 1111 1111', authorization: 'Bearer sk_live_e2e_secret_000000000001' }));
    const after = page.getByTestId('tester-after');
    await expect(after).toContainText(/\[email:tk_[0-9a-f]{12}\]/);
    await expect(after).toContainText('[credit_card:redacted]');
    await expect(after).toContainText(/\[secret:sha256:[0-9a-f]{16}\]/);
    await expect(after).not.toContainText('ceo@example.com');
    await expect(after).not.toContainText('4111');
  });

  test('edge case: plain text (not JSON) is still redacted; clearing returns the designed empty state', async ({ page }) => {
    await page.goto(ROUTE);
    const input = page.getByLabel(/Before — what you paste/i);
    await input.fill('GET /v1/people/phone?email=ceo@example.com from 198.51.100.24');
    await expect(page.getByTestId('tester-after')).toContainText(/\[ip_address:tk_/);
    await input.fill('');
    await expect(page.getByText(/Redacted output appears here/i)).toBeVisible();
  });
});

test.describe('Log redaction gateway — /v1/logs/redaction', () => {
  test('a real request is logged with its PII stripped; GET reports it and the self-test passes', async ({ request }) => {
    const call = await request.get(`/api/v1/people/phone?email=${encodeURIComponent(EMAIL)}`, { headers: auth });
    expect(Number(call.headers()['x-log-redaction'])).toBeGreaterThanOrEqual(1);

    const res = await request.get('/api/v1/logs/redaction', { headers: auth });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.selfTest.passed).toBe(true);
    expect(body.data.selfTest.leaks).toBe(0);
    expect(body.data.metrics.lines).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(body);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('jordan.rivera@northwind.io'); // the canary never leaves the engine either
    // The request writes two lines: "API Request Initiated" (URL + key → tokenized email + fingerprint)
    // and the terminal access line. The tokenized one must be there; none may carry the email.
    const lines = body.data.tail.filter((l: { line: string }) => l.line.includes('people/phone'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l: { line: string }) => /\[email:tk_[0-9a-f]{12}\]/.test(l.line))).toBe(true);
  });

  test('dry run redacts without logging; PATCH cannot weaken below a floor or disable redaction', async ({ request }) => {
    const before = (await (await request.get('/api/v1/logs/redaction', { headers: auth })).json()).data.metrics.lines;
    const dry = await request.post('/api/v1/logs/redaction/test', { headers: { ...auth, 'Content-Type': 'text/plain' }, data: `contact ${EMAIL} or +1 415 555 0142` });
    expect(dry.status()).toBe(200);
    const d = await dry.json();
    expect(d.data.total).toBe(2);
    expect(JSON.stringify(d.data.redacted)).not.toContain(EMAIL);
    const after = (await (await request.get('/api/v1/logs/redaction', { headers: auth })).json()).data.metrics.lines;
    expect(after).toBe(before);

    const patch = await request.patch('/api/v1/logs/redaction', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { strategies: { government_id: 'partial', email: 'drop' }, enabled: false } });
    const p = await patch.json();
    expect(p.data.policy.strategies.government_id).toBe('drop');
    expect(p.data.policy.strategies.email).toBe('drop');
    expect(p.data.ignored).toContain('strategies.government_id');
    // Restore the default so other specs see the shipped policy.
    await request.patch('/api/v1/logs/redaction', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { strategies: { email: 'token' } } });
  });
});
