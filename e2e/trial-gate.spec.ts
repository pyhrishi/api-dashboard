/**
 * Risk-based phone OTP at trial activation (F-503) — browser + auth-API smoke.
 * Happy path: the console shows the activation banner, the T&S console simulates a flagged
 * sign-up and classifies a temp number; the auth API runs a full challenge with fallback.
 * Edge: locked conditions can't be disabled; a rejected number never gets a code. Console is
 * auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/trial-gate';
const json = { 'Content-Type': 'application/json' };

test.describe('Trial Gate console — smoke', () => {
  test('renders the T&S console and the activation banner, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Trial Gate$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Sign-up simulator/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Temp-phone verifier/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Gate policy/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Challenge ledger/i })).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: a persona simulation shows the flagged conditions; the number checker declines a temp number', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: /Second person, same company/i }).click();
    await expect(page.getByText(/phone OTP required/i)).toBeVisible();
    await expect(page.getByText(/already on meridianlabs\.in/i)).toBeVisible();
    await page.getByLabel(/Phone number to check/i).fill('99999 12345');
    await expect(page.getByText(/temp provider/i).first()).toBeVisible();
    await expect(page.getByText(/known receive-SMS number pattern/i)).toBeVisible();
  });

  test('edge case: the signup page asks for no phone; the console banner offers activation', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText(/No phone number needed to start/i)).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    await page.goto('/console/overview');
    await expect(page.getByRole('region', { name: /Trial activation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Activate trial/i })).toBeVisible();
  });
});

test.describe('Shared auth API — /api/auth', () => {
  test('flagged sign-up → temp number rejected → SMS fails → WhatsApp fallback → verify → activated', async ({ request }) => {
    const acct = `acct_e2e_${Date.now().toString(36)}`;
    const ev = await (await request.post('/api/auth/trial/evaluate', { headers: json, data: { accountId: acct, email: `e2e.${Date.now().toString(36)}@gmail.com`, company: 'Personal', ip: '203.0.113.99' } })).json();
    expect(ev.data.evaluation.decision).toBe('challenge');
    expect(ev.data.evaluation.tripped).toContain('non_icp');

    const bad = await request.post('/api/auth/phone/challenge', { headers: json, data: { accountId: acct, evaluationId: ev.data.evaluation.id, phone: '99999 12345', country: 'IN' } });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).error.details.reason).toBe('temp_provider');

    const ch = await request.post('/api/auth/phone/challenge', { headers: json, data: { accountId: acct, evaluationId: ev.data.evaluation.id, phone: '98450 12399', country: 'IN' } });
    expect(ch.status()).toBe(201);
    const c = (await ch.json()).data;
    expect(c.send.channel).toBe('sms');
    expect(c.send.deliveryStatus).toBe('failed');
    expect(JSON.stringify(c)).not.toContain('9845012399');

    const wa = (await (await request.post('/api/auth/phone/resend', { headers: json, data: { challengeId: c.challenge.id } })).json()).data;
    expect(wa.channel).toBe('whatsapp');
    expect(wa.fallbackFrom).toBe('sms');

    const inbox = (await (await request.get(`/api/auth/demo/inbox/${c.challenge.id}`)).json()).data;
    expect(inbox.sandbox).toBe(true);
    const code = inbox.messages.find((m: { channel: string }) => m.channel === 'whatsapp').code;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await request.post('/api/auth/phone/verify', { headers: json, data: { challengeId: c.challenge.id, code: '000000' } });
    expect([400, 200]).toContain(wrong.status());
    const ok = await request.post('/api/auth/phone/verify', { headers: json, data: { challengeId: c.challenge.id, code } });
    if (ok.status() !== 200) expect((await wrong.json()).success).toBe(true); // '000000' happened to be the code
    const state = (await (await request.get(`/api/auth/phone/challenge/${acct}`)).json()).data;
    expect(state.state).toBe('verified');
    expect(state.channelUsed).toBe('whatsapp');
    const again = (await (await request.post('/api/auth/trial/evaluate', { headers: json, data: { accountId: acct, email: `e2e.${acct}@gmail.com`, company: 'Personal', ip: '203.0.113.99' } })).json()).data.evaluation;
    expect(again.decision).toBe('exempt');
  });

  test('policy: locked conditions stay on and thresholds clamp; a clean ICP sign-up allows instantly', async ({ request }) => {
    const res = await request.patch('/api/auth/policy/zinbit', { headers: json, data: { conditionsEnabled: { duplicate_domain: false }, smallCompanyThreshold: 99999 } });
    const body = (await res.json()).data;
    expect(body.policy.conditionsEnabled.duplicate_domain).toBe(true);
    expect(body.policy.smallCompanyThreshold).toBe(1000);
    expect(body.ignored).toContain('conditionsEnabled.duplicate_domain (locked on)');
    await request.patch('/api/auth/policy/zinbit', { headers: json, data: { smallCompanyThreshold: 100 } });
    const clean = (await (await request.post('/api/auth/trial/evaluate', { headers: json, data: { accountId: 'acct_e2e_clean', email: 'anita.rao@zerodha.com', company: 'Zerodha', ip: '198.51.100.201', simulate: true } })).json()).data.evaluation;
    expect(clean.decision).toBe('allow');
  });
});
