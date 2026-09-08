/**
 * API keys hashed at rest (F-321) — browser + API smoke.
 * Happy path: the console shows each key's SHA-256 identity, the inspector hashes a
 * pasted key locally and recognises it, and the gateway attestation matches. Edge:
 * designed states, never blank; verify rejects plaintext. Console is auto-authenticated.
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';

const ROUTE = '/console/key-hashing';
const KEY = 'sk_test_e2e_keyhash_00000001';
const auth = { Authorization: `Bearer ${KEY}` };
const digest = createHash('sha256').update(KEY).digest('hex');

test.describe('Key Hashing console — smoke', () => {
  test('renders identities, inspector and attestation, no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { name: /^Key Hashing$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /as the gateway knows them/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hash inspector/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /What the gateway holds/i })).toBeVisible();
    await expect(page.getByText(/^sha256:[0-9a-f]{16}$/).first()).toBeVisible();
    expect(errors, `runtime errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('happy path: the inspector hashes a pasted key locally', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByLabel(/API key to inspect/i).fill(KEY);
    await expect(page.getByText(`sha256:${digest.slice(0, 16)}`)).toBeVisible();
    await expect(page.getByText(digest)).toBeVisible();
    await expect(page.getByText(/Not one of your keys/i)).toBeVisible();
  });

  test('edge case: a malformed candidate is flagged but still hashed', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByLabel(/API key to inspect/i).fill('hello');
    await expect(page.getByText(/Not a Zinbit key shape/i)).toBeVisible();
    await expect(page.getByText('sha256:2cf24dba5fb0a30e').first()).toBeVisible(); // sha256("hello")
  });
});

test.describe('Key hashing gateway — /v1/keys/hashing', () => {
  test('GET attests zero plaintext copies and the fingerprint header matches the digest', async ({ request }) => {
    const res = await request.get('/api/v1/keys/hashing', { headers: auth });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-key-fingerprint']).toBe(`sha256:${digest.slice(0, 16)}`);
    const body = await res.json();
    expect(body.data.audit.plaintextCopies).toBe(0);
    expect(body.data.audit.clean).toBe(true);
    expect(body.data.key.hash).toBe(digest);
    expect(JSON.stringify(body)).not.toContain(KEY);

    const other = await request.get('/api/v1/people/phone?email=ceo@example.com', { headers: auth });
    expect(other.headers()['x-key-fingerprint']).toBe(`sha256:${digest.slice(0, 16)}`);
  });

  test('verify accepts a digest, rejects plaintext', async ({ request }) => {
    const ok = await request.post('/api/v1/keys/hashing/verify', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { hash: digest } });
    expect((await ok.json()).data.match).toBe(true);
    const wrong = await request.post('/api/v1/keys/hashing/verify', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { hash: '0'.repeat(64) } });
    expect((await wrong.json()).data.match).toBe(false);
    const plain = await request.post('/api/v1/keys/hashing/verify', { headers: { ...auth, 'Content-Type': 'application/json' }, data: { hash: KEY } });
    expect(plain.status()).toBe(400);
  });
});
