import { verifyEmailDeliverability } from '@/lib/email-verifier';

describe('email deliverability scoring', () => {
  it('returns null only for empty input', () => {
    expect(verifyEmailDeliverability('')).toBeNull();
    expect(verifyEmailDeliverability('   ')).toBeNull();
    expect(verifyEmailDeliverability('jane@acme.com')).not.toBeNull();
  });

  it('is deterministic — same email always scores the same', () => {
    const a = verifyEmailDeliverability('Jane.Doe@Acme.com')!;
    const b = verifyEmailDeliverability('jane.doe@acme.com  ')!;
    expect(a).toEqual(b); // normalized (trim + lowercase) then hashed
  });

  it('marks malformed addresses undeliverable with a syntax failure (still a success result)', () => {
    const r = verifyEmailDeliverability('not-an-email')!;
    expect(r.is_valid_syntax).toBe(false);
    expect(r.verdict).toBe('undeliverable');
    expect(r.score).toBeLessThan(10);
    expect(r.checks.some((c) => c.key === 'syntax' && c.status === 'fail')).toBe(true);
  });

  it('flags disposable domains as undeliverable', () => {
    const r = verifyEmailDeliverability('user@mailinator.com')!;
    expect(r.is_disposable).toBe(true);
    expect(r.verdict).toBe('undeliverable');
    expect(r.checks.some((c) => c.key === 'disposable' && c.status === 'fail')).toBe(true);
  });

  it('flags role-based mailboxes and lands them below deliverable', () => {
    const r = verifyEmailDeliverability('info@acme.com')!;
    expect(r.is_role_based).toBe(true);
    expect(r.verdict).not.toBe('deliverable'); // role-based is at best risky
    expect(r.checks.some((c) => c.key === 'role_based' && c.status === 'warn')).toBe(true);
  });

  it('recognizes free providers without calling them undeliverable', () => {
    const r = verifyEmailDeliverability('sam@gmail.com')!;
    expect(r.is_free_provider).toBe(true);
    expect(r.mx_found).toBe(true);
    expect(r.verdict).not.toBe('undeliverable');
    expect(r.provider).toBe('Gmail');
  });

  it('suggests a correction for a common typo domain', () => {
    const r = verifyEmailDeliverability('jane@gmial.com')!;
    expect(r.did_you_mean).toBe('jane@gmail.com');
  });

  it('keeps the score in range and always emits a check breakdown + provenance', () => {
    for (const email of ['a@b.com', 'ceo@stripe.com', 'x@catchall-corp.io', 'test@zoho.com']) {
      const r = verifyEmailDeliverability(email)!;
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.checks.length).toBeGreaterThan(0);
      expect(r.provenance.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(0.99);
    }
  });

  it('lowers verdict confidence for ambiguous catch-all domains', () => {
    // Scan deterministically for a catch-all domain, then assert the ambiguity shows in confidence.
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const r = verifyEmailDeliverability(`user@corp${i}.com`)!;
      if (r.is_catch_all) {
        expect(r.confidence).toBeLessThan(0.8);
        expect(r.checks.some((c) => c.key === 'catch_all' && c.status === 'warn')).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true); // catch-all path is reachable
  });
});
