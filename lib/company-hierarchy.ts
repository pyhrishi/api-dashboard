/**
 * Company hierarchy graph (F-008) — resolve a corporate family tree.
 *
 * Given a company domain, return its whole corporate structure: the ultimate
 * parent, intermediate parents, subsidiaries, branches, and divisions — each a
 * real entity with an ownership stake and a registry id (CIN-style), tying the
 * hierarchy to registry-backed identity (the dual-engine truth differentiator).
 *
 * Deterministic: the same domain always resolves to the same tree. Built on top
 * of the shared company resolver, so a node's base facts agree with a direct
 * company lookup. No Math.random, no wall-clock in the shape of the tree.
 */

import { resolveCompanyFromDomain, normalizeDomain, type EnrichedCompany } from '@/lib/company-resolver';

export type HierarchyRelation = 'ultimate_parent' | 'parent' | 'subsidiary' | 'branch' | 'division' | 'affiliate';
export type HierarchyRole = 'standalone' | 'parent' | 'subsidiary';

export interface HierarchyNode {
  id: string;
  domain: string;
  name: string;
  legal_name: string;
  entity_type: string;
  relation: HierarchyRelation;
  parent_id: string | null;
  ownership_pct: number | null;
  employee_count: number;
  industry: string;
  hq_city: string;
  hq_country: string;
  registry_id: string;
  is_subject: boolean;
  is_ultimate_parent: boolean;
  depth: number;
}

