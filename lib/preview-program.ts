/**
 * Dark-launch preview endpoints (F-081) — the preview program catalog (SSOT).
 *
 * Zinbit ships upcoming API capabilities behind a dark launch: they're live and
 * callable, but gated to opt-in testers so the shape can settle before GA. This
 * module is the single source of truth for *which* endpoints are in preview,
 * their stability stage, what's new, and their target GA — client-safe (no
 * resolver imports), so the console renders the program without pulling server
 * code. The gated route (`app/api/preview/[[...slug]]/route.ts`) pairs it with
 * the resolvers and enforces opt-in.
 *
 * Stages, most-to-least experimental:
 *   alpha   — shape may change without notice; no SLA. Kick the tyres.
 *   beta    — shape is stable; opt-in, production-safe, may still change at GA.
 *   preview — near-GA; the final shape, gathering last feedback.
 *
 * Preview endpoints are FREE during the dark launch (0 credits) — they start
 * billing at GA. Deterministic: no Math.random in the catalog.
 */

export type PreviewStage = 'alpha' | 'beta' | 'preview';

export interface PreviewParam {
  name: string;
  type: 'email' | 'string';
  example: string;
  description: string;
}

export interface PreviewEndpoint {
  id: string;
  /** Public path under the preview host. */
  path: string;
  name: string;
  stage: PreviewStage;
  summary: string;
  /** The headline changes vs. the current GA equivalent. */
  whatsNew: string[];
  /** Target GA window (display string). */
  targetGA: string;
  /** The GA endpoint this previews (for a "compare" link), if any. */
  supersedes?: string;
  param: PreviewParam;
  resolverKey: string;
}

export const PREVIEW_ENDPOINTS: PreviewEndpoint[] = [
  {
    id: 'people-search-v2',
    path: '/preview/people-search-v2',
    name: 'People Search v2',
    stage: 'beta',
    summary: 'Resolve a person from a work email with the v2 shape — richer identity and an embedded employer, in one call.',
    whatsNew: [
      'Employer firmographics embedded inline (no second call).',
      'Explicit confidence and last-verified on every record.',
      'Stable snake_case field names shared with the REST + GraphQL surfaces.',
    ],
    targetGA: 'Q4 2026',
    supersedes: '/v1/people/phone',
    param: { name: 'email', type: 'email', example: 'jane@stripe.com', description: 'A work email to resolve.' },
    resolverKey: 'people-search-v2',
  },
  {
    id: 'company-graph-v2',
    path: '/preview/company-graph-v2',
    name: 'Company Graph v2',
    stage: 'beta',
    summary: 'Enrich a company and walk its corporate family in one response — firmographics plus the parent/subsidiary graph.',
    whatsNew: [
      'Corporate-family graph (ultimate parent + subsidiaries) inline.',
      'Registry-anchored identity fields alongside firmographics.',
    ],
    targetGA: 'Q1 2027',
    supersedes: '/v1/companies/enrich',
    param: { name: 'domain', type: 'string', example: 'stripe.com', description: 'A company domain to enrich.' },
    resolverKey: 'company-graph-v2',
  },
  {
    id: 'buying-signals',
    path: '/preview/buying-signals',
    name: 'Buying Signals',
    stage: 'alpha',
    summary: 'Real-time buying-intent signals for a company — hiring, funding, and technology moves scored into an intent index. Shape is experimental.',
    whatsNew: [
      'Brand-new capability — no GA equivalent yet.',
      'A single 0–100 intent index rolled up from typed signals.',
      'Alpha: the signal taxonomy and scoring may change.',
    ],
    targetGA: 'Exploratory — no date',
    param: { name: 'domain', type: 'string', example: 'stripe.com', description: 'A company domain to score for buying intent.' },
    resolverKey: 'buying-signals',
  },
];

export const previewById = (id: string): PreviewEndpoint | undefined => PREVIEW_ENDPOINTS.find((p) => p.id === id);
export const allPreviews = (): PreviewEndpoint[] => PREVIEW_ENDPOINTS;
export const PREVIEW_IDS: string[] = PREVIEW_ENDPOINTS.map((p) => p.id);

/** Is a preview enrolled, given the org's opt-in list? */
export const isEnrolled = (optIns: string[], id: string): boolean => optIns.includes(id);

const STAGE_RANK: Record<PreviewStage, number> = { alpha: 0, beta: 1, preview: 2 };
/** Sort previews most-stable first (preview → beta → alpha). */
export const byStability = (a: PreviewEndpoint, b: PreviewEndpoint): number => STAGE_RANK[b.stage] - STAGE_RANK[a.stage];

export const stageLabel = (s: PreviewStage): string => s.charAt(0).toUpperCase() + s.slice(1);
