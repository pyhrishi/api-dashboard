import { groupIntoAccounts } from '@/lib/account-grouping';

describe('groupIntoAccounts', () => {
  it('is deterministic', () => {
    const inputs = ['ceo@stripe.com', 'sales@stripe.com', 'jane@acme.com'];
    expect(groupIntoAccounts(inputs)).toEqual(groupIntoAccounts(inputs));
  });

  it('clusters contacts at the same domain into one account', () => {
    const r = groupIntoAccounts(['ceo@stripe.com', 'jane.doe@stripe.com', 'sales@stripe.com']);
    const stripe = r.accounts.find((a) => a.domain === 'stripe.com');
    expect(stripe).toBeDefined();
    expect(stripe!.member_count).toBe(3);
    expect(r.account_count).toBe(1);
  });

  it('separates distinct companies into distinct accounts', () => {
    const r = groupIntoAccounts(['a@stripe.com', 'b@datadoghq.com', 'c@shopify.com']);
    expect(r.account_count).toBe(3);
    expect(r.accounts.every((a) => a.member_count === 1)).toBe(true);
  });

  it('routes personal and malformed inputs to ungrouped with reasons', () => {
    const r = groupIntoAccounts(['ceo@stripe.com', 'someone@gmail.com', 'just-a-string', 'user@outlook.com']);
    const reasons = r.ungrouped.map((u) => u.input);
    expect(reasons).toContain('someone@gmail.com');
    expect(reasons).toContain('just-a-string');
    expect(r.ungrouped.find((u) => u.input === 'someone@gmail.com')!.reason).toMatch(/personal/i);
    // stripe still grouped
    expect(r.accounts.some((a) => a.domain === 'stripe.com')).toBe(true);
  });

  it('infers a buying committee from role-ish email local parts', () => {
    const r = groupIntoAccounts(['ceo@stripe.com', 'sales@stripe.com', 'legal@stripe.com', 'jane.doe@stripe.com']);
    const stripe = r.accounts.find((a) => a.domain === 'stripe.com')!;
    expect(stripe.buying_committee).toEqual(expect.arrayContaining(['Executive', 'Sales', 'Legal']));
    // jane.doe has no identifiable role → not a committee entry, but still a member
    expect(stripe.member_count).toBe(4);
  });

  it('attaches corporate-family context to each account', () => {
    const r = groupIntoAccounts(['ceo@stripe.com']);
    const acct = r.accounts[0];
    expect(acct.corporate_family).not.toBeNull();
    expect(['standalone', 'parent', 'subsidiary']).toContain(acct.corporate_family!.relationship);
    expect(acct.corporate_family!.family_size).toBeGreaterThanOrEqual(1);
  });

  it('accepts bare domains, de-dupes inputs, and sorts accounts by size', () => {
    const r = groupIntoAccounts(['stripe.com', 'stripe.com', 'a@datadoghq.com', 'b@datadoghq.com']);
    // datadog has 2 members, stripe 1 (deduped) → datadog first
    expect(r.total_inputs).toBe(3); // one stripe.com dropped as dup
    expect(r.accounts[0].member_count).toBeGreaterThanOrEqual(r.accounts[r.accounts.length - 1].member_count);
    expect(r.largest_account).toBe(r.accounts[0].company);
  });
});
