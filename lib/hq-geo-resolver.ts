/**
 * HQ & office geo-resolution — deterministic mock (single source of truth).
 *
 * Given a domain, resolves a company's headquarters to a full geocoded address
 * (street, region, postal, ISO country, lat/lng, IANA timezone, UTC offset) and
 * derives its wider office footprint — additional locations by function
 * (engineering, sales, support, remote hub), each with headcount, geo, and local
 * time — then computes reach signals: countries, continents, follow-the-sun
 * coverage, and the best UTC outreach window.
 *
 * Coherence: builds on the company dossier's own `hq_city` / `hq_country` /
 * `timezone` (`resolveCompanyFromDomain`). Pure and deterministic (FNV-1a, no
 * Date.now, no Math.random) — the gateway, Explorer, CLI, and Studio all agree.
 * Live local time is computed at render from `utc_offset_minutes`, not here.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type OfficeType = 'Headquarters' | 'Engineering' | 'Sales' | 'Support' | 'Remote hub';

export interface OfficeLocation {
  type: OfficeType;
  label: string;
  street: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_code: string;
  continent: string;
  timezone: string;
  utc_offset_minutes: number;
  geo: GeoPoint;
  headcount: number;
  headcount_share: number;
  is_hq: boolean;
}

export interface OfficeGeoProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface OfficeGeography {
  domain: string;
  company: string;
  hq: OfficeLocation;
  offices: OfficeLocation[];
  office_count: number;
  country_count: number;
  continent_count: number;
  timezones: string[];
  /** ≥3 continents or a ≥9h span between the earliest and latest office. */
  follow_the_sun: boolean;
  /** HQ 9–5 local expressed in UTC — the primary window to reach the mothership. */
  outreach_window_utc: string;
  confidence: number;
  last_verified: string;
  provenance: OfficeGeoProvenance[];
}

interface CityGeo {
  region: string;
  country: string;
  country_code: string;
  continent: string;
  timezone: string;
  utc_offset_minutes: number;
  postal_prefix: string;
  geo: GeoPoint;
}

/** Geo reference for every city in the company-resolver LOCATIONS pool. */
const CITY_GEO: Record<string, CityGeo> = {
  'San Francisco': { region: 'California', country: 'United States', country_code: 'US', continent: 'North America', timezone: 'America/Los_Angeles', utc_offset_minutes: -480, postal_prefix: '941', geo: { lat: 37.7749, lng: -122.4194 } },
  'New York': { region: 'New York', country: 'United States', country_code: 'US', continent: 'North America', timezone: 'America/New_York', utc_offset_minutes: -300, postal_prefix: '100', geo: { lat: 40.7128, lng: -74.006 } },
  Austin: { region: 'Texas', country: 'United States', country_code: 'US', continent: 'North America', timezone: 'America/Chicago', utc_offset_minutes: -360, postal_prefix: '787', geo: { lat: 30.2672, lng: -97.7431 } },
  London: { region: 'England', country: 'United Kingdom', country_code: 'GB', continent: 'Europe', timezone: 'Europe/London', utc_offset_minutes: 0, postal_prefix: 'EC1', geo: { lat: 51.5074, lng: -0.1278 } },
  Berlin: { region: 'Berlin', country: 'Germany', country_code: 'DE', continent: 'Europe', timezone: 'Europe/Berlin', utc_offset_minutes: 60, postal_prefix: '101', geo: { lat: 52.52, lng: 13.405 } },
  Bengaluru: { region: 'Karnataka', country: 'India', country_code: 'IN', continent: 'Asia', timezone: 'Asia/Kolkata', utc_offset_minutes: 330, postal_prefix: '560', geo: { lat: 12.9716, lng: 77.5946 } },
  Singapore: { region: 'Singapore', country: 'Singapore', country_code: 'SG', continent: 'Asia', timezone: 'Asia/Singapore', utc_offset_minutes: 480, postal_prefix: '01', geo: { lat: 1.3521, lng: 103.8198 } },
  Toronto: { region: 'Ontario', country: 'Canada', country_code: 'CA', continent: 'North America', timezone: 'America/Toronto', utc_offset_minutes: -300, postal_prefix: 'M5', geo: { lat: 43.6532, lng: -79.3832 } },
  Sydney: { region: 'New South Wales', country: 'Australia', country_code: 'AU', continent: 'Oceania', timezone: 'Australia/Sydney', utc_offset_minutes: 600, postal_prefix: '20', geo: { lat: -33.8688, lng: 151.2093 } },
  'Tel Aviv': { region: 'Tel Aviv District', country: 'Israel', country_code: 'IL', continent: 'Asia', timezone: 'Asia/Jerusalem', utc_offset_minutes: 120, postal_prefix: '61', geo: { lat: 32.0853, lng: 34.7818 } },
};
/** Ordered city pool for deterministic satellite-office selection. */
const CITY_POOL = Object.keys(CITY_GEO);

const STREETS = ['Market St', 'Broadway', 'King St', 'High St', 'Main St', 'Innovation Way', 'Mission St', 'Harbour Blvd'];
/** Satellite offices get a function, in this order after the HQ. */
const SATELLITE_TYPES: OfficeType[] = ['Engineering', 'Sales', 'Support', 'Remote hub'];
const TYPE_LABEL: Record<OfficeType, string> = {
  Headquarters: 'Global HQ',
  Engineering: 'Engineering hub',
  Sales: 'Sales office',
  Support: 'Support center',
  'Remote hub': 'Remote hub',
};

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Minutes → "HH:MM", wrapping into 0–1439. */
function fmtClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** How many offices a company of this size runs (capped by the city pool). */
function officeCountForHeadcount(employees: number): number {
  const n = employees > 8000 ? 5 : employees > 2000 ? 4 : employees > 500 ? 3 : employees > 50 ? 2 : 1;
  return Math.min(n, CITY_POOL.length);
}