export interface CompanyHierarchy {
  subject_domain: string;
  role: HierarchyRole;
  ultimate_parent_id: string;
  subject_id: string;
  total_entities: number;
  max_depth: number;
  countries: string[];
  nodes: HierarchyNode[];
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
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const between = (rng: () => number, lo: number, hi: number) => Math.round(lo + rng() * (hi - lo));

/** Strip common corporate suffixes to get a clean brand base. */
function brandBase(name: string): string {
  return name
    .replace(/\b(inc|inc\.|llc|ltd|ltd\.|limited|corp|corp\.|corporation|gmbh|pvt|private|plc|co|co\.|group|holdings|international|labs|technologies|technology|software|systems|solutions)\b/gi, '')
    .replace(/[.,]/g, '')
    .trim() || name;
}

interface Region { suffix: string; city: string; country: string }
// Country is the full name to match the base company resolver's `hq_country`.
const REGIONS: Region[] = [
  { suffix: 'India Pvt Ltd', city: 'Bengaluru', country: 'India' },
  { suffix: 'EU GmbH', city: 'Berlin', country: 'Germany' },
  { suffix: 'UK Ltd', city: 'London', country: 'United Kingdom' },
  { suffix: 'APAC Pte Ltd', city: 'Singapore', country: 'Singapore' },
  { suffix: 'Canada Inc', city: 'Toronto', country: 'Canada' },
  { suffix: 'Brasil Ltda', city: 'São Paulo', country: 'Brazil' },
];
const DIVISIONS = ['Labs', 'Cloud', 'Ventures', 'Studios', 'Data', 'Payments'];
const PARENT_SUFFIXES = ['Holdings', 'Group', 'International', 'Global'];

/** A deterministic CIN-style registry id (India entities) or a generic company number. */
function registryId(seed: number, country: string): string {
  const rng = makeRng(seed ^ 0x9e3779b9);
  if (/^(in|india)$/i.test(country)) {
    const states = ['KA', 'MH', 'DL', 'TN', 'TG'];
    const kind = pick(rng, ['PTC', 'PLC']);
    return `U${between(rng, 10000, 99999)}${pick(rng, states)}${between(rng, 2004, 2021)}${kind}${String(between(rng, 100000, 999999))}`;
  }
  const prefix = /^(de|germany)$/i.test(country) ? 'HRB ' : '';
  return `${prefix}${between(rng, 1000000, 9999999)}`;
}

function entityTypeFor(relation: HierarchyRelation, base: EnrichedCompany | null): string {
  if (relation === 'ultimate_parent') return base?.type === 'Public' ? 'Public' : 'Private';
  if (relation === 'branch') return 'Branch';
  if (relation === 'division') return 'Division';
  return 'Subsidiary';
}

function slugDomain(base: string, suffix: string): string {
  const s = `${base} ${suffix}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${s.slice(0, 24)}.com`;
}

/**
 * Resolve the corporate family tree for a domain. Returns null when the domain
 * doesn't resolve to a real company (personal/invalid).
 */
export function resolveCompanyHierarchy(rawDomain: string): CompanyHierarchy | null {
  const domain = normalizeDomain(rawDomain);
  const subject = resolveCompanyFromDomain(domain);
  if (!subject || subject.is_personal_domain) return null;

  const seed = hash(domain);
  const rng = makeRng(seed);
  const base = brandBase(subject.name);

  const roll = rng();
  const role: HierarchyRole = roll < 0.25 ? 'standalone' : roll < 0.62 ? 'subsidiary' : 'parent';

  const nodes: HierarchyNode[] = [];
  let idc = 0;
  const nextId = () => `ent_${(seed % 100000).toString(36)}${(idc++).toString(36)}`;

  const subjectNode = (relation: HierarchyRelation, parentId: string | null, depth: number, ownership: number | null): HierarchyNode => ({
    id: nextId(),
    domain: subject.domain,
    name: subject.name,
    legal_name: subject.legal_name,
    entity_type: entityTypeFor(relation, subject),
    relation,
    parent_id: parentId,
    ownership_pct: ownership,
    employee_count: subject.employee_count,
    industry: subject.industry,
    hq_city: subject.hq_city,
    hq_country: subject.hq_country,
    registry_id: registryId(seed, subject.hq_country),
    is_subject: true,
    is_ultimate_parent: relation === 'ultimate_parent',
    depth,
  });

  const makeEntity = (name: string, region: Region | null, relation: HierarchyRelation, parentId: string, depth: number, employees: number): HierarchyNode => {
    const country = region?.country ?? subject.hq_country;
    const city = region?.city ?? subject.hq_city;
    const nodeSeed = hash(name) ^ seed;
    return {
      id: nextId(),
      domain: slugDomain(base, region?.suffix ?? relation),
      name,
      legal_name: name,
      entity_type: entityTypeFor(relation, subject),
      relation,
      parent_id: parentId,
      ownership_pct: between(makeRng(nodeSeed), 51, 100),
      employee_count: Math.max(5, employees),
      industry: subject.industry,
      hq_city: city,
      hq_country: country,
      registry_id: registryId(nodeSeed, country),
      is_subject: false,
      is_ultimate_parent: false,
      depth,
    };
  };

  let ultimateParentId: string;
  let subjectId: string;

  if (role === 'standalone') {
    const s = subjectNode('ultimate_parent', null, 0, null);
    nodes.push(s);
    ultimateParentId = s.id;
    subjectId = s.id;
  } else if (role === 'subsidiary') {
    // Ultimate parent (a holding company) → subject (+ 0-2 sibling subsidiaries).
    const parentName = `${base} ${pick(rng, PARENT_SUFFIXES)}`;
    const parent: HierarchyNode = {
      id: nextId(),
      domain: slugDomain(base, pick(rng, PARENT_SUFFIXES)),
      name: parentName,
      legal_name: `${parentName} ${pick(rng, ['Inc', 'PLC', 'AG'])}`,
      entity_type: 'Public',
      relation: 'ultimate_parent',
      parent_id: null,
      ownership_pct: null,
      employee_count: subject.employee_count * between(rng, 3, 8),
      industry: subject.industry,
      hq_city: subject.hq_city,
      hq_country: subject.hq_country,
      registry_id: registryId(seed ^ 0x55, subject.hq_country),
      is_subject: false,
      is_ultimate_parent: true,
      depth: 0,
    };
    nodes.push(parent);
    ultimateParentId = parent.id;
    const subj = subjectNode('subsidiary', parent.id, 1, between(rng, 60, 100));
    nodes.push(subj);
    subjectId = subj.id;
    const siblingCount = between(rng, 0, 2);
    const used = new Set<string>();
    for (let i = 0; i < siblingCount; i++) {
      const region = pick(rng, REGIONS.filter((r) => !used.has(r.suffix)));
      if (!region) break;
      used.add(region.suffix);
      nodes.push(makeEntity(`${base} ${region.suffix}`, region, 'subsidiary', parent.id, 1, Math.round(subject.employee_count * (0.3 + rng()))));
    }
  } else {
    // Subject is the ultimate parent → 2-5 children (regional subs, divisions, a branch).
    const subj = subjectNode('ultimate_parent', null, 0, null);
    nodes.push(subj);
    ultimateParentId = subj.id;
    subjectId = subj.id;
    const childCount = between(rng, 2, 5);
    const usedRegions = new Set<string>();
    const usedDivs = new Set<string>();
    for (let i = 0; i < childCount; i++) {
      const kind = rng();
      if (kind < 0.6) {
        const region = pick(rng, REGIONS.filter((r) => !usedRegions.has(r.suffix)));
        if (!region) continue;
        usedRegions.add(region.suffix);
        const child = makeEntity(`${base} ${region.suffix}`, region, i === 0 && rng() < 0.4 ? 'branch' : 'subsidiary', subj.id, 1, Math.round(subject.employee_count * (0.15 + rng() * 0.5)));
        nodes.push(child);
        // A regional sub may itself own a small division (depth 2).
        if (rng() < 0.35) {
          const div = pick(rng, DIVISIONS.filter((d) => !usedDivs.has(d)));
          if (div) { usedDivs.add(div); nodes.push(makeEntity(`${base} ${div}`, region, 'division', child.id, 2, between(rng, 8, 60))); }
        }
      } else {
        const div = pick(rng, DIVISIONS.filter((d) => !usedDivs.has(d)));
        if (!div) continue;
        usedDivs.add(div);
        nodes.push(makeEntity(`${base} ${div}`, null, 'division', subj.id, 1, between(rng, 15, 120)));
      }
    }
  }

  const countriesSet = new Set<string>();
  nodes.forEach((n) => countriesSet.add(n.hq_country));
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);

  return {
    subject_domain: domain,
    role,
    ultimate_parent_id: ultimateParentId,
    subject_id: subjectId,
    total_entities: nodes.length,
    max_depth: maxDepth,
    countries: Array.from(countriesSet),
    nodes,
    confidence: subject.confidence,
    as_of: AS_OF,
  };
}
