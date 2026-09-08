/**
 * Landing-page API catalogue (M1.4) — the full customer-facing enrichment catalogue
 * for the TOFU "tap any API" experience. Derived from the real endpoint catalog
 * (`src/data/endpoints.ts`), so purpose, request schema, and per-call price are the
 * genuine ones; sample responses reuse the curated `api-catalog` presentation where
 * a featured example exists.
 *
 * Meta/ops endpoints (encryption, masking, coalescing, limits, jobs, …) are excluded
 * — the catalogue shows the data-enrichment product surface a prospect explores.
 * Pure/deterministic; no JSX (icons live in the rendering component).
 */

import { ENDPOINTS } from '@/data/endpoints';
import { API_CATALOG } from '@/lib/api-catalog';

export type LandingCategory = 'people' | 'company' | 'identity';

export interface LandingApiParam {
  name: string;
  example: string;
  required: boolean;
}

export interface LandingApiItem {
  id: string;
  name: string;
  category: LandingCategory;
  purpose: string;
  price: number;
  method: string;
  path: string;
  params: LandingApiParam[];
  /** Curated sample response JSON when the endpoint is featured, else null. */
  sampleResponse: string | null;
}

export const LANDING_CATEGORIES: { id: LandingCategory; name: string }[] = [
  { id: 'people', name: 'People' },
  { id: 'company', name: 'Company' },
  { id: 'identity', name: 'Identity & Data' },
];

/** Path prefixes that are customer-facing enrichment (everything else is meta/ops). */
const ENRICHMENT_PREFIXES = [
  '/v1/people', '/v1/directors', '/v1/email', '/v1/titles', '/v1/names',
  '/v1/companies', '/v1/company', '/v1/domains',
  '/v1/identity', '/v1/enrichment', '/v1/match', '/v1/reconcile', '/v1/records',
  '/v1/text', '/v1/currency', '/v1/accounts',
];
/** Explicitly excluded even if they match a prefix (delivery/ops variants). */
const EXCLUDE = new Set(['/v1/enrich/stream', '/v1/records/snapshot']);

function isEnrichment(path: string): boolean {
  if (EXCLUDE.has(path)) return false;
  if (path.includes('{')) return false; // sub-resource routes like /v1/jobs/{id}
  return ENRICHMENT_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

function categorize(path: string): LandingCategory {
  if (/\/v1\/(companies|company|domains)/.test(path)) return 'company';
  if (/\/v1\/(people|directors|email|titles|names)/.test(path)) return 'people';
  return 'identity'; // identity, enrichment(ip/reverse), match, reconcile, records, text, currency, accounts
}

const SAMPLE_BY_ID: Record<string, string> = API_CATALOG.reduce((acc, e) => {
  acc[e.id] = e.response;
  return acc;
}, {} as Record<string, string>);

export const LANDING_CATALOG: LandingApiItem[] = ENDPOINTS
  .filter((e) => isEnrichment(e.path))
  .map((e) => ({
    id: e.id,
    name: e.name,
    category: categorize(e.path),
    purpose: e.description,
    price: e.creditCost,
    method: e.method,
    path: e.path,
    params: e.parameters.map((p) => ({ name: p.name, example: p.example ?? p.placeholder ?? '', required: p.required })),
    sampleResponse: SAMPLE_BY_ID[e.id] ?? null,
  }));

export function catalogByCategory(cat: LandingCategory): LandingApiItem[] {
  return LANDING_CATALOG.filter((e) => e.category === cat);
}

export function catalogCount(): number { return LANDING_CATALOG.length; }
