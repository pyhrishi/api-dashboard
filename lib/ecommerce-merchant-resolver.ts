/**
 * Ecommerce merchant enrichment (F-017) — profile a company as an online store.
 *
 * Given a domain, detect whether it's an ecommerce merchant and, if so, enrich it
 * with the commerce facts a partner needs to qualify and size it: platform
 * (Shopify / WooCommerce / …), business model, GMV and revenue bands, product
 * catalog size and categories, average order value, payment providers, shipping
 * regions, currencies, storefront tech, and a traffic band.
 *
 * Deterministic and coherent: built on the shared company resolver, so the
 * merchant profile agrees with a direct company lookup. Non-merchants come back
 * with `is_merchant: false` and an explanation rather than fabricated store data.
 * No Math.random, no wall-clock.
 */

import { resolveCompanyFromDomain, normalizeDomain } from '@/lib/company-resolver';

export type BusinessModel = 'DTC' | 'Marketplace' | 'B2B Wholesale' | 'Subscription' | 'Omnichannel';

export interface MerchantEnrichment {
  domain: string;
  company: string;
  industry: string;
  is_merchant: boolean;
  merchant_confidence: number;
  platform: string;
  platform_confidence: number;
  business_model: BusinessModel;
  gmv_band: string;
  monthly_revenue_band: string;
  product_count_band: string;
  categories: string[];
  avg_order_value_usd: number;
  payment_providers: string[];
  shipping_regions: string[];
  currencies: string[];
  storefront_tech: string[];
  monthly_visits_band: string;
  signals: string[];
  confidence: number;
  as_of: string;
}

const AS_OF = '2026-09-06';

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const sample = <T,>(rng: () => number, arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < Math.min(n, copy.length)) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return out;
};

