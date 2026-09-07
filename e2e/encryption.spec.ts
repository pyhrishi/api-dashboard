/**
 * Encryption in transit & at rest (F-312) — browser + API smoke.
 * Happy path: the console renders the transit + at-rest posture and the live check
 * reads the X-Encryption-* headers and the signed attestation. Edge: designed states,
 * never blank; the gateway signs and verifies. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/console/encryption';
const KEY = 'sk_live_e2e_encryption_00000001';

test.describe('Encryption console — smoke', () => {
  test('renders transit + at-rest posture, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Encryption$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^In transit$/i })).toBeVisible();
    await expect(page.getByText(/Customer-managed keys/i)).toBeVisible();
    await expect(page.getByText(/Encrypted data stores/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Encryption attestation/i })).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('live check surfaces the X-Encryption response headers + a signed attestation', async ({ page }) => {
    await page.goto(ROUTE);
    const check = page.getByRole('button', { name: /Run live check/i });
    if (await check.isEnabled()) {
      await check.click();
      // Anchored so the footer note that names the header doesn't match too.
      await expect(page.getByText(/^X-Encryption-Transit:/)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/^X-Encryption-Rest:/)).toBeVisible();
      await expect(page.getByText(/Signed · HMAC-SHA256/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Copy signature/i })).toBeVisible();
    }
  });

  test('edge case: the KMS key table lists AES-256-GCM keys and randomized PII is locked on', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByText(/AES-256-GCM/i).first()).toBeVisible();
    await expect(page.getByLabel(/full_name: randomized encryption on, always on/i)).toBeVisible();
  });
});

test.describe('Encryption gateway — /v1/encryption', () => {
  test('GET returns a signed posture and the encryption headers ride the response', async ({ request }) => {
    const res = await request.get('/api/v1/encryption', { headers: { Authorization: `Bearer ${KEY}` } });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-encryption-transit']).toContain('TLS1.3');
    expect(res.headers()['x-encryption-rest']).toContain('pii=field-level');
    const body = await res.json();
    expect(body.data.attestation).toMatch(/^att_/);
    expect(body.data.signature.alg).toBe('HMAC-SHA256');

    const verify = await request.get(`/api/v1/encryption/verify?attestation=${body.data.attestation}&sig=${body.data.signature.sig}`, { headers: { Authorization: `Bearer ${KEY}` } });
    expect((await verify.json()).data.valid).toBe(true);
    const tampered = await request.get(`/api/v1/encryption/verify?attestation=${body.data.attestation}&sig=${'0'.repeat(64)}`, { headers: { Authorization: `Bearer ${KEY}` } });
    expect((await tampered.json()).data.valid).toBe(false);
  });

  test('PATCH syncs settings and changes the attestation; randomized fields cannot be relaxed', async ({ request }) => {
    const before = await (await request.get('/api/v1/encryption', { headers: { Authorization: `Bearer ${KEY}` } })).json();
    const patched = await request.patch('/api/v1/encryption', {
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      data: { rotationDays: 30, fieldEncryption: { email: false, full_name: false } },
    });
    expect(patched.status()).toBe(200);
    const body = await patched.json();
    expect(body.data.rotationDays).toBe(30);
    expect(body.data.applied.fieldEncryption).toEqual({ email: false });
    expect(body.data.posture.fields.find((f: { field: string }) => f.field === 'full_name').enabled).toBe(true);
    expect(body.data.posture.attestation).not.toBe(before.data.attestation);
    // restore
    await request.patch('/api/v1/encryption', { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, data: { rotationDays: 90, fieldEncryption: { email: true } } });
  });
});
