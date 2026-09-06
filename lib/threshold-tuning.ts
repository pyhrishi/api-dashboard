/**
 * Match threshold tuning (F-034) — deterministic evaluation engine, SSOT.
 *
 * A confidence floor is only meaningful if you can see what it accepts and
 * rejects. This module holds a labeled sample of record pairs (ground truth:
 * same entity or not), scored with the SAME similarity engine that governs real
 * matches (jaroWinkler from the fuzzy matcher), and evaluates any threshold into
 * a precision / recall / F1 breakdown. So the floor a team tunes here is exactly
 * the floor that applies in production. Deterministic — no `Math.random`.
 */

import { jaroWinkler } from '@/lib/fuzzy-matcher';
import { canonicalNameString } from '@/lib/name-canonicalizer';

export type MatchUseCase = 'contact_match' | 'company_dedupe' | 'lead_routing';

export interface UseCaseMeta {
  id: MatchUseCase;
  label: string;
  blurb: string;
  /** A stricter default floor for higher-stakes use cases. */
  recommended: number;
}

export const USE_CASES: UseCaseMeta[] = [
  { id: 'contact_match', label: 'Contact matching', blurb: 'Resolve an inbound contact to an existing person. Favor precision — a wrong merge is costly.', recommended: 0.85 },
  { id: 'company_dedupe', label: 'Company de-dup', blurb: 'Collapse duplicate company records. Balance precision and recall.', recommended: 0.8 },
  { id: 'lead_routing', label: 'Lead routing', blurb: 'Attach a lead to an account. Favor recall — a missed match loses the lead.', recommended: 0.72 },
];

export const DEFAULT_THRESHOLDS: Record<MatchUseCase, number> = {
  contact_match: 0.85, company_dedupe: 0.8, lead_routing: 0.72,
};

export interface SamplePair {
  id: string;
  left: string;
  right: string;
  /** 0..1 similarity from the production engine. */
  score: number;
  /** Ground truth: are these the same entity? */
  isMatch: boolean;
}

export interface ThresholdEval {
  threshold: number;
  total: number;
  accepted: number;
  rejected: number;
  truePos: number;
  falsePos: number;
  trueNeg: number;
  falseNeg: number;
  /** 0..1 — of accepted pairs, how many were true matches. */
  precision: number;
  /** 0..1 — of true matches, how many were accepted. */
  recall: number;
  f1: number;
  accuracy: number;
}

// Labeled record pairs per use case. Each is a realistic near/false pair; the
// score is computed live from jaroWinkler so it always tracks the real engine.
const RAW_PAIRS: Record<MatchUseCase, { id: string; left: string; right: string; isMatch: boolean }[]> = {
  contact_match: [
    { id: 'c1', left: 'Jonathan Smith', right: 'Jon Smith', isMatch: true },
    { id: 'c2', left: 'Robert McDonald', right: 'Bob Mcdonald', isMatch: true },
    { id: 'c3', left: 'Katherine Nguyen', right: 'Kate Nguyen', isMatch: true },
    { id: 'c4', left: 'José García', right: 'Jose Garcia', isMatch: true },
    { id: 'c5', left: 'Michael Chen', right: 'Micheal Chen', isMatch: true },
    { id: 'c6', left: 'Sarah Johnson', right: 'Sara Johnston', isMatch: false },
    { id: 'c7', left: 'David Park', right: 'Daniel Park', isMatch: false },
    { id: 'c8', left: 'Emily Carter', right: 'Emma Carver', isMatch: false },
    { id: 'c9', left: 'Priya Nair', right: 'Priyanka Nayar', isMatch: false },
    { id: 'c10', left: 'Thomas Wright', right: 'Tom Wright', isMatch: true },
    { id: 'c11', left: 'Alexandra Ross', right: 'Alex Ronson', isMatch: false },
    { id: 'c12', left: 'William Torres', right: 'Will Torres', isMatch: true },
    { id: 'c13', left: 'Wei Zhang', right: 'Maria Lopez', isMatch: false },
    { id: 'c14', left: 'Fatima Al-Sayed', right: 'George Baker', isMatch: false },
  ],
  company_dedupe: [
    { id: 'd1', left: 'Stripe Inc', right: 'Stripe, Inc.', isMatch: true },
    { id: 'd2', left: 'Datadog', right: 'Datadog HQ', isMatch: true },
    { id: 'd3', left: 'Shopify Commerce', right: 'Shopify', isMatch: true },
    { id: 'd4', left: 'Notion Labs', right: 'Notion', isMatch: true },
    { id: 'd5', left: 'Acme Corp', right: 'Acme Corporation', isMatch: true },
    { id: 'd6', left: 'Apex Systems', right: 'Apexx Systems', isMatch: false },
    { id: 'd7', left: 'Northwind', right: 'Northgate', isMatch: false },
    { id: 'd8', left: 'Globex', right: 'Globe X Media', isMatch: false },
    { id: 'd9', left: 'Initech', right: 'Initrode', isMatch: false },
    { id: 'd10', left: 'Vandelay Industries', right: 'Vandelay Imports', isMatch: false },
    { id: 'd11', left: 'Meridian Health', right: 'Zephyr Logistics', isMatch: false },
  ],
  lead_routing: [
    { id: 'l1', left: 'Figma Design', right: 'Figma', isMatch: true },
    { id: 'l2', left: 'Vercel', right: 'Vercel Inc', isMatch: true },
    { id: 'l3', left: 'Airbnb', right: 'AirBnB', isMatch: true },
    { id: 'l4', left: 'Zomato Media', right: 'Zomato', isMatch: true },
    { id: 'l5', left: 'Databricks', right: 'Data Bricks', isMatch: true },
    { id: 'l6', left: 'Snowflake', right: 'Snowline', isMatch: false },
    { id: 'l7', left: 'Atlassian', right: 'Atlas Sign', isMatch: false },
    { id: 'l8', left: 'Twilio', right: 'Twillow', isMatch: false },
    { id: 'l9', left: 'HubSpot', right: 'HubSprout', isMatch: false },
    { id: 'l10', left: 'Quantum Foods', right: 'Bluepeak Realty', isMatch: false },
  ],
};

