/**
 * Technographic detection — deterministic mock (single source of truth).
 *
 * Given a domain, resolves the software, vendors, and infrastructure a company
 * runs — categorized, with a detection *method* (DNS, HTTP header, JS fingerprint,
 * job posting…), a confidence, and first/last-seen dates per technology — then
 * derives GTM-grade *signals* from the mix (data-warehouse modernization,
 * Salesforce-led motion, observability gap…) plus a stack-spend estimate.
 *
 * Coherence: this enriches the company dossier's own `tech_stack`
 * (`resolveCompanyFromDomain`) — it never invents a divergent stack. Pure and
 * deterministic (FNV-1a, no Date.now, no Math.random), so the gateway, Explorer,
 * CLI, and Studio all agree.
 */

import { resolveCompanyFromDomain } from '@/lib/company-resolver';

export type TechCategory =
  | 'Cloud & Infrastructure'
  | 'Languages & Frameworks'
  | 'Data & Analytics'
  | 'Monitoring & Security'
  | 'Payments & Commerce'
  | 'Marketing & CDP'
  | 'CRM & Sales'
  | 'Vertical Software';

export type DetectionMethod =
  | 'DNS record'
  | 'SSL certificate'
  | 'HTTP header'
  | 'Subdomain'
  | 'JS fingerprint'
  | 'Job posting';

export interface TechDetection {
  name: string;
  category: TechCategory;
  vendor: string;
  method: DetectionMethod;
  confidence: number;
  /** Enterprise-grade / paid platform — drives spend estimate + a subtle highlight. */
  premium: boolean;
  first_detected: string;
  last_detected: string;
}

export interface TechCategoryRollup {
  category: TechCategory;
  count: number;
  technologies: string[];
}

export interface TechSignal {
  label: string;
  detail: string;
  kind: 'modernization' | 'adoption' | 'gtm' | 'security' | 'gap';
}

export interface TechnographicProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface TechnographicProfile {
  domain: string;
  company: string;
  industry: string;
  total: number;
  /** 0–100 composite of breadth + premium adoption. */
  sophistication: number;
  estimated_stack_spend: string;
  categories: TechCategoryRollup[];
  detections: TechDetection[];
  signals: TechSignal[];
  confidence: number;
  last_verified: string;
  sources: string[];
  provenance: TechnographicProvenance[];
}

interface CatalogEntry {
  category: TechCategory;
  vendor: string;
  method: DetectionMethod;
  premium: boolean;
}

/**
 * Technology → {category, vendor, detection method, premium}. Covers every tech
 * in the company-resolver stack pools; unknowns fall back to DEFAULT.
 */
