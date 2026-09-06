/**
 * Match audit trail — a tamper-evident ledger of every match decision.
 *
 * Compliance and debugging both need to answer "why is this record resolved the
 * way it is?" This module assembles a chronological, immutable trail from the
 * decision records the platform already keeps — coverage lookups (`apiLogs`, via
 * the insight-engine's match explainer) and manual merge/unmerge decisions
 * (`entityMerges`, F-033) — capturing the verdict, confidence, the RULES applied,
 * and the SOURCES consulted behind each resolved record.
 *
 * Each entry chains the previous entry's hash (SHA-256, the same primitive as
 * Hashed-email lookups and the Zinbit ID), so any edit, insertion, or deletion
 * breaks the chain and is detectable. Pure and deterministic — no Math.random.
 */

import { sha256Hex } from '@/lib/sha256';
import { explainMatch, type MatchExplanation } from '@/lib/insight-engine';
import type { ApiLog } from '@/lib/store';
import type { EntityMerge, MergeableEntity } from '@/lib/merge-seed';

export type MatchAuditType = 'lookup' | 'merge' | 'unmerge';
export type MatchAuditVerdict = 'matched' | 'missed' | 'error' | 'excluded' | 'merged' | 'reverted';

export interface MatchAuditEntry {
  seq: number;
  id: string;
  timestamp: number;
  isoTime: string;
  type: MatchAuditType;
  verdict: MatchAuditVerdict;
  subject: string;
  endpointLabel: string;
  identifier: string;
  confidence: number | null;
  /** The rules/engines applied to reach the decision. */
  rules: string[];
  /** The data sources that contributed to the decision. */
  sources: string[];
  actor: string;
  prevHash: string;
  hash: string;
}

export interface AuditIntegrity {
  valid: boolean;
  /** Sequence number of the first tampered entry, or null when intact. */
  brokenAt: number | null;
  entries: number;
}

const GENESIS = '0'.repeat(64);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const unique = (arr: string[]): string[] => Array.from(new Set(arr.filter(Boolean)));

/** Pull the payload object out of a gateway response envelope, defensively. */
function payloadOf(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) return null;
  if (isRecord(response.data)) return response.data;
  return response;
}

/** Sources named in a result's provenance (or a nested person/company's). */
function sourcesFrom(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const buckets: unknown[] = [payload.provenance];
  if (isRecord(payload.person)) buckets.push(payload.person.provenance);
  if (isRecord(payload.company)) buckets.push(payload.company.provenance);
  const out: string[] = [];
  for (const b of buckets) {
    if (Array.isArray(b)) {
      for (const p of b) if (isRecord(p) && typeof p.source === 'string') out.push(p.source);
    }
  }
  return unique(out);
}

function confidenceFrom(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  if (typeof payload.confidence === 'number') return payload.confidence;
  if (isRecord(payload.person) && typeof payload.person.confidence === 'number') return payload.person.confidence;
  if (isRecord(payload.company) && typeof payload.company.confidence === 'number') return payload.company.confidence;
  return null;
}

const IDENTIFIER_LABEL: Record<string, string> = {
  email: 'Email', domain: 'Domain', phone: 'Phone', linkedin: 'LinkedIn URL',
  ip: 'IP address', cin: 'CIN', title: 'Job title', query: 'Free-form query', other: 'Identifier',
};

/** The subject (the value looked up) for a log. */
function subjectOf(log: ApiLog): string {
  const params = log.request?.parameters;
  if (isRecord(params)) {
    const first = Object.values(params)[0];
    if (typeof first === 'string' && first) return first;
    if (typeof first === 'number') return String(first);
  }
  return log.path;
}

function lookupRules(ex: MatchExplanation): string[] {
  const rules = [ex.endpointKind === 'transform' ? 'Deterministic transform' : 'Identity graph resolver'];
  rules.push(`Keyed on ${IDENTIFIER_LABEL[ex.identifier] ?? 'identifier'}`);
  return rules;
}

/** Hash an entry's content chained to the previous hash — the tamper-evident link. */
function chainHash(prevHash: string, e: Omit<MatchAuditEntry, 'hash' | 'prevHash'>): string {
  const canonical = [prevHash, e.seq, e.timestamp, e.type, e.verdict, e.subject, e.endpointLabel, e.confidence ?? '', e.rules.join(','), e.sources.join(','), e.actor].join('|');
  return sha256Hex(canonical);
}

export interface BuildAuditOptions {
  environment?: 'sandbox' | 'live';
  entitiesById?: Map<string, MergeableEntity>;
}