// Company-name normalization: drop legal suffixes and noise words before scoring,
// mirroring how company de-dup compares names.
const COMPANY_NOISE = /\b(inc|inc\.|corp|corporation|llc|ltd|co|company|group|holdings|labs|media|hq|the)\b/gi;
const normCompany = (s: string) => s.toLowerCase().replace(COMPANY_NOISE, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Score a pair the way its use case's production matcher would (normalize, then Jaro-Winkler). */
function scorePair(useCase: MatchUseCase, left: string, right: string): number {
  if (useCase === 'contact_match') {
    return jaroWinkler(canonicalNameString(left) || left, canonicalNameString(right) || right);
  }
  return jaroWinkler(normCompany(left), normCompany(right));
}

/** The labeled, live-scored sample for a use case. */
export function getSamplePairs(useCase: MatchUseCase): SamplePair[] {
  return RAW_PAIRS[useCase].map((p) => ({
    ...p,
    score: scorePair(useCase, p.left, p.right),
  }));
}

const pct = (n: number) => Math.round(n * 1000) / 1000;

/** Evaluate a threshold against a labeled sample into a precision/recall breakdown. */
export function evaluateThreshold(pairs: SamplePair[], threshold: number): ThresholdEval {
  let truePos = 0, falsePos = 0, trueNeg = 0, falseNeg = 0;
  for (const p of pairs) {
    const accepted = p.score >= threshold;
    if (accepted && p.isMatch) truePos++;
    else if (accepted && !p.isMatch) falsePos++;
    else if (!accepted && !p.isMatch) trueNeg++;
    else falseNeg++;
  }
  const accepted = truePos + falsePos;
  const precision = accepted > 0 ? truePos / accepted : 1; // vacuously precise when nothing accepted
  const recall = truePos + falseNeg > 0 ? truePos / (truePos + falseNeg) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const total = pairs.length;
  const accuracy = total > 0 ? (truePos + trueNeg) / total : 0;
  return {
    threshold: pct(threshold),
    total,
    accepted,
    rejected: total - accepted,
    truePos, falsePos, trueNeg, falseNeg,
    precision: pct(precision), recall: pct(recall), f1: pct(f1), accuracy: pct(accuracy),
  };
}

/** The F1-maximizing threshold over the sample — the "suggested" floor. */
export function suggestThreshold(pairs: SamplePair[]): number {
  let best = 0.5, bestF1 = -1;
  for (let t = 50; t <= 99; t++) {
    const th = t / 100;
    const f1 = evaluateThreshold(pairs, th).f1;
    if (f1 > bestF1) { bestF1 = f1; best = th; }
  }
  return best;
}
