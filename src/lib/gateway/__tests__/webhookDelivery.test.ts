import {
  registerDelivery,
  getDelivery,
  listDeliveries,
  replayDelivery,
  getDeliveryStats,
  isValidCallbackUrl,
  __resetDeliveries,
} from '@/lib/gateway/webhookDelivery';

const HOUR = 3600_000;

beforeEach(() => __resetDeliveries());

describe('isValidCallbackUrl', () => {
  it('accepts http(s) and rejects everything else', () => {
    expect(isValidCallbackUrl('https://hooks.acme.com/x')).toBe(true);
    expect(isValidCallbackUrl('http://localhost:4000/cb')).toBe(true);
    expect(isValidCallbackUrl('ftp://x.com')).toBe(false);
    expect(isValidCallbackUrl('not a url')).toBe(false);
    expect(isValidCallbackUrl('')).toBe(false);
  });
});

describe('delivery lifecycle (deterministic from time)', () => {
  const past = (h: number) => Date.now() - h * HOUR;

  it('delivers first-try to a healthy URL and signs the payload', () => {
    const d = registerDelivery({ jobId: 'job_1', callbackUrl: 'https://ok.acme.com/hook', scheduledAt: past(1), payload: '{"x":1}' });
    const v = getDelivery(d.id)!;
    expect(v.status).toBe('delivered');
    expect(v.attempts).toHaveLength(1);
    expect(v.attempts[0].outcome).toBe('delivered');
    expect(v.attempts[0].status_code).toBe(200);
    expect(v.delivered_at).toBeDefined();
    // signature is a t=,v1= pair and stable for the same inputs
    expect(v.signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(getDelivery(d.id)!.signature).toBe(v.signature);
  });

  it('is pending before the scheduled time', () => {
    const d = registerDelivery({ jobId: 'job_2', callbackUrl: 'https://ok.acme.com/hook', scheduledAt: Date.now() + HOUR, payload: '{}' });
    const v = getDelivery(d.id)!;
    expect(v.status).toBe('pending');
    expect(v.attempts).toHaveLength(0);
    expect(v.next_retry_at).toBeDefined();
  });

  it('dead-letters a URL that never succeeds after exhausting attempts', () => {
    const d = registerDelivery({ jobId: 'job_3', callbackUrl: 'https://webhook.fail.example.com/x', scheduledAt: past(2), payload: '{}' });
    const v = getDelivery(d.id)!;
    expect(v.status).toBe('failed');
    expect(v.attempts.length).toBe(v.max_attempts);
    expect(v.attempts.every((a) => a.outcome === 'failed')).toBe(true);
    expect(v.delivered_at).toBeUndefined();
  });

  it('replays a failed delivery to success', () => {
    const d = registerDelivery({ jobId: 'job_4', callbackUrl: 'https://webhook.fail.example.com/x', scheduledAt: past(2), payload: '{}' });
    expect(getDelivery(d.id)!.status).toBe('failed');
    const r = replayDelivery(d.id);
    expect(r.success).toBe(true);
    const v = getDelivery(d.id)!;
    expect(v.status).toBe('delivered');
    expect(v.replayed).toBe(true);
    expect(v.attempts[v.attempts.length - 1].detail).toMatch(/replay/i);
  });

  it('refuses to replay an already-delivered delivery', () => {
    const d = registerDelivery({ jobId: 'job_5', callbackUrl: 'https://ok.acme.com/hook', scheduledAt: past(1), payload: '{}' });
    const r = replayDelivery(d.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('ALREADY_DELIVERED');
  });

  it('reports coherent stats over the seed + new deliveries', () => {
    registerDelivery({ jobId: 'job_6', callbackUrl: 'https://ok.acme.com/hook', scheduledAt: past(1), payload: '{}' });
    const stats = getDeliveryStats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.delivered + stats.retrying + stats.failed + stats.pending).toBe(stats.total);
    expect(stats.success_rate).toBeGreaterThanOrEqual(0);
    expect(stats.success_rate).toBeLessThanOrEqual(1);
  });

  it('lists newest first', () => {
    const a = registerDelivery({ jobId: 'j_a', callbackUrl: 'https://ok.acme.com/a', scheduledAt: past(3), payload: '{}' });
    const b = registerDelivery({ jobId: 'j_b', callbackUrl: 'https://ok.acme.com/b', scheduledAt: past(1), payload: '{}' });
    const ids = listDeliveries().map((d) => d.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });
});