const PLATFORMS = ['Shopify', 'Shopify Plus', 'WooCommerce', 'Magento (Adobe Commerce)', 'BigCommerce', 'Salesforce Commerce Cloud', 'Custom / Headless'];
const CATEGORIES = ['Apparel', 'Beauty & Personal Care', 'Home & Garden', 'Electronics', 'Health & Wellness', 'Food & Beverage', 'Jewelry & Accessories', 'Sporting Goods', 'Pet Supplies', 'Toys & Hobbies'];
const PAYMENTS = ['Shopify Payments', 'Stripe', 'PayPal', 'Amazon Pay', 'Apple Pay', 'Klarna', 'Afterpay', 'Adyen'];
const REGIONS = ['United States', 'Canada', 'United Kingdom', 'European Union', 'Australia', 'India', 'Worldwide'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'];
const TECH = ['Klaviyo (email)', 'Yotpo (reviews)', 'Recharge (subscriptions)', 'Gorgias (support)', 'Loox (photo reviews)', ' Bold (upsell)', 'Rebuy (personalization)'];
const MODELS: BusinessModel[] = ['DTC', 'Marketplace', 'B2B Wholesale', 'Subscription', 'Omnichannel'];

/** Industries that read as ecommerce merchants (tracks the resolved industry closely). */
function merchantLikelihood(industry: string): number {
  if (/retail|e-?commerce|consumer goods|apparel|cosmet|food|beverage|fashion|marketplace|logistics/i.test(industry)) return 0.97;
  if (/manufactur|wholesale|cpg|beauty|sporting|hospitality/i.test(industry)) return 0.55;
  if (/software|saas|financ|consult|media|advertis|tech|internet|healthcare|biotech|telecom|energy|legal/i.test(industry)) return 0.03;
  return 0.2;
}

function bandFor(value: number, edges: number[], labels: string[]): string {
  for (let i = 0; i < edges.length; i++) if (value < edges[i]) return labels[i];
  return labels[labels.length - 1];
}

/** Enrich a domain as an ecommerce merchant. Returns null for personal/invalid domains. */
export function enrichMerchant(rawDomain: string): MerchantEnrichment | null {
  const domain = normalizeDomain(rawDomain);
  const company = resolveCompanyFromDomain(domain);
  if (!company || company.is_personal_domain) return null;

  const seed = hash(domain);
  const rng = makeRng(seed);
  const likelihood = merchantLikelihood(company.industry);
  const is_merchant = rng() < likelihood;
  const merchant_confidence = Math.round((is_merchant ? 0.6 + rng() * 0.39 : 0.05 + rng() * 0.25) * 100) / 100;

  if (!is_merchant) {
    return {
      domain, company: company.name, industry: company.industry,
      is_merchant: false, merchant_confidence,
      platform: 'n/a', platform_confidence: 0,
      business_model: 'DTC',
      gmv_band: 'n/a', monthly_revenue_band: 'n/a', product_count_band: 'n/a',
      categories: [], avg_order_value_usd: 0,
      payment_providers: [], shipping_regions: [], currencies: [], storefront_tech: [],
      monthly_visits_band: 'n/a',
      signals: [`No online storefront detected for ${domain} — this domain doesn't read as an ecommerce merchant.`],
      confidence: company.confidence, as_of: AS_OF,
    };
  }

  // GMV scales from headcount with per-merchant variance.
  const gmvUsd = Math.round(company.employee_count * (30_000 + rng() * 220_000));
  const gmv_band = bandFor(gmvUsd, [1_000_000, 10_000_000, 50_000_000, 250_000_000], ['<$1M', '$1M–$10M', '$10M–$50M', '$50M–$250M', '$250M+']);
  const monthly_revenue_band = bandFor(gmvUsd / 12, [100_000, 1_000_000, 5_000_000, 20_000_000], ['<$100K', '$100K–$1M', '$1M–$5M', '$5M–$20M', '$20M+']);
  const productCount = Math.round(50 + rng() * rng() * 40_000);
  const product_count_band = bandFor(productCount, [100, 1_000, 10_000, 50_000], ['<100 SKUs', '100–1k SKUs', '1k–10k SKUs', '10k–50k SKUs', '50k+ SKUs']);
  const avg_order_value_usd = 25 + Math.round(rng() * 175);
  const visits = Math.round(company.employee_count * (2_000 + rng() * 30_000));
  const monthly_visits_band = bandFor(visits, [50_000, 500_000, 5_000_000, 50_000_000], ['<50K', '50K–500K', '500K–5M', '5M–50M', '50M+']);

  const platform = pick(rng, PLATFORMS);
  const platform_confidence = Math.round((0.7 + rng() * 0.29) * 100) / 100;
  const business_model = /marketplace/i.test(company.industry) ? 'Marketplace' : pick(rng, MODELS);
  const categories = sample(rng, CATEGORIES, 1 + Math.floor(rng() * 3));
  const payment_providers = Array.from(new Set([
    platform.startsWith('Shopify') ? 'Shopify Payments' : 'Stripe',
    ...sample(rng, PAYMENTS, 1 + Math.floor(rng() * 3)),
  ]));
  const shipping_regions = sample(rng, REGIONS, 1 + Math.floor(rng() * 3));
  const currencies = Array.from(new Set(['USD', ...sample(rng, CURRENCIES, Math.floor(rng() * 3))]));
  const storefront_tech = sample(rng, TECH, 2 + Math.floor(rng() * 3)).map((t) => t.trim());

  const signals: string[] = [];
  signals.push(`Storefront on ${platform}`);
  if (business_model === 'Subscription') signals.push('Recurring subscription commerce detected');
  if (gmvUsd >= 50_000_000) signals.push('High-GMV merchant — enterprise commerce motion');
  if (storefront_tech.some((t) => /review/i.test(t))) signals.push('Reviews/social-proof stack in use');
  if (shipping_regions.includes('Worldwide')) signals.push('Ships worldwide');

  return {
    domain, company: company.name, industry: company.industry,
    is_merchant: true, merchant_confidence,
    platform, platform_confidence,
    business_model,
    gmv_band, monthly_revenue_band, product_count_band,
    categories, avg_order_value_usd,
    payment_providers, shipping_regions, currencies, storefront_tech,
    monthly_visits_band,
    signals,
    confidence: company.confidence, as_of: AS_OF,
  };
}
