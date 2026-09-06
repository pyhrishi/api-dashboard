import { buildMatchAuditTrail, verifyAuditIntegrity, type MatchAuditEntry } from '@/lib/match-audit';
import type { ApiLog } from '@/lib/store';
import type { EntityMerge, MergeableEntity } from '@/lib/merge-seed';

function log(over: Partial<ApiLog>): ApiLog {
  return {
    id: 'l1', environment: 'sandbox', timestamp: '2026-09-01T10:00:00.000Z', method: 'GET',
    path: '/v1/people', status: 200, duration: 40, ip: '::1',
    request: { parameters: { email: 'jane.doe@acme.com' } },
    response: { data: { confidence: 0.92, provenance: [{ source: 'Directory match' }] } },
    ...over,
  };
}

const MERGE: EntityMerge = {
  id: 'mrg_1', canonicalZid: 'zid_p_abc', survivingEntityId: 'e1', mergedEntityIds: ['e2', 'e3'],
  reason: 'confirmed duplicate', mergedBy: 'ops@acme.com', mergedAt: Date.UTC(2026, 8, 1, 12, 0, 0), status: 'active',
};
const ENTITIES = new Map<string, MergeableEntity>([
  ['e1', { id: 'e1', zid: 'zid_p_abc', name: 'John Smith', company: 'Stripe', email: 'john@stripe.com', source: 'Salesforce', confidence: 1, groupId: 'g' }],
]);

describe('match audit trail', () => {
  it('assembles lookups + merges into a newest-first, sequenced trail', () => {
    const logs = [log({ id: 'l1', timestamp: '2026-09-01T10:00:00.000Z' }), log({ id: 'l2', timestamp: '2026-09-01T11:00:00.000Z', path: '/v1/companies', request: { parameters: { domain: 'acme.com' } } })];
    const trail = buildMatchAuditTrail(logs, [MERGE], { entitiesById: ENTITIES });
    expect(trail).toHaveLength(3);
    // newest first
    for (let i = 1; i < trail.length; i++) expect(trail[i - 1].timestamp).toBeGreaterThanOrEqual(trail[i].timestamp);
    // seq is a contiguous 1..N set
    expect(new Set(trail.map((e) => e.seq))).toEqual(new Set([1, 2, 3]));
    // the merge produced a 'merged' entry with the survivor name
    const merged = trail.find((e) => e.type === 'merge')!;
    expect(merged.verdict).toBe('merged');
    expect(merged.subject).toBe('John Smith');
    expect(merged.actor).toBe('ops@acme.com');
  });

  it('is deterministic', () => {
    const logs = [log({})];
    expect(buildMatchAuditTrail(logs, [MERGE], { entitiesById: ENTITIES }))
      .toEqual(buildMatchAuditTrail(logs, [MERGE], { entitiesById: ENTITIES }));
  });

  it('produces a valid hash chain that verifies', () => {
    const trail = buildMatchAuditTrail([log({ id: 'l1' }), log({ id: 'l2', timestamp: '2026-09-01T11:00:00.000Z' })], [MERGE], { entitiesById: ENTITIES });
    const integrity = verifyAuditIntegrity(trail);
    expect(integrity.valid).toBe(true);
    expect(integrity.brokenAt).toBeNull();
    expect(integrity.entries).toBe(trail.length);
  });

  it('detects tampering (a mutated entry breaks the chain)', () => {
    const trail = buildMatchAuditTrail([log({ id: 'l1' }), log({ id: 'l2', timestamp: '2026-09-01T11:00:00.000Z' })], [MERGE], { entitiesById: ENTITIES });
    const tampered: MatchAuditEntry[] = trail.map((e) => (e.seq === 2 ? { ...e, subject: 'HACKED' } : e));
    const integrity = verifyAuditIntegrity(tampered);
    expect(integrity.valid).toBe(false);
    expect(integrity.brokenAt).toBe(2);
  });

  it('emits a reverted entry for an unmerged decision', () => {
    const reverted: EntityMerge = { ...MERGE, status: 'reverted', revertedAt: Date.UTC(2026, 8, 1, 13, 0, 0), revertedBy: 'admin@acme.com' };
    const trail = buildMatchAuditTrail([], [reverted], { entitiesById: ENTITIES });
    expect(trail.filter((e) => e.type === 'unmerge')).toHaveLength(1);
    expect(trail.find((e) => e.type === 'unmerge')!.verdict).toBe('reverted');
    expect(verifyAuditIntegrity(trail).valid).toBe(true);
  });
});
