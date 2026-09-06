import { detectDisposable, isDisposableDomain } from '@/lib/disposable-detector';

describe('disposable detection — isDisposableDomain', () => {
  it('flags known providers, including on a subdomain', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('inbox.mailinator.com')).toBe(true);
    expect(isDisposableDomain('guerrillamail.com')).toBe(true);
  });
  it('does not flag mainstream free or corporate domains', () => {
    ['gmail.com', 'outlook.com', 'stripe.com', 'datadoghq.com'].forEach((d) =>
      expect(isDisposableDomain(d)).toBe(false));
  });
  it('flags unlisted domains that carry disposable keywords', () => {
    expect(isDisposableDomain('sneaky-tempmail.io')).toBe(true);
    expect(isDisposableDomain('my-burner-inbox.co')).toBe(true);
  });
});

describe('disposable detection — detectDisposable', () => {
  it('returns null only for empty input', () => {
    expect(detectDisposable('')).toBeNull();
    expect(detectDisposable('user@mailinator.com')).not.toBeNull();
  });

  it('classifies a known throwaway provider with high confidence', () => {
    const r = detectDisposable('user@mailinator.com')!;
    expect(r.is_disposable).toBe(true);
    expect(r.verdict).toBe('disposable');
    expect(r.category).toBe('throwaway');
    expect(r.matched_on).toBe('known-provider');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('classifies a temporary-mailbox provider by category', () => {
    const r = detectDisposable('x@10minutemail.com')!;
    expect(r.verdict).toBe('disposable');
    expect(r.category).toBe('temporary-mailbox');
  });

  it('marks an unlisted keyword domain as suspected (heuristic), not certain', () => {
    const r = detectDisposable('signup@sneaky-tempmail.io')!;
    expect(r.is_disposable).toBe(true);
    expect(r.verdict).toBe('suspected');
    expect(r.matched_on).toBe('heuristic');
    expect(r.confidence).toBeLessThan(0.98);
  });

  it('marks a mainstream free provider as trusted, not disposable', () => {
    const r = detectDisposable('sam@gmail.com')!;
    expect(r.is_disposable).toBe(false);
    expect(r.verdict).toBe('trusted');
    expect(r.is_free_provider).toBe(true);
    expect(r.matched_on).toBe('free-provider');
  });

  it('marks a normal corporate domain as trusted with no signal', () => {
    const r = detectDisposable('jane.doe@acme.com')!;
    expect(r.is_disposable).toBe(false);
    expect(r.verdict).toBe('trusted');
    expect(r.matched_on).toBe('no-signal');
  });

  it('is deterministic', () => {
    expect(detectDisposable('user@mailinator.com')).toEqual(detectDisposable('USER@Mailinator.com  '));
  });
});
