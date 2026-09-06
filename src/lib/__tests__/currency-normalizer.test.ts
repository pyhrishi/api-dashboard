/**
 * F-056 Currency normalization — parser + conversion tests.
 * Deterministic, no network, frozen FX table.
 */
import {
  normalizeCurrency,
  getFxReference,
  supportedCurrencies,
  type NormalizedCurrency,
} from '@/lib/currency-normalizer';

const n = (s: string, t?: 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY') => normalizeCurrency(s, t) as NormalizedCurrency;

describe('currency detection', () => {
  it('reads an explicit ISO code with high confidence', () => {
    const r = n('1,200,000 EUR');
    expect(r.currency).toBe('EUR');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
    expect(r.amount).toBe(1200000);
  });
  it('reads currency symbols', () => {
    expect(n('£500').currency).toBe('GBP');
    expect(n('₹2500').currency).toBe('INR');
    expect(n('€1.000').currency).toBe('EUR');
  });
  it('flags ambiguous symbols but picks a default', () => {
    const dollar = n('$1,000');
    expect(dollar.currency).toBe('USD');
    expect(dollar.ambiguous).toBe(true);
    expect(dollar.alternatives).toContain('CAD');
    const yen = n('¥3000');
    expect(yen.currency).toBe('JPY');
    expect(yen.alternatives).toContain('CNY');
  });
  it('resolves multi-char symbols before bare $', () => {
    expect(n('R$1.500').currency).toBe('BRL');
    expect(n('HK$1,000').currency).toBe('HKD');
    expect(n('A$2,000').currency).toBe('AUD');
  });
  it('defaults to USD with low confidence when nothing is found', () => {
    const r = n('1500');
    expect(r.currency).toBe('USD');
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.ambiguous).toBe(true);
  });
});

describe('scale words', () => {
  it('applies K / M / B suffixes attached to the number', () => {
    expect(n('$1.2M').amount).toBe(1200000);
    expect(n('$50k').amount).toBe(50000);
    expect(n('€2.5B').amount).toBe(2500000000);
  });
  it('applies spelled-out scales', () => {
    expect(n('1.2 million USD').amount).toBe(1200000);
    expect(n('3 billion USD').amount).toBe(3000000000);
  });
  it('applies Indian lakh / crore', () => {
    expect(n('₹1,200 crore').amount).toBe(12000000000); // 1200 * 1e7
    expect(n('₹50 lakh').amount).toBe(5000000); // 50 * 1e5
    expect(n('₹5 cr').amount).toBe(50000000);
  });
});

describe('locale number parsing', () => {
  it('parses US grouping + decimal', () => {
    expect(n('$1,200,000.50').amount).toBe(1200000.5);
  });
  it('parses EU grouping + decimal (dot grouping, comma decimal)', () => {
    expect(n('€1.200.000,50').amount).toBe(1200000.5);
  });
  it('parses French space grouping', () => {
    expect(n('1 200 000,50 EUR').amount).toBe(1200000.5);
  });
  it('parses Indian grouping', () => {
    expect(n('₹12,00,000').amount).toBe(1200000);
  });
  it('parses Swiss apostrophe grouping', () => {
    expect(n("CHF 1'200'000").amount).toBe(1200000);
  });
  it('handles accounting parentheses as negative', () => {
    expect(n('($1,500)').amount).toBe(-1500);
  });
  it('notes an ambiguous single-separator grouping', () => {
    const r = n('$1,200');
    expect(r.amount).toBe(1200);
    expect(r.notes.some((x) => /ambiguous/i.test(x))).toBe(true);
  });
});

describe('conversion', () => {
  it('converts to USD by default at the frozen rate', () => {
    const r = n('€1,000,000');
    expect(r.target).toBe('USD');
    expect(r.rate).toBe(1.09);
    expect(r.targetAmount).toBe(1090000);
  });
  it('converts to a chosen target currency', () => {
    const r = n('$1,000', 'EUR');
    // 1000 USD → EUR at 1/1.09
    expect(r.target).toBe('EUR');
    expect(r.targetAmount).toBeCloseTo(1000 / 1.09, 0);
  });
  it('same-currency conversion is identity', () => {
    const r = n('£250', 'GBP');
    expect(r.rate).toBe(1);
    expect(r.targetAmount).toBe(250);
  });
  it('formats with grouping and the right decimals', () => {
    expect(n('€1234567.5').formatted).toBe('€1,234,567.50');
    expect(n('¥3000000').formatted).toBe('¥3,000,000'); // zero-decimal currency
  });
});

describe('edge cases & determinism', () => {
  it('returns null for empty input', () => {
    expect(normalizeCurrency('')).toBeNull();
    expect(normalizeCurrency('   ')).toBeNull();
  });
  it('handles a value with no number gracefully', () => {
    const r = n('USD');
    expect(Number.isNaN(r.amount)).toBe(true);
    expect(r.confidence).toBe(0);
    expect(r.formatted).toBe('—');
  });
  it('is fully deterministic', () => {
    expect(JSON.stringify(n('₹1,200 crore'))).toBe(JSON.stringify(n('₹1,200 crore')));
  });
  it('exposes the frozen FX reference', () => {
    const fx = getFxReference();
    expect(fx.date).toBe('2026-09-01');
    expect(fx.rates.USD).toBe(1);
    expect(supportedCurrencies().length).toBeGreaterThan(20);
  });
});
