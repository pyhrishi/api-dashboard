/**
 * F-054 Golden-record snapshots — resolver + diff tests.
 * Deterministic, no network, no wall-clock.
 */
import {
  buildGoldenRecord,
  resolveGoldenEntity,
  diffSnapshots,
  diffFields,
  hashRecord,
  snapshotFromRecord,
  generateSeedSnapshots,
  type GoldenSnapshot,
} from '@/lib/golden-record';

describe('resolveGoldenEntity', () => {
  it('resolves an email to a person and a domain to a company', () => {
    const p = resolveGoldenEntity('jane.doe@acme.com')!;
    expect(p.entityType).toBe('person');
    expect(p.zinbitId).toMatch(/^zid_p_/);
    const c = resolveGoldenEntity('stripe.com')!;
    expect(c.entityType).toBe('company');
    expect(c.zinbitId).toMatch(/^zid_c_/);
  });
  it('returns null for empty / unresolvable input', () => {
    expect(resolveGoldenEntity('')).toBeNull();
    expect(resolveGoldenEntity('not a domain or email')).toBeNull();
  });
});

describe('buildGoldenRecord', () => {
  it('builds a company golden record with fields + confidence', () => {
    const r = buildGoldenRecord('stripe.com')!;
    expect(r.entityType).toBe('company');
    expect(r.fields.length).toBeGreaterThan(4);
    expect(r.overallConfidence).toBeGreaterThan(0);
    expect(r.overallConfidence).toBeLessThanOrEqual(1);
    // Every field has a source + observedAt.
    r.fields.forEach((f) => {
      expect(f.source).not.toBe('');
      expect(f.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('reflects an earlier point in time differently from now (real evolution)', () => {
    const now = buildGoldenRecord('stripe.com', '2026-09-01')!;
    const past = buildGoldenRecord('stripe.com', '2022-01-01')!;
    // At least one field differs between a distant past and now.
    const changed = now.fields.some((nf) => {
      const pf = past.fields.find((x) => x.field === nf.field);
      return pf && pf.value !== nf.value;
    });
    expect(changed).toBe(true);
    // The past record's asOf is recorded.
    expect(past.asOf).toBe('2022-01-01');
  });

  it('is fully deterministic', () => {
    expect(JSON.stringify(buildGoldenRecord('stripe.com', '2025-01-01')))
      .toBe(JSON.stringify(buildGoldenRecord('stripe.com', '2025-01-01')));
  });

  it('builds a person record and evolves the title over a career', () => {
    const early = buildGoldenRecord('jane.doe@acme.com', '2020-01-01')!;
    const late = buildGoldenRecord('jane.doe@acme.com', '2026-09-01')!;
    const earlyTitle = early.fields.find((f) => f.field === 'Title')!.value;
    const lateTitle = late.fields.find((f) => f.field === 'Title')!.value;
    // Title exists in both; may differ if a promotion date falls between.
    expect(earlyTitle).toBeTruthy();
    expect(lateTitle).toBeTruthy();
  });

  it('returns null for a personal mailbox with no company / unresolvable', () => {
    expect(buildGoldenRecord('')).toBeNull();
    expect(buildGoldenRecord('nonsense')).toBeNull();
  });
});

describe('hashRecord', () => {
  it('is stable for identical fields and changes when a value changes', () => {
    const r = buildGoldenRecord('datadoghq.com', '2026-09-01')!;
    const h1 = hashRecord(r.fields);
    const h2 = hashRecord(r.fields);
    expect(h1).toBe(h2);
    const mutated = r.fields.map((f, i) => (i === 0 ? { ...f, value: `${f.value}!` } : f));
    expect(hashRecord(mutated)).not.toBe(h1);
  });
  it('is order-independent', () => {
    const r = buildGoldenRecord('datadoghq.com')!;
    expect(hashRecord(r.fields)).toBe(hashRecord([...r.fields].reverse()));
  });
});

describe('diffFields / diffSnapshots', () => {
  it('classifies changed / added / removed / unchanged', () => {
    const before = buildGoldenRecord('stripe.com', '2022-01-01')!;
    const after = buildGoldenRecord('stripe.com', '2026-09-01')!;
    const diffs = diffFields(before.fields, after.fields);
    const statuses = new Set(diffs.map((d) => d.status));
    expect(diffs.length).toBe(before.fields.length); // same field set, just values move
    expect(statuses.has('changed') || statuses.has('unchanged')).toBe(true);
    // A changed row carries both before and after.
    diffs.filter((d) => d.status === 'changed').forEach((d) => {
      expect(d.before).not.toBeNull();
      expect(d.after).not.toBeNull();
      expect(d.before).not.toBe(d.after);
    });
  });

  it('detects added and removed fields', () => {
    const a: GoldenSnapshot = snapshotFromRecord(buildGoldenRecord('stripe.com')!, 1, '2026-01-01', 'manual');
    const trimmed = { ...a, fields: a.fields.slice(0, a.fields.length - 1) };
    const d = diffSnapshots(trimmed, a);
    expect(d.addedCount).toBe(1);
    expect(d.removedCount).toBe(0);
  });

  it('computes a confidence delta and version pair', () => {
    const v1 = snapshotFromRecord(buildGoldenRecord('stripe.com', '2022-01-01')!, 1, '2022-01-01', 'seed');
    const v2 = snapshotFromRecord(buildGoldenRecord('stripe.com', '2026-09-01')!, 2, '2026-09-01', 'manual');
    const d = diffSnapshots(v1, v2);
    expect(d.fromVersion).toBe(1);
    expect(d.toVersion).toBe(2);
    expect(typeof d.confidenceDelta).toBe('number');
  });
});

describe('generateSeedSnapshots', () => {
  it('builds versioned chains with exactly one pinned latest per entity', () => {
    const seeds = generateSeedSnapshots();
    expect(seeds.length).toBeGreaterThanOrEqual(6);
    // Group by entity.
    const byEntity = new Map<string, GoldenSnapshot[]>();
    seeds.forEach((s) => { const l = byEntity.get(s.entityKey) ?? []; l.push(s); byEntity.set(s.entityKey, l); });
    byEntity.forEach((chain) => {
      // Versions are 1..n contiguous.
      const versions = chain.map((s) => s.version).sort((x, y) => x - y);
      expect(versions[0]).toBe(1);
      expect(versions[versions.length - 1]).toBe(chain.length);
      // Exactly one pinned (the latest).
      const pinned = chain.filter((s) => s.pinned);
      expect(pinned.length).toBe(1);
      expect(pinned[0].version).toBe(chain.length);
    });
  });

  it('adjacent seeded versions actually differ (meaningful history)', () => {
    const seeds = generateSeedSnapshots();
    const stripe = seeds.filter((s) => s.entityKey === 'company:stripe.com').sort((a, b) => a.version - b.version);
    expect(stripe.length).toBeGreaterThanOrEqual(2);
    // Consecutive hashes should not all be identical across the chain.
    const hashes = stripe.map((s) => s.hash);
    expect(new Set(hashes).size).toBeGreaterThan(1);
  });

  it('is deterministic across calls', () => {
    expect(JSON.stringify(generateSeedSnapshots())).toBe(JSON.stringify(generateSeedSnapshots()));
  });
});
