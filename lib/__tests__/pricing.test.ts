import {
  PRICING_TIERS,
  VOLUME_BANDS,
  volumeBand,
  volumeDiscountPct,
  nextVolumeBand,
  pricePerCredit,
  monthlyPlanCost,
  billedAmount,
  endpointCredits,
  discountedCallCredits,
  estimateCost,
  recommendTier,
  forecast,
  formatUsd,
  YEARLY_MONTHS_FREE,
  OVERAGE_MULTIPLIER,
  tierById,
} from '@/lib/pricing';

// A real endpoint from the catalog (2 credits/call) — keeps tests tied to the SSOT.
const EP = 'company-employees';

describe('pricing SSOT — tiers', () => {
  it('has three tiers with falling price-per-credit (economy of scale)', () => {
    expect(PRICING_TIERS.map((t) => t.id)).toEqual(['starter', 'growth', 'enterprise']);
    const ppc = PRICING_TIERS.map(pricePerCredit);
    expect(ppc[0]).toBeGreaterThan(ppc[1]);
    expect(ppc[1]).toBeGreaterThan(ppc[2]);
  });

  it('yearly cycle grants two months free', () => {
    const t = tierById('growth');
    expect(monthlyPlanCost(t, 'monthly')).toBe(499);
    expect(monthlyPlanCost(t, 'yearly')).toBeCloseTo((499 * 10) / 12, 5);
    expect(billedAmount(t, 'yearly')).toBe(499 * 10);
    expect(YEARLY_MONTHS_FREE).toBe(2);
  });
});

describe('pricing SSOT — volume bands (mirror the gateway)', () => {
  it('picks the right band from monthly credits', () => {
    expect(volumeDiscountPct(0)).toBe(0);
    expect(volumeDiscountPct(20_000)).toBe(0);
    expect(volumeDiscountPct(20_001)).toBe(10);
    expect(volumeDiscountPct(100_001)).toBe(25);
    expect(volumeDiscountPct(500_001)).toBe(50);
    expect(volumeBand(600_000).label).toBe('Enterprise scale');
  });

  it('matches the gateway boundary semantics (>20000, >100000, >500000)', () => {
    expect(volumeDiscountPct(100_000)).toBe(10);
    expect(volumeDiscountPct(500_000)).toBe(25);
  });

  it('nextVolumeBand reports credits to unlock, null at the top', () => {
    const next = nextVolumeBand(10_000);
    expect(next?.band.discountPct).toBe(10);
    expect(next?.creditsToUnlock).toBe(20_001 - 10_000);
    expect(nextVolumeBand(900_000)).toBeNull();
  });

  it('handles NaN / negative input safely', () => {
    expect(volumeDiscountPct(Number.NaN)).toBe(0);
    expect(volumeDiscountPct(-5)).toBe(0);
    expect(VOLUME_BANDS[VOLUME_BANDS.length - 1].discountPct).toBe(0);
  });
});

describe('pricing SSOT — discounted call credits (gateway parity)', () => {
  it('never charges below 1 credit and ceils like the gateway', () => {
    expect(discountedCallCredits(2, 0)).toBe(2);
    expect(discountedCallCredits(2, 50)).toBe(1); // ceil(2*0.5)=1
    expect(discountedCallCredits(1, 50)).toBe(1); // floor'd to the 1-credit minimum
    expect(discountedCallCredits(10, 10)).toBe(9); // ceil(10*0.9)=9
    expect(discountedCallCredits(0, 50)).toBe(0);
  });
});

