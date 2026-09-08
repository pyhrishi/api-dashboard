/**
 * Wallet health SSOT (Phase 6, M6) — unit tests.
 */
import { runwayDays, isLowBalance, BUCKET_ACTION, RELOAD_AMOUNTS, useWallet } from '@/lib/wallet';

describe('runway + low balance', () => {
  it('runwayDays is balance / spend, null when not burning', () => {
    expect(runwayDays(1000, 100)).toBe(10);
    expect(runwayDays(1000, 0)).toBeNull();
  });
  it('isLowBalance triggers at/under threshold', () => {
    expect(isLowBalance(200, 200)).toBe(true);
    expect(isLowBalance(199, 200)).toBe(true);
    expect(isLowBalance(201, 200)).toBe(false);
  });
});

describe('bucket actions', () => {
  it('maps every burn bucket to a recommended action', () => {
    expect(BUCKET_ACTION.balanced.tone).toBe('success');
    expect(BUCKET_ACTION.slow.action).toMatch(/feature/i);
    expect(BUCKET_ACTION.fast.action).toMatch(/auto-reload/i);
  });
});

describe('auto-reload store', () => {
  it('setAmount only accepts allowlisted amounts', () => {
    useWallet.getState().setAmount(2500);
    expect(useWallet.getState().amount).toBe(2500);
    useWallet.getState().setAmount(9999);
    expect(useWallet.getState().amount).toBe(1000); // falls back
    expect([...RELOAD_AMOUNTS]).toContain(500);
  });
  it('threshold clamps to >= 0', () => {
    useWallet.getState().setThreshold(-50);
    expect(useWallet.getState().threshold).toBe(0);
    useWallet.getState().setThreshold(300);
    expect(useWallet.getState().threshold).toBe(300);
  });
});