function buildOffice(
  city: string,
  type: OfficeType,
  domain: string,
  headcount: number,
  headcount_share: number,
): OfficeLocation {
  const g = CITY_GEO[city];
  const h = hash(`${domain}:${city}`);
  const streetNo = 100 + (h % 9899);
  const street = `${streetNo} ${STREETS[(h >>> 5) % STREETS.length]}`;
  const postal_code = /[A-Za-z]/.test(g.postal_prefix)
    ? `${g.postal_prefix}${String.fromCharCode(65 + ((h >>> 3) % 26))} ${(h >>> 7) % 9}${String.fromCharCode(65 + ((h >>> 9) % 26))}${String.fromCharCode(65 + ((h >>> 11) % 26))}`
    : `${g.postal_prefix}${String((h >>> 3) % 100).padStart(2, '0')}`;
  return {
    type,
    label: TYPE_LABEL[type],
    street,
    city,
    region: g.region,
    postal_code,
    country: g.country,
    country_code: g.country_code,
    continent: g.continent,
    timezone: g.timezone,
    utc_offset_minutes: g.utc_offset_minutes,
    geo: g.geo,
    headcount,
    headcount_share: Math.round(headcount_share * 1000) / 1000,
    is_hq: type === 'Headquarters',
  };
}

/**
 * Resolve a domain into its HQ + office geography.
 * Returns `null` for invalid or personal-mailbox domains.
 */
export function resolveOfficeGeography(rawDomain: string): OfficeGeography | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company) return null;
  if (company.is_personal_domain) return null;
  // Only resolve for cities we hold geo reference for (the resolver's own pool).
  if (!CITY_GEO[company.hq_city]) return null;

  const domain = company.domain;
  const seed = hash(domain);
  const count = officeCountForHeadcount(company.employee_count);

  // Satellite cities: the pool minus the HQ city, rotated deterministically.
  const others = CITY_POOL.filter((c) => c !== company.hq_city);
  const start = seed % others.length;
  const satelliteCities: string[] = [];
  for (let i = 0; i < count - 1; i++) satelliteCities.push(others[(start + i) % others.length]);

  // Headcount split: HQ ~45%, satellites share the rest with a small deterministic tilt.
  const hqShare = count === 1 ? 1 : 0.45;
  const restShare = 1 - hqShare;
  const weights = satelliteCities.map((c) => 1 + (hash(`${domain}:${c}:w`) % 40) / 100); // 1.00–1.39
  const weightSum = weights.reduce((n, w) => n + w, 0) || 1;

  const offices: OfficeLocation[] = [];
  const hqHeadcount = Math.round(company.employee_count * hqShare);
  offices.push(buildOffice(company.hq_city, 'Headquarters', domain, hqHeadcount, hqShare));

  let allocated = hqHeadcount;
  satelliteCities.forEach((city, i) => {
    const share = restShare * (weights[i] / weightSum);
    // Last office absorbs the rounding remainder so headcounts sum to the total.
    const isLast = i === satelliteCities.length - 1;
    const headcount = isLast ? company.employee_count - allocated : Math.round(company.employee_count * share);
    allocated += isLast ? 0 : headcount;
    offices.push(buildOffice(city, SATELLITE_TYPES[i % SATELLITE_TYPES.length], domain, Math.max(0, headcount), share));
  });

  const hq = offices[0];
  const countrySet: Record<string, true> = {};
  const continentSet: Record<string, true> = {};
  offices.forEach((o) => {
    countrySet[o.country_code] = true;
    continentSet[o.continent] = true;
  });
  const country_count = Object.keys(countrySet).length;
  const continent_count = Object.keys(continentSet).length;
  const timezones = Array.from(new Set(offices.map((o) => o.timezone)));

  const offsets = offices.map((o) => o.utc_offset_minutes);
  const spreadHours = (Math.max(...offsets) - Math.min(...offsets)) / 60;
  const follow_the_sun = continent_count >= 3 || spreadHours >= 9;

  // HQ business hours (09:00–17:00 local) expressed in UTC.
  const startUtc = 9 * 60 - hq.utc_offset_minutes;
  const endUtc = 17 * 60 - hq.utc_offset_minutes;
  const outreach_window_utc = `${fmtClock(startUtc)}–${fmtClock(endUtc)} UTC`;

  const confidence = Math.min(0.97, Math.round((company.confidence + 0.05) * 100) / 100);

  const provenance: OfficeGeoProvenance[] = [
    { field: 'hq', source: 'Registry + geocoder', signal: `${hq.city}, ${hq.region} — ${hq.geo.lat.toFixed(4)}, ${hq.geo.lng.toFixed(4)}`, confidence: 0.94 },
    { field: 'offices', source: 'Workforce + geo signals', signal: `${offices.length} office${offices.length === 1 ? '' : 's'} across ${country_count} countr${country_count === 1 ? 'y' : 'ies'}`, confidence: 0.85 },
    { field: 'outreach_window_utc', source: 'Timezone engine', signal: `HQ business hours ${outreach_window_utc}${follow_the_sun ? ' · follow-the-sun coverage' : ''}`, confidence: 0.9 },
  ];

  return {
    domain,
    company: company.name,
    hq,
    offices,
    office_count: offices.length,
    country_count,
    continent_count,
    timezones,
    follow_the_sun,
    outreach_window_utc,
    confidence,
    last_verified: company.last_verified,
    provenance,
  };
}
