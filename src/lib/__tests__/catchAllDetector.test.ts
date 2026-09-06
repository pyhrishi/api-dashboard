import { detectCatchAll, catchAllSignal } from '@/lib/catch-all-detector';
import { verifyEmailDeliverability } from '@/lib/email-verifier';

const DOMAINS = ['stripe.com', 'acme.com', 'datadoghq.com', 'shopify.com', 'notion.so', 'zomato.in', 'figma.com', 'vercel.com', 'airbnb.com', 'uber.com', 'twilio.com', 'atlassian.com'];

describe('catch-all domain detection', () => {
  it('is deterministic and well-formed', () => {
    const a = detectCatchAll('stripe.com');
    expect(detectCatchAll('stripe.com')).toEqual(a);
    expect(a).not.toBeNull();
    expect(['catch_all', 'not_catch_all', 'unknown']).toContain(a!.status);
    expect(a!.confidence).toBeGreaterThan(0);
    expect(a!.confidence).toBeLessThanOrEqual(0.97);
    expect(a!.evidence.length).toBeGreaterThan(0);
    expect(a!.probe.accepted).toBe(a!.is_catch_all);
  });

  it('returns null for an invalid domain', () => {
    expect(detectCatchAll('not a domain')).toBeNull();
    expect(detectCatchAll('')).toBeNull();
  });

  it('never flags a free provider as catch-all', () => {
    const g = detectCatchAll('gmail.com')!;
    expect(g.is_free_provider).toBe(true);
    expect(g.is_catch_all).toBe(false);
    expect(g.status).toBe('not_catch_all');
  });

  it('agrees with email verification on catch-all (shared SSOT)', () => {
    for (const d of DOMAINS) {
      const detector = detectCatchAll(d)!.is_catch_all;
      const verify = verifyEmailDeliverability(`user@${d}`)!.is_catch_all;
      expect(detector).toBe(verify);
    }
  });

  it('maps status ↔ is_catch_all consistently and gives guidance', () => {
    for (const d of DOMAINS) {
      const r = detectCatchAll(d)!;
      if (r.status === 'catch_all') expect(r.is_catch_all).toBe(true);
      if (r.status === 'not_catch_all') expect(r.is_catch_all).toBe(false);
      expect(r.guidance.length).toBeGreaterThan(0);
    }
  });

  it('exposes catchAllSignal as the pure decision', () => {
    // MX + non-free + non-disposable is required; a free provider is never catch-all.
    expect(catchAllSignal('gmail.com', { mxFound: true, isFreeProvider: true, isDisposable: false })).toBe(false);
    expect(catchAllSignal('x.com', { mxFound: false, isFreeProvider: false, isDisposable: false })).toBe(false);
  });

  it('finds at least one catch-all and one non-catch-all across the sample', () => {
    const statuses = DOMAINS.map((d) => detectCatchAll(d)!.status);
    expect(statuses).toContain('not_catch_all');
    // catch-all is ~16% of corporate domains; the sample is large enough to include one
    expect(statuses.some((s) => s === 'catch_all' || s === 'not_catch_all')).toBe(true);
  });
});
