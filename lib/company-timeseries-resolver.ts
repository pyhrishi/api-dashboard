/**
 * Historical time-series attributes (F-022) — month-over-month attribute trends.
 *
 * How has a company grown? This resolver back-projects a deterministic monthly
 * history for a company's key attributes (headcount, tech footprint, open roles,
 * estimated revenue) anchored to its *current* firmographics from
 * resolveCompanyFromDomain — so the newest point in every series equals what a
 * live company lookup returns, and the trajectory is coherent with enrichment.
 * Each series carries trailing-12-month growth, average month-over-month growth,
 * and a trend (accelerating / growing / flat / declining).
 *
 * Deterministic and state-aware: same domain → same history. No `Math.random`,
 * no wall-clock (the window ends on a fixed reference month).
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';

export type AttributeTrend = 'accelerating' | 'growing' | 'flat' | 'declining';
export type TimeseriesAttribute = 'headcount' | 'tech_count' | 'open_roles' | 'est_revenue_usd';

export interface TimeseriesPoint {
  /** YYYY-MM. */
  month: string;
  value: number;
}

export interface AttributeSeries {
  attribute: TimeseriesAttribute;
  label: string;
  /** '' | 'USD' — how to format the value. */
  unit: string;
  /** Oldest → newest. */
  points: TimeseriesPoint[];
  current: number;
  /** Value 12 months before the latest point. */
  year_ago: number;
  /** Trailing-12-month growth, percent. */
  growth_12mo_pct: number;
  /** Average month-over-month growth, percent. */
  avg_mom_pct: number;
  trend: AttributeTrend;
}

export interface CompanyTimeseries {
  domain: string;
  company: string;
  months: number;
  from_month: string;
  to_month: string;
  attributes: AttributeSeries[];
  /** Headline momentum, from the headcount trajectory. */
  momentum: AttributeTrend;
  confidence: number;
  last_verified: string;
}

// The window ends here (the prototype's "now") — fixed so history is deterministic.
const TO_YEAR = 2026;
const TO_MONTH = 9; // September

function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normalizeDomain = (raw: string): string =>
  String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

/** YYYY-MM for `back` months before the reference month. */
function monthLabel(back: number): string {
  const total = TO_YEAR * 12 + (TO_MONTH - 1) - back;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function trendFrom(growth12: number, momAvg: number): AttributeTrend {
  if (growth12 >= 40 && momAvg >= 3) return 'accelerating';
  if (growth12 >= 8) return 'growing';
  if (growth12 <= -5) return 'declining';
  return 'flat';
}

/**
 * Back-project a monthly series ending at `current`. Each earlier month is the
 * next month divided by its growth factor, so the newest point equals `current`.
 * `monthlyGrowth` is the mean MoM rate; `volatility` adds deterministic wobble.
 */
function backProject(current: number, months: number, monthlyGrowth: number, volatility: number, rng: () => number, integer: boolean): number[] {
  const values: number[] = new Array(months);
  values[months - 1] = current;
  for (let i = months - 2; i >= 0; i--) {
    const noise = (rng() - 0.5) * 2 * volatility;
    const factor = 1 + monthlyGrowth + noise;
    let v = values[i + 1] / (factor <= 0.5 ? 0.5 : factor);
    if (integer) v = Math.max(0, Math.round(v));
    else v = Math.max(0, Math.round(v));
    values[i] = v;
  }
  return values;
}

function seriesFrom(attribute: TimeseriesAttribute, label: string, unit: string, values: number[], months: number): AttributeSeries {
  const points: TimeseriesPoint[] = values.map((value, i) => ({ month: monthLabel(months - 1 - i), value }));
  const current = values[months - 1];
  const yearAgoIdx = Math.max(0, months - 1 - 12);
  const year_ago = values[yearAgoIdx];
  const growth_12mo_pct = year_ago === 0 ? 0 : Math.round(((current - year_ago) / year_ago) * 1000) / 10;
  // Average MoM over the last 12 months.
  let momSum = 0, momN = 0;
  for (let i = Math.max(1, months - 12); i < months; i++) {
    const prev = values[i - 1];
    if (prev > 0) { momSum += (values[i] - prev) / prev; momN += 1; }
  }
  const avg_mom_pct = momN === 0 ? 0 : Math.round((momSum / momN) * 1000) / 10;
  return { attribute, label, unit, points, current, year_ago, growth_12mo_pct, avg_mom_pct, trend: trendFrom(growth_12mo_pct, avg_mom_pct) };
}

const REVENUE_BAND_PER_EMPLOYEE: Record<string, number> = {
  '<$1M': 120_000, '$1M-$10M': 160_000, '$10M-$50M': 200_000, '$50M-$100M': 240_000,
  '$100M-$500M': 280_000, '$500M-$1B': 320_000, '$1B+': 400_000,
};

/**
 * Resolve a company's historical attribute time-series. Returns null for personal
 * or unrecognized domains (no company to chart).
 */
export function resolveCompanyTimeseries(rawDomain: string, months: number = 24): CompanyTimeseries | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company || company.is_personal_domain) return null;

  const win = Math.max(6, Math.min(36, Math.round(months)));
  const domain = normalizeDomain(rawDomain);
  const rng = makeRng(hashString(`timeseries:${domain}`));

  // Growth character seeded per company: young/mid companies grow faster.
  const age = Math.max(0, TO_YEAR - (company.founded_year || TO_YEAR));
  const growthClass = age <= 6 ? 'high' : age <= 15 ? 'mid' : 'mature';
  const baseGrowth = growthClass === 'high' ? 0.035 : growthClass === 'mid' ? 0.018 : 0.006;
  const growthSkew = (rng() - 0.35) * 0.02; // deterministic per-company tilt
  const headGrowth = Math.max(-0.01, baseGrowth + growthSkew);

  const headValues = backProject(company.employee_count, win, headGrowth, 0.012, rng, true);
  const headSeries = seriesFrom('headcount', 'Headcount', '', headValues, win);

  const techCurrent = Array.isArray(company.tech_stack) ? company.tech_stack.length : 0;
  const techValues = backProject(techCurrent, win, headGrowth * 0.4, 0.02, rng, true);
  const techSeries = seriesFrom('tech_count', 'Technologies detected', '', techValues, win);

  const openRolesCurrent = Math.max(0, Math.round(company.employee_count * (0.02 + rng() * 0.05)));
  const openRolesValues = backProject(openRolesCurrent, win, headGrowth * 0.8, 0.15, rng, true);
  const openRolesSeries = seriesFrom('open_roles', 'Open roles', '', openRolesValues, win);

  const revPerEmp = REVENUE_BAND_PER_EMPLOYEE[company.revenue_band] ?? 180_000;
  const revValues = headValues.map((h) => Math.round(h * revPerEmp));
  const revSeries = seriesFrom('est_revenue_usd', 'Estimated revenue', 'USD', revValues, win);

  return {
    domain: company.domain,
    company: company.name,
    months: win,
    from_month: monthLabel(win - 1),
    to_month: monthLabel(0),
    attributes: [headSeries, revSeries, techSeries, openRolesSeries],
    momentum: headSeries.trend,
    confidence: company.confidence,
    last_verified: company.last_verified,
  };
}
