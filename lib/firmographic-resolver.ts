/**
 * Firmographic append — deterministic mock (single source of truth).
 *
 * Given a domain, appends standardized firmographic *classification codes* —
 * NAICS + SIC (with titles), employee and revenue bands, ownership, and entity
 * type — the CRM-ready segmentation layer, distinct from the descriptive company
 * dossier (Domain → Company, F-002). Deterministic per domain. Builds on
 * `resolveCompanyFromDomain` for the base firmographics and industry.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';

export type OwnershipType = 'Public' | 'Private' | 'VC-backed' | 'PE-backed' | 'Nonprofit' | 'Government';
export type EntityType = 'Corporation' | 'LLC' | 'Subsidiary' | 'Partnership';

export interface FirmographicProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface FirmographicAppend {
  domain: string;
  company: string;
  naics_code: string;
  naics_title: string;
  sic_code: string;
  sic_title: string;
  industry: string;
  sub_industry: string;
  employee_count: number;
  employee_band: string;
  revenue_band: string;
  ownership: OwnershipType;
  entity_type: EntityType;
  founded_year: number;
  hq_country: string;
  confidence: number;
  last_verified: string;
  provenance: FirmographicProvenance[];
}

/** Industry → standardized classification codes (NAICS + SIC), with titles. */
const CLASSIFICATION: Record<string, { naics: [string, string]; sic: [string, string] }> = {
  Software: { naics: ['511210', 'Software Publishers'], sic: ['7372', 'Prepackaged Software'] },
  'Enterprise Software': { naics: ['511210', 'Software Publishers'], sic: ['7372', 'Prepackaged Software'] },
  'Consumer Internet': { naics: ['519130', 'Internet Publishing & Web Search Portals'], sic: ['7375', 'Computer Facilities Management'] },
  'Financial Services': { naics: ['522320', 'Financial Transactions Processing & Clearing'], sic: ['6099', 'Functions Related to Depository Banking'] },
  'E-commerce': { naics: ['454110', 'Electronic Shopping & Mail-Order Houses'], sic: ['5961', 'Catalog & Mail-Order Houses'] },
  Healthcare: { naics: ['621999', 'All Other Ambulatory Health Care Services'], sic: ['8099', 'Health & Allied Services'] },
  'Media & Advertising': { naics: ['541810', 'Advertising Agencies'], sic: ['7311', 'Advertising Agencies'] },
  Manufacturing: { naics: ['334111', 'Electronic Computer Manufacturing'], sic: ['3571', 'Electronic Computers'] },
};

const DEFAULT_CLASS: { naics: [string, string]; sic: [string, string] } = {
  naics: ['541990', 'All Other Professional & Technical Services'],
  sic: ['8748', 'Business Consulting Services'],
};

const ENTITY_TYPES: EntityType[] = ['Corporation', 'LLC', 'Subsidiary', 'Partnership'];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function appendFirmographics(rawDomain: string): FirmographicAppend | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company) return null;

  const domain = company.domain;
  const h = hash(domain);
  const cls = CLASSIFICATION[company.industry] ?? DEFAULT_CLASS;

  // Ownership: large headcount → Public; otherwise a weighted, deterministic mix.
  let ownership: OwnershipType;
  if (company.employee_count > 8000) {
    ownership = 'Public';
  } else {
    const r = h % 100;
    ownership =
      r < 44 ? 'VC-backed' :
      r < 72 ? 'Private' :
      r < 88 ? 'PE-backed' :
      r < 95 ? 'Public' :
      r < 98 ? 'Nonprofit' :
      'Government';
  }

  const entity_type =
    ownership === 'Nonprofit' ? 'Corporation' :
    ownership === 'Government' ? 'Corporation' :
    ENTITY_TYPES[(h >>> 4) % ENTITY_TYPES.length];

  return {
    domain,
    company: company.name,
    naics_code: cls.naics[0],
    naics_title: cls.naics[1],
    sic_code: cls.sic[0],
    sic_title: cls.sic[1],
    industry: company.industry,
    sub_industry: company.sub_industry,
    employee_count: company.employee_count,
    employee_band: company.employee_band,
    revenue_band: company.revenue_band,
    ownership,
    entity_type,
    founded_year: company.founded_year,
    hq_country: company.hq_country,
    confidence: company.confidence,
    last_verified: company.last_verified,
    provenance: [
      {
        field: 'naics',
        source: 'Industry classification',
        signal: `${company.industry} → NAICS ${cls.naics[0]} (${cls.naics[1]})`,
        confidence: 0.92,
      },
      {
        field: 'employee_band',
        source: 'Firmographic graph',
        signal: `~${company.employee_count.toLocaleString()} employees · ${company.employee_band}`,
        confidence: 0.9,
      },
      {
        field: 'ownership',
        source: 'Registry + funding signals',
        signal: `${ownership} · ${entity_type}`,
        confidence: 0.85,
      },
    ],
  };
}
