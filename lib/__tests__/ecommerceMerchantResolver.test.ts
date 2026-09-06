import { enrichMerchant, type MerchantEnrichment } from '@/lib/ecommerce-merchant-resolver';

// A spread of domains; some resolve as merchants, some not.
const DOMAINS = ['acme.com', 'stripe.com', 'shopify.com', 'gymshark.com', 'allbirds.com', 'datadog.com', 'warbyparker.com', 'figma.com'];

function all(): MerchantEnrichment[] {
  return DOMAINS.map((d) => enrichMerchant(d)).filter((m): m is MerchantEnrichment => m !== null);
}

describe('enrichMerchant', () => {
  it('is deterministic', () => {
    expect(enrichMerchant('gymshark.com')).toEqual(enrichMerchant('gymshark.com'));
  });

  it('returns null for a personal domain', () => {
    expect(enrichMerchant('someone@gmail.com')).toBeNull();
    expect(enrichMerchant('gmail.com')).toBeNull();
  });

  it('gives non-merchants an empty, honest profile', () => {
    for (const m of all()) {
      if (!m.is_merchant) {
        expect(m.platform).toBe('n/a');
        expect(m.categories).toEqual([]);
        expect(m.gmv_band).toBe('n/a');
        expect(m.signals[0]).toMatch(/no online storefront/i);
      }
    }
  });

  it('gives merchants a coherent commerce profile', () => {
    for (const m of all()) {
      if (!m.is_merchant) continue;
      expect(m.platform).not.toBe('n/a');
      expect(m.merchant_confidence).toBeGreaterThanOrEqual(0.6);
      expect(m.categories.length).toBeGreaterThanOrEqual(1);
      expect(m.payment_providers.length).toBeGreaterThanOrEqual(1);
      expect(m.currencies).toContain('USD');
      expect(m.avg_order_value_usd).toBeGreaterThan(0);
      expect(m.gmv_band).not.toBe('n/a');
      // no duplicate payment providers / currencies
      expect(new Set(m.payment_providers).size).toBe(m.payment_providers.length);
      expect(new Set(m.currencies).size).toBe(m.currencies.length);
      expect(m.signals.length).toBeGreaterThan(0);
    }
  });

  it('at least one domain in the sample resolves as a merchant', () => {
    expect(all().some((m) => m.is_merchant)).toBe(true);
  });
});
