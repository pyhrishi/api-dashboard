import { getSamplePairs, evaluateThreshold, suggestThreshold, USE_CASES, DEFAULT_THRESHOLDS } from '@/lib/threshold-tuning';

describe('match threshold tuning (F-034)', () => {
  it('exposes a use case + default for each id', () => {
    for (const uc of USE_CASES) {
      expect(DEFAULT_THRESHOLDS[uc.id]).toBeGreaterThan(0.5);
      expect(DEFAULT_THRESHOLDS[uc.id]).toBeLessThanOrEqual(0.99);
    }
  });

  it('scores every sample pair in range and labels it', () => {
    for (const uc of USE_CASES) {
      const pairs = getSamplePairs(uc.id);
      expect(pairs.length).toBeGreaterThan(4);
      for (const p of pairs) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(1);
        expect(typeof p.isMatch).toBe('boolean');
      }
      // A sample has both matches and non-matches, or the tradeoff is meaningless.
      expect(pairs.some((p) => p.isMatch)).toBe(true);
      expect(pairs.some((p) => !p.isMatch)).toBe(true);
    }
  });

  it('is deterministic — same use case, same scored pairs', () => {
    expect(getSamplePairs('contact_match')).toEqual(getSamplePairs('contact_match'));
  });

  it('raising the threshold never increases recall (the precision/recall tradeoff)', () => {
    const pairs = getSamplePairs('contact_match');
    const low = evaluateThreshold(pairs, 0.6);
    const high = evaluateThreshold(pairs, 0.98);
    expect(high.recall).toBeLessThanOrEqual(low.recall);
    expect(high.accepted).toBeLessThanOrEqual(low.accepted);
  });

  it('computes a coherent confusion matrix', () => {
    const pairs = getSamplePairs('company_dedupe');
    const e = evaluateThreshold(pairs, 0.85);
    expect(e.truePos + e.falsePos + e.trueNeg + e.falseNeg).toBe(e.total);
    expect(e.accepted).toBe(e.truePos + e.falsePos);
    expect(e.rejected).toBe(e.trueNeg + e.falseNeg);
    expect(e.precision).toBeGreaterThanOrEqual(0);
    expect(e.precision).toBeLessThanOrEqual(1);
  });

  it('suggests a threshold in the slider range that beats the extremes on F1', () => {
    const pairs = getSamplePairs('lead_routing');
    const s = suggestThreshold(pairs);
    expect(s).toBeGreaterThanOrEqual(0.5);
    expect(s).toBeLessThanOrEqual(0.99);
    const sF1 = evaluateThreshold(pairs, s).f1;
    expect(sF1).toBeGreaterThanOrEqual(evaluateThreshold(pairs, 0.5).f1);
    expect(sF1).toBeGreaterThanOrEqual(evaluateThreshold(pairs, 0.99).f1);
  });
});