describe('pricing SSOT — estimateCost', () => {
  it('sums raw credits from the real catalog cost', () => {
    const unit = endpointCredits(EP);
    expect(unit).toBeGreaterThan(0);
    const est = estimateCost([{ endpointId: EP, callsPerMonth: 1000 }], 'starter');
    expect(est.rawCredits).toBe(unit * 1000);
  });

  it('applies the volume discount to effective credits at scale', () => {
    // 300k calls * 2 credits = 600k raw -> 50% band
    const est = estimateCost([{ endpointId: EP, callsPerMonth: 300_000 }], 'enterprise');
    expect(est.volumeDiscountPct).toBe(50);
    expect(est.effectiveCredits).toBeLessThan(est.rawCredits);
    // each call: ceil(2*0.5)=1 credit -> 300k effective
    expect(est.effectiveCredits).toBe(300_000);
  });

  it('bills overage in soft mode at the multiplier, blocks in hard mode', () => {
    // Starter includes 10k; drive well past it with a small mix (no volume discount).
    const mix = [{ endpointId: EP, callsPerMonth: 9_000 }]; // 18k credits raw, <20k -> 0% discount
    const soft = estimateCost(mix, 'starter', 'monthly', 'soft');
    expect(soft.overageCredits).toBe(18_000 - 10_000);
    const rate = pricePerCredit(tierById('starter')) * OVERAGE_MULTIPLIER;
    expect(soft.overageCost).toBeCloseTo(8_000 * rate, 5);
    expect(soft.blocked).toBe(false);

    const hard = estimateCost(mix, 'starter', 'monthly', 'hard');
    expect(hard.blocked).toBe(true);
    expect(hard.overageCost).toBe(0);
  });

  it('returns an empty, safe estimate for an empty mix', () => {
    const est = estimateCost([], 'starter');
    expect(est.rawCredits).toBe(0);
    expect(est.effectivePricePerCall).toBe(0);
    expect(est.perLine).toHaveLength(0);
    expect(est.totalMonthly).toBe(99);
  });

  it('ignores line items with non-positive volume', () => {
    const est = estimateCost([{ endpointId: EP, callsPerMonth: 0 }, { endpointId: EP, callsPerMonth: -5 }], 'starter');
    expect(est.perLine).toHaveLength(0);
    expect(est.rawCredits).toBe(0);
  });
});

describe('pricing SSOT — recommendTier', () => {
  it('recommends Starter for tiny volume', () => {
    const rec = recommendTier([{ endpointId: EP, callsPerMonth: 500 }]);
    expect(rec.recommended).toBe('starter');
  });

  it('recommends a bigger tier when overage makes Starter expensive', () => {
    const rec = recommendTier([{ endpointId: EP, callsPerMonth: 200_000 }]);
    expect(rec.recommended).not.toBe('starter');
    expect(rec.byTier).toHaveLength(3);
  });

  it('prefers an unblocked tier over a blocked cheaper one (hard mode)', () => {
    const rec = recommendTier([{ endpointId: EP, callsPerMonth: 9_000 }], 'monthly', 'hard');
    // Starter would be blocked at 18k credits; recommend a tier that fits.
    const starter = rec.byTier.find((t) => t.tierId === 'starter');
    expect(starter?.blocked).toBe(true);
    expect(rec.recommended).not.toBe('starter');
  });
});

describe('pricing SSOT — forecast', () => {
  it('grows deterministically and re-prices each month', () => {
    const pts = forecast([{ endpointId: EP, callsPerMonth: 1_000 }], 'starter', 20, 12);
    expect(pts).toHaveLength(12);
    expect(pts[0].month).toBe(1);
    // strictly non-decreasing credits with positive growth
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].credits).toBeGreaterThanOrEqual(pts[i - 1].credits);
    }
    // zero growth => flat
    const flat = forecast([{ endpointId: EP, callsPerMonth: 1_000 }], 'starter', 0, 3);
    expect(flat[0].credits).toBe(flat[2].credits);
  });
});

describe('pricing SSOT — formatUsd', () => {
  it('shows cents only under $10', () => {
    expect(formatUsd(4.5)).toBe('$4.50');
    expect(formatUsd(2999)).toBe('$2,999');
    expect(formatUsd(0)).toBe('$0');
  });
});
