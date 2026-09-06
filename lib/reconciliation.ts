/**
 * Cross-source reconciliation (F-027) — merge conflicting values across providers.
 *
 * When several data providers report a field for the same entity and they disagree
 * ("VP, Engineering" vs "VP Eng" vs an older "Senior Engineer"), reconciliation
 * picks the value to trust. Each observation is weighted by its provider's
 * reliability (the F-043 source catalog) AND its recency — a fresher observation
 * from a strong source wins. Near-identical values are clustered with Jaro-Winkler
 * so formatting differences don't look like conflicts; genuinely different values
 * surface as a conflict with the losing candidates shown.
 *
 * Pure and deterministic — same observations → same reconciliation. No `Math.random`.
 */

import { resolveProvider } from '@/lib/source-catalog';
import { jaroWinkler } from '@/lib/fuzzy-matcher';

export interface SourceObservation {
  /** Provenance source string (maps to the F-043 source catalog). */
  source: string;
  value: string;
  /** YYYY-MM-DD the source last observed this value. */
  observedAt: string;
}

export interface FieldObservations {
  field: string;
  observations: SourceObservation[];
}

export interface ReconciledCandidate {
  value: string;
  /** Provider display names that reported a value in this cluster. */
  sources: string[];
  /** Combined reliability × recency weight. */
  score: number;
  latestObservedAt: string;
}

export interface ReconciledField {
  field: string;
  /** The winning value. */
  value: string;
  /** 0..1 — winner's share of total weight. */
  confidence: number;
  /** Provider name behind the winning value. */
  winningSource: string;
  /** 0..1 — share of observations that agree with the winner. */
  agreement: number;
  /** True when materially different values were reported. */
  conflict: boolean;
  candidates: ReconciledCandidate[];
}

export interface ReconciliationResult {
  fields: ReconciledField[];
  fieldCount: number;
  conflictCount: number;
  /** Mean field confidence, 0..1. */
  overallConfidence: number;
}

// Recency reference (the prototype's "now"), so weighting is deterministic.
const REF = { y: 2026, m: 9 };
const SAME_VALUE_THRESHOLD = 0.92; // Jaro-Winkler ≥ this ⇒ same cluster (formatting variant)
const CONFLICT_THRESHOLD = 0.85;   // a losing cluster this dissimilar ⇒ a real conflict

const normValue = (v: string) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function monthsAgo(observedAt: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(String(observedAt || ''));
  if (!m) return 12;
  const months = (REF.y * 12 + (REF.m - 1)) - (Number(m[1]) * 12 + (Number(m[2]) - 1));
  return Math.max(0, months);
}
// Newer observations weigh more; floored so old-but-reliable data still counts.
const recencyFactor = (observedAt: string) => Math.max(0.3, 1 - monthsAgo(observedAt) * 0.03);

interface Cluster {
  rep: string;            // representative (highest-weight) value
  repWeight: number;
  members: { obs: SourceObservation; providerName: string; weight: number }[];
  score: number;
  latestObservedAt: string;
}

/** Reconcile one field's observations into a single trusted value. */
export function reconcileField(fo: FieldObservations): ReconciledField {
  const obs = fo.observations.filter((o) => o && String(o.value ?? '').trim() !== '');
  if (obs.length === 0) {
    return { field: fo.field, value: '', confidence: 0, winningSource: '', agreement: 0, conflict: false, candidates: [] };
  }

  const clusters: Cluster[] = [];
  obs.forEach((o) => {
    const provider = resolveProvider(o.source);
    const weight = provider.reliability * recencyFactor(o.observedAt);
    const member = { obs: o, providerName: provider.name, weight };
    // Join an existing cluster if the value matches (exact-normalized or high Jaro-Winkler).
    const nv = normValue(o.value);
    const hit = clusters.find((c) => {
      const cv = normValue(c.rep);
      return cv === nv || jaroWinkler(cv, nv) >= SAME_VALUE_THRESHOLD;
    });
    if (hit) {
      hit.members.push(member);
      hit.score += weight;
      if (weight > hit.repWeight) { hit.rep = o.value; hit.repWeight = weight; }
      if (o.observedAt > hit.latestObservedAt) hit.latestObservedAt = o.observedAt;
    } else {
      clusters.push({ rep: o.value, repWeight: weight, members: [member], score: weight, latestObservedAt: o.observedAt });
    }
  });

  clusters.sort((a, b) => b.score - a.score);
  const winner = clusters[0];
  const totalScore = clusters.reduce((s, c) => s + c.score, 0);
  const totalObs = obs.length;

  // Winning provider = highest-weight member of the winning cluster.
  const winningMember = [...winner.members].sort((a, b) => b.weight - a.weight)[0];

  // Conflict = a runner-up cluster with a materially different value + real support.
  const conflict = clusters.slice(1).some((c) =>
    jaroWinkler(normValue(c.rep), normValue(winner.rep)) < CONFLICT_THRESHOLD && c.score >= winner.score * 0.25,
  );

  const candidates: ReconciledCandidate[] = clusters.map((c) => ({
    value: c.rep,
    sources: Array.from(new Set(c.members.map((m) => m.providerName))),
    score: Math.round(c.score * 1000) / 1000,
    latestObservedAt: c.latestObservedAt,
  }));

  return {
    field: fo.field,
    value: winner.rep,
    confidence: totalScore === 0 ? 0 : Math.round((winner.score / totalScore) * 1000) / 1000,
    winningSource: winningMember.providerName,
    agreement: Math.round((winner.members.length / totalObs) * 1000) / 1000,
    conflict,
    candidates,
  };
}

/** Reconcile a full record's fields into a golden record. */
export function reconcile(fields: FieldObservations[]): ReconciliationResult {
  const reconciled = fields.map(reconcileField);
  const conflictCount = reconciled.filter((f) => f.conflict).length;
  const overall = reconciled.length === 0 ? 0
    : Math.round((reconciled.reduce((s, f) => s + f.confidence, 0) / reconciled.length) * 1000) / 1000;
  return { fields: reconciled, fieldCount: reconciled.length, conflictCount, overallConfidence: overall };
}