const TECH_CATALOG: Record<string, CatalogEntry> = {
  // Cloud & Infrastructure
  AWS: { category: 'Cloud & Infrastructure', vendor: 'Amazon Web Services', method: 'DNS record', premium: true },
  GCP: { category: 'Cloud & Infrastructure', vendor: 'Google Cloud', method: 'DNS record', premium: true },
  Azure: { category: 'Cloud & Infrastructure', vendor: 'Microsoft', method: 'DNS record', premium: true },
  Kubernetes: { category: 'Cloud & Infrastructure', vendor: 'CNCF', method: 'Job posting', premium: false },
  Terraform: { category: 'Cloud & Infrastructure', vendor: 'HashiCorp', method: 'Job posting', premium: false },
  Firebase: { category: 'Cloud & Infrastructure', vendor: 'Google', method: 'JS fingerprint', premium: false },
  // Languages & Frameworks
  React: { category: 'Languages & Frameworks', vendor: 'Meta', method: 'JS fingerprint', premium: false },
  'React Native': { category: 'Languages & Frameworks', vendor: 'Meta', method: 'JS fingerprint', premium: false },
  Go: { category: 'Languages & Frameworks', vendor: 'Google', method: 'Job posting', premium: false },
  Java: { category: 'Languages & Frameworks', vendor: 'Oracle', method: 'Job posting', premium: false },
  Python: { category: 'Languages & Frameworks', vendor: 'Python Software Foundation', method: 'Job posting', premium: false },
  '.NET': { category: 'Languages & Frameworks', vendor: 'Microsoft', method: 'Job posting', premium: false },
  'Node.js': { category: 'Languages & Frameworks', vendor: 'OpenJS Foundation', method: 'HTTP header', premium: false },
  'C++': { category: 'Languages & Frameworks', vendor: 'ISO', method: 'Job posting', premium: false },
  MATLAB: { category: 'Languages & Frameworks', vendor: 'MathWorks', method: 'Job posting', premium: true },
  // Data & Analytics
  PostgreSQL: { category: 'Data & Analytics', vendor: 'PostgreSQL GDG', method: 'Job posting', premium: false },
  Snowflake: { category: 'Data & Analytics', vendor: 'Snowflake', method: 'Job posting', premium: true },
  Kafka: { category: 'Data & Analytics', vendor: 'Apache', method: 'Job posting', premium: false },
  Oracle: { category: 'Data & Analytics', vendor: 'Oracle', method: 'Job posting', premium: true },
  Redis: { category: 'Data & Analytics', vendor: 'Redis Ltd.', method: 'Job posting', premium: false },
  BigQuery: { category: 'Data & Analytics', vendor: 'Google', method: 'Job posting', premium: true },
  Looker: { category: 'Data & Analytics', vendor: 'Google', method: 'JS fingerprint', premium: true },
  SAP: { category: 'Data & Analytics', vendor: 'SAP', method: 'Job posting', premium: true },
  // Monitoring & Security
  Datadog: { category: 'Monitoring & Security', vendor: 'Datadog', method: 'JS fingerprint', premium: true },
  Splunk: { category: 'Monitoring & Security', vendor: 'Cisco', method: 'Job posting', premium: true },
  Okta: { category: 'Monitoring & Security', vendor: 'Okta', method: 'Subdomain', premium: true },
  // Payments & Commerce
  Stripe: { category: 'Payments & Commerce', vendor: 'Stripe', method: 'JS fingerprint', premium: false },
  Shopify: { category: 'Payments & Commerce', vendor: 'Shopify', method: 'HTTP header', premium: false },
  // Marketing & CDP
  Segment: { category: 'Marketing & CDP', vendor: 'Twilio', method: 'JS fingerprint', premium: true },
  Braze: { category: 'Marketing & CDP', vendor: 'Braze', method: 'JS fingerprint', premium: true },
  // CRM & Sales
  Salesforce: { category: 'CRM & Sales', vendor: 'Salesforce', method: 'Subdomain', premium: true },
  // Vertical Software
  Epic: { category: 'Vertical Software', vendor: 'Epic Systems', method: 'Job posting', premium: true },
};

const DEFAULT_ENTRY: CatalogEntry = {
  category: 'Languages & Frameworks',
  vendor: 'Independent',
  method: 'JS fingerprint',
  premium: false,
};

/** Base confidence by detection method — active fingerprints beat inferred signals. */
const METHOD_CONFIDENCE: Record<DetectionMethod, number> = {
  'DNS record': 0.95,
  'SSL certificate': 0.94,
  'HTTP header': 0.92,
  Subdomain: 0.9,
  'JS fingerprint': 0.88,
  'Job posting': 0.76,
};

/** Canonical category ordering for the rollup + panel. */
const CATEGORY_ORDER: TechCategory[] = [
  'Cloud & Infrastructure',
  'Languages & Frameworks',
  'Data & Analytics',
  'Monitoring & Security',
  'Payments & Commerce',
  'Marketing & CDP',
  'CRM & Sales',
  'Vertical Software',
];

