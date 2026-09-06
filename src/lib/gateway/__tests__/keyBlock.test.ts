/**
 * F-119 Compromised-key kill switch — block registry tests.
 * Deterministic, no network.
 */
import {
  blockKey, unblockKey, isKeyBlocked, getBlock, getKillSwitchSnapshot,
  REVOCATION_REASONS, __resetKeyBlock,
} from '@/lib/gateway/keyBlock';

beforeEach(() => __resetKeyBlock());

describe('block / unblock', () => {
  it('blocks a key with a reason and enforces it', () => {
    expect(isKeyBlocked('sk_live_ok')).toBe(false);
    blockKey('sk_live_bad', 'compromised', 'security@zintlr.com');
    expect(isKeyBlocked('sk_live_bad')).toBe(true);
    const rec = getBlock('sk_live_bad')!;
    expect(rec.reason).toBe('compromised');
    expect(rec.by).toBe('security@zintlr.com');
  });

  it('restores a key (false alarm)', () => {
    blockKey('sk_live_x', 'leaked');
    expect(isKeyBlocked('sk_live_x')).toBe(true);
    unblockKey('sk_live_x');
    expect(isKeyBlocked('sk_live_x')).toBe(false);
    expect(getBlock('sk_live_x')).toBeNull();
  });

  it('the seeded compromised demo key is blocked out of the box', () => {
    expect(isKeyBlocked('sk_test_compromised')).toBe(true);
    expect(getBlock('sk_test_compromised')!.reason).toBe('compromised');
  });

  it('re-killing refreshes the reason but keeps the attempt count', () => {
    blockKey('sk_live_y', 'manual');
    isKeyBlocked('sk_live_y'); // +1 attempt
    blockKey('sk_live_y', 'compromised');
    expect(getBlock('sk_live_y')!.reason).toBe('compromised');
    expect(getBlock('sk_live_y')!.blockedAttempts).toBeGreaterThanOrEqual(1);
  });

  it('ignores empty keys', () => {
    blockKey('', 'manual');
    expect(getKillSwitchSnapshot().keys.every((k) => k.key !== '')).toBe(true);
  });
});

describe('attempt counting + snapshot', () => {
  it('counts blocked attempts per key and in total', () => {
    blockKey('sk_live_a', 'leaked');
    isKeyBlocked('sk_live_a');
    isKeyBlocked('sk_live_a');
    isKeyBlocked('sk_live_a');
    expect(getBlock('sk_live_a')!.blockedAttempts).toBe(3);
    const snap = getKillSwitchSnapshot();
    expect(snap.totalBlockedAttempts).toBeGreaterThanOrEqual(3);
  });

  it('getBlock has no side effects (does not count an attempt)', () => {
    blockKey('sk_live_b', 'manual');
    getBlock('sk_live_b');
    getBlock('sk_live_b');
    expect(getBlock('sk_live_b')!.blockedAttempts).toBe(0);
  });

  it('snapshot lists blocked keys (masked) + recent events', () => {
    blockKey('sk_live_1234567890abcdef', 'compromised', 'ops@x.com');
    const snap = getKillSwitchSnapshot();
    expect(snap.blockedKeys).toBeGreaterThanOrEqual(2); // seed + this
    const view = snap.keys.find((k) => k.reason === 'compromised' && k.by === 'ops@x.com')!;
    expect(view.key).toMatch(/…/); // masked
    expect(snap.recentEvents[0].action).toBe('killed');
  });

  it('records a restore event', () => {
    blockKey('sk_live_z', 'leaked');
    unblockKey('sk_live_z', 'admin@x.com');
    const snap = getKillSwitchSnapshot();
    expect(snap.recentEvents.some((e) => e.action === 'restored')).toBe(true);
  });
});

describe('reasons catalog', () => {
  it('exposes the revocation reasons', () => {
    expect(REVOCATION_REASONS.map((r) => r.id)).toEqual(expect.arrayContaining(['compromised', 'leaked', 'rotated', 'manual']));
  });
});
