/**
 * Entity de-duplication — collapse a messy record list into golden records.
 *
 * Given a delimited list of "Name, Company" records, clusters near-duplicate
 * entities (typos, nicknames, domain-vs-name company variants) and emits one
 * golden record per cluster with the merged members, each member's similarity
 * to the golden, and a per-cluster merge confidence — plus a dedup summary.
 *
 * Coherence: reuses the same Jaro-Winkler similarity engine as Probabilistic
 * Fuzzy Matching (`lib/fuzzy-matcher.ts`), so dedup and fuzzy match score
 * variants identically. Pure and deterministic — no Math.random, no wall-clock.
 */

import { jaroWinkler } from '@/lib/fuzzy-matcher';

export interface DedupInputRecord {
  raw: string;
  name: string;
  company: string;
}

export interface DedupMember {
  name: string;
  company: string;
  is_golden: boolean;
  /** Similarity of this member to the cluster's golden record (0–1). */
  similarity: number;
}

export interface DedupCluster {
  id: string;
  golden: { name: string; company: string };
  size: number;
  /** Mean pairwise similarity across the cluster (1 for a singleton). */
  confidence: number;
  members: DedupMember[];
}

export interface DedupResult {
  input_count: number;
  unique_count: number;
  duplicate_count: number;
  /** Share of input records that were duplicates (0–1). */
  dedup_rate: number;
  clusters: DedupCluster[];
}

/** Records above this blended similarity are treated as the same entity. */
const MERGE_THRESHOLD = 0.86;
const MAX_RECORDS = 50;
const COMPANY_SUFFIX = /\b(inc|llc|ltd|corp|co|gmbh|company|technologies|systems|labs)\b/g;
const COMPANY_TLD = /\.(com|io|in|so|co|net|org|ai|dev|app|xyz)\b/g;

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
const normCompany = (s: string): string =>
  s.toLowerCase().replace(COMPANY_TLD, '').replace(COMPANY_SUFFIX, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Parse a ";"- or newline-delimited list of "Name, Company" rows. */
export function parseRecords(raw: string): DedupInputRecord[] {
  return String(raw || '')
    .split(/[;\n]+/)
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, MAX_RECORDS)
    .map((row) => {
      const parts = row.split(',').map((p) => p.trim());
      return { raw: row, name: parts[0] ?? '', company: parts[1] ?? '' };
    })
    .filter((r) => r.name.length > 0);
}

/** Blended name+company similarity (name weighted higher). */
function recordSimilarity(a: DedupInputRecord, b: DedupInputRecord): number {
  const nameSim = jaroWinkler(normName(a.name), normName(b.name));
  const bothHaveCompany = a.company && b.company;
  const compSim = bothHaveCompany ? jaroWinkler(normCompany(a.company), normCompany(b.company)) : 0.5;
  return Math.round((0.65 * nameSim + 0.35 * compSim) * 1000) / 1000;
}

/** Completeness heuristic to elect a cluster's golden record (higher is better). */
function completeness(r: DedupInputRecord): number {
  const tokens = normName(r.name).split(' ').filter(Boolean).length;
  const noAbbrev = /\.\s|\b[a-z]\b/i.test(r.name) ? 0 : 1; // penalize "J. Smith"
  const hasCompany = r.company ? 1 : 0;
  return tokens * 2 + noAbbrev + hasCompany + r.name.length / 100;
}

/**
 * De-duplicate a delimited record list.
 * Returns `null` when fewer than two records can be parsed (nothing to dedupe).
 */
export function deduplicateRecords(raw: string): DedupResult | null {
  const records = parseRecords(raw);
  if (records.length < 2) return null;

  // Greedy single-link clustering in input order (deterministic).
  const clusters: DedupInputRecord[][] = [];
  for (const rec of records) {
    let placed = false;
    for (const cluster of clusters) {
      const sim = Math.max(...cluster.map((m) => recordSimilarity(rec, m)));
      if (sim >= MERGE_THRESHOLD) {
        cluster.push(rec);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([rec]);
  }

  const built: DedupCluster[] = clusters.map((group, i) => {
    // Golden = most complete member; ties break to earliest input order.
    let goldenIdx = 0;
    for (let j = 1; j < group.length; j++) {
      if (completeness(group[j]) > completeness(group[goldenIdx])) goldenIdx = j;
    }
    const goldenRec = group[goldenIdx];
    const golden = {
      name: titleCase(normName(goldenRec.name)),
      company: goldenRec.company ? titleCase(normCompany(goldenRec.company)) || goldenRec.company : '—',
    };

    const members: DedupMember[] = group.map((m, idx) => ({
      name: m.name,
      company: m.company || '—',
      is_golden: idx === goldenIdx,
      similarity: idx === goldenIdx ? 1 : recordSimilarity(m, goldenRec),
    }));

    // Confidence = mean pairwise similarity (1 for a singleton).
    let confidence = 1;
    if (group.length > 1) {
      let sum = 0;
      let pairs = 0;
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          sum += recordSimilarity(group[a], group[b]);
          pairs++;
        }
      }
      confidence = Math.round((sum / pairs) * 1000) / 1000;
    }

    return { id: `cluster_${i + 1}`, golden, size: group.length, confidence, members };
  });

  // Duplicate-first ordering, then by size, so the interesting merges lead.
  built.sort((a, b) => b.size - a.size);

  const input_count = records.length;
  const unique_count = built.length;
  const duplicate_count = input_count - unique_count;
  const dedup_rate = Math.round((duplicate_count / input_count) * 1000) / 1000;

  return { input_count, unique_count, duplicate_count, dedup_rate, clusters: built };
}