const DETECT_EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function isoDaysBefore(days: number): string {
  return new Date(DETECT_EPOCH - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Detect the technographic profile for a domain.
 * Returns `null` for structurally invalid / unresolvable domains.
 */
export function detectTechnographics(rawDomain: string): TechnographicProfile | null {
  const company = resolveCompanyFromDomain(rawDomain);
  if (!company) return null;
  // A personal mailbox domain has no meaningful corporate stack to detect.
  if (company.is_personal_domain || company.tech_stack.length === 0) return null;

  const domain = company.domain;

  const detections: TechDetection[] = company.tech_stack.map((name) => {
    const entry = TECH_CATALOG[name] ?? DEFAULT_ENTRY;
    const h = hash(`${domain}:${name}`);
    // First seen: 180–1580 days ago; last seen: within the past 21 days (recent scan).
    const first_detected = isoDaysBefore(180 + (h % 1400));
    const last_detected = isoDaysBefore((h >>> 9) % 21);
    const confidence = Math.min(0.99, Math.round((METHOD_CONFIDENCE[entry.method] + ((h >>> 4) % 5) * 0.008) * 100) / 100);
    return {
      name,
      category: entry.category,
      vendor: entry.vendor,
      method: entry.method,
      confidence,
      premium: entry.premium,
      first_detected,
      last_detected,
    };
  });

  // Category rollups, in canonical order, only for categories actually present.
  const categories: TechCategoryRollup[] = CATEGORY_ORDER
    .map((category) => {
      const items = detections.filter((d) => d.category === category);
      return { category, count: items.length, technologies: items.map((i) => i.name) };
    })
    .filter((r) => r.count > 0);

  const has = (name: string) => detections.some((d) => d.name === name);
  const hasCategory = (c: TechCategory) => categories.some((r) => r.category === c);
  const premiumCount = detections.filter((d) => d.premium).length;

  // ── Derived GTM signals — presence-based, deterministic, priority-ordered ──
  const signals: TechSignal[] = [];
  if (has('Snowflake') || has('BigQuery')) {
    const dw = has('Snowflake') ? 'Snowflake' : 'BigQuery';
    signals.push({
      kind: 'modernization',
      label: 'Cloud data warehouse in production',
      detail: `Runs ${dw} — a strong signal of an active data & analytics modernization program and budget.`,
    });
  }
  if (has('Kubernetes') && (has('Terraform') || hasCategory('Cloud & Infrastructure'))) {
    signals.push({
      kind: 'adoption',
      label: 'Cloud-native, IaC-driven infrastructure',
      detail: 'Kubernetes with infrastructure-as-code — a mature platform-engineering practice.',
    });
  }
  if (has('Salesforce')) {
    signals.push({ kind: 'gtm', label: 'Salesforce-led revenue motion', detail: 'Salesforce CRM detected — an enterprise, ops-heavy go-to-market.' });
  } else if (has('Segment') || has('Braze')) {
    signals.push({ kind: 'gtm', label: 'Modern martech / CDP stack', detail: `${has('Segment') ? 'Segment' : 'Braze'} in use — a product-led, data-driven lifecycle motion.` });
  }
  if (has('Okta')) {
    signals.push({ kind: 'security', label: 'Zero-trust identity (Okta SSO)', detail: 'Okta detected — centralized SSO and a security-conscious buyer.' });
  }
  if (!hasCategory('Monitoring & Security')) {
    signals.push({ kind: 'gap', label: 'No observability or IdP detected', detail: 'No monitoring or identity platform surfaced — greenfield for security & observability tooling.' });
  }
  if (signals.length === 0) {
    signals.push({ kind: 'adoption', label: `${detections.length} technologies across ${categories.length} categories`, detail: 'A focused, coherent stack for the company’s size and sector.' });
  }
  const topSignals = signals.slice(0, 4);

  // ── Composite scores ──────────────────────────────────────────────────────
  const sophistication = Math.min(100, 22 + categories.length * 7 + premiumCount * 7 + detections.length * 2);
  const spendWeight =
    premiumCount * 2 +
    (company.employee_count > 5000 ? 4 : company.employee_count > 500 ? 2 : company.employee_count > 50 ? 1 : 0);
  const estimated_stack_spend =
    spendWeight >= 10 ? '$1M+/yr' :
    spendWeight >= 6 ? '$250K–$1M/yr' :
    spendWeight >= 3 ? '$50K–$250K/yr' :
    '<$50K/yr';

  const confidence = Math.round((detections.reduce((n, d) => n + d.confidence, 0) / detections.length) * 100) / 100;
  const sources = Array.from(new Set(detections.map((d) => d.method)));

  const provenance: TechnographicProvenance[] = [
    { field: 'detections', source: 'Technographic scan', signal: `${detections.length} technologies from DNS, headers, JS fingerprints, and job posts`, confidence },
    ...(categories[0]
      ? [{ field: 'categories', source: 'Stack classification', signal: `${categories.length} categories · lead: ${categories[0].category}`, confidence: 0.9 }]
      : []),
    { field: 'signals', source: 'Insight engine', signal: `${topSignals.length} GTM signal${topSignals.length === 1 ? '' : 's'} · ${premiumCount} premium platform${premiumCount === 1 ? '' : 's'}`, confidence: 0.84 },
  ];

  return {
    domain,
    company: company.name,
    industry: company.industry,
    total: detections.length,
    sophistication,
    estimated_stack_spend,
    categories,
    detections,
    signals: topSignals,
    confidence,
    last_verified: company.last_verified,
    sources,
    provenance,
  };
}