/**
 * Build the tamper-evident match audit trail (newest first) from real decision
 * records. Deterministic given the same inputs.
 */
export function buildMatchAuditTrail(logs: ApiLog[], merges: EntityMerge[], opts: BuildAuditOptions = {}): MatchAuditEntry[] {
  const byId = opts.entitiesById;

  // 1. Coverage lookups → audit entries.
  const lookupEntries = logs
    .filter((l) => (opts.environment ? l.environment === opts.environment : true))
    .map((log) => {
      const ex = explainMatch(log);
      const payload = payloadOf(log.response);
      const sources = ex.verdict === 'matched' ? (sourcesFrom(payload).length ? sourcesFrom(payload) : ['Zinbit identity graph']) : ex.verdict === 'missed' ? ['No source matched'] : [];
      return {
        raw: log,
        timestamp: new Date(log.timestamp).getTime(),
        type: 'lookup' as MatchAuditType,
        verdict: ex.verdict as MatchAuditVerdict,
        subject: subjectOf(log),
        endpointLabel: ex.label,
        identifier: IDENTIFIER_LABEL[ex.identifier] ?? 'Identifier',
        confidence: confidenceFrom(payload),
        rules: lookupRules(ex),
        sources,
        actor: 'API',
        id: log.id,
      };
    })
    .filter((e) => !Number.isNaN(e.timestamp));

  // 2. Merge / unmerge decisions → audit entries.
  const mergeEntries = merges.flatMap((m) => {
    const survivorName = byId?.get(m.survivingEntityId)?.name ?? m.canonicalZid;
    const base = {
      subject: survivorName,
      endpointLabel: 'Manual entity resolution',
      identifier: 'Zinbit ID',
      confidence: null as number | null,
      sources: ['Operator decision', `${m.mergedEntityIds.length} record(s) reconciled`],
      actor: m.mergedBy,
    };
    const rows = [{
      ...base,
      id: `${m.id}_merge`,
      timestamp: m.mergedAt,
      type: 'merge' as MatchAuditType,
      verdict: 'merged' as MatchAuditVerdict,
      rules: ['Human-in-the-loop review', `Reason: ${m.reason}`],
    }];
    if (m.status === 'reverted' && m.revertedAt) {
      rows.push({
        ...base,
        id: `${m.id}_unmerge`,
        timestamp: m.revertedAt,
        type: 'unmerge' as MatchAuditType,
        verdict: 'reverted' as MatchAuditVerdict,
        rules: ['Human-in-the-loop review', 'Merge reversed'],
        actor: m.revertedBy ?? m.mergedBy,
      });
    }
    return rows;
  });

  // 3. Order chronologically (oldest first) and build the hash chain.
  const ordered = [...lookupEntries, ...mergeEntries].sort((a, b) => a.timestamp - b.timestamp);

  const chained: MatchAuditEntry[] = [];
  let prevHash = GENESIS;
  ordered.forEach((e, i) => {
    const seq = i + 1;
    const partial = {
      seq,
      id: e.id,
      timestamp: e.timestamp,
      isoTime: new Date(e.timestamp).toISOString(),
      type: e.type,
      verdict: e.verdict,
      subject: e.subject,
      endpointLabel: e.endpointLabel,
      identifier: e.identifier,
      confidence: e.confidence,
      rules: e.rules,
      sources: e.sources,
      actor: e.actor,
    };
    const hash = chainHash(prevHash, partial);
    chained.push({ ...partial, prevHash, hash });
    prevHash = hash;
  });

  // Return newest-first for display.
  return chained.reverse();
}

/**
 * Verify a trail's hash chain. `entries` may be in display (newest-first) or
 * chronological order — we sort by seq before checking.
 */
export function verifyAuditIntegrity(entries: MatchAuditEntry[]): AuditIntegrity {
  const chrono = [...entries].sort((a, b) => a.seq - b.seq);
  let prevHash = GENESIS;
  for (const e of chrono) {
    const expected = chainHash(prevHash, {
      seq: e.seq, id: e.id, timestamp: e.timestamp, isoTime: e.isoTime, type: e.type, verdict: e.verdict,
      subject: e.subject, endpointLabel: e.endpointLabel, identifier: e.identifier, confidence: e.confidence,
      rules: e.rules, sources: e.sources, actor: e.actor,
    });
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { valid: false, brokenAt: e.seq, entries: chrono.length };
    }
    prevHash = e.hash;
  }
  return { valid: true, brokenAt: null, entries: chrono.length };
}
