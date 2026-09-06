/**
 * Merge & unmerge controls — types + deterministic seed (single source of truth).
 *
 * The human-in-the-loop layer over entity resolution: suspected-duplicate records
 * (from dedup / multi-source imports) that an operator can MERGE into one
 * canonical entity — or UNMERGE (split) back — with a full audit trail. Each
 * record keeps its own Zinbit ID until a merge elects a surviving canonical id.
 *
 * The seed is curated and deterministic (no Math.random, no wall-clock), so the
 * merge center always opens in the same believable state.
 */

export type MergeSource = 'Salesforce' | 'HubSpot' | 'CSV Import' | 'API' | 'LinkedIn';

export interface MergeableEntity {
  id: string;
  zid: string;
  name: string;
  company: string;
  email: string;
  source: MergeSource;
  /** Suggested-duplicate confidence within the record's group (0–1). */
  confidence: number;
  groupId: string;
}

export interface EntityMerge {
  id: string;
  /** The surviving canonical Zinbit ID after the merge. */
  canonicalZid: string;
  survivingEntityId: string;
  mergedEntityIds: string[];
  reason: string;
  mergedBy: string;
  mergedAt: number;
  status: 'active' | 'reverted';
  revertedAt?: number;
  revertedBy?: string;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** A stable, display-only Zinbit person ID for a seed record. */
function seedZid(email: string): string {
  const h1 = hash(email.toLowerCase());
  const h2 = hash(`zid-salt:${email.toLowerCase()}`);
  return `zid_p_${(h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0')).slice(0, 12)}`;
}

interface SeedRecord {
  name: string;
  company: string;
  email: string;
  source: MergeSource;
  confidence: number;
}
interface SeedGroup {
  groupId: string;
  records: SeedRecord[];
}

/** Curated suspected-duplicate groups — the same person entered across sources. */
const SEED_GROUPS: SeedGroup[] = [
  {
    groupId: 'grp_smith',
    records: [
      { name: 'John Smith', company: 'Stripe', email: 'john.smith@stripe.com', source: 'Salesforce', confidence: 1 },
      { name: 'Jhon Smith', company: 'Stripe', email: 'jhon.smith@stripe.com', source: 'HubSpot', confidence: 0.94 },
      { name: 'J. Smith', company: 'Stripe', email: 'j.smith@stripe.com', source: 'CSV Import', confidence: 0.88 },
    ],
  },
  {
    groupId: 'grp_chen_s',
    records: [
      { name: 'Sarah Chen', company: 'Notion', email: 'sarah.chen@notion.so', source: 'Salesforce', confidence: 1 },
      { name: 'Sara Chen', company: 'Notion', email: 'sara.chen@notion.so', source: 'LinkedIn', confidence: 0.9 },
    ],
  },
  {
    groupId: 'grp_johnson',
    records: [
      { name: 'Robert Johnson', company: 'Datadog', email: 'robert.johnson@datadoghq.com', source: 'API', confidence: 1 },
      { name: 'Bob Johnson', company: 'Datadog', email: 'bob.johnson@datadoghq.com', source: 'HubSpot', confidence: 0.86 },
    ],
  },
  {
    groupId: 'grp_garcia',
    records: [
      { name: 'María García', company: 'Figma', email: 'maria.garcia@figma.com', source: 'Salesforce', confidence: 1 },
      { name: 'Maria Garcia', company: 'Figma', email: 'maria.garcia@figma.com', source: 'CSV Import', confidence: 0.97 },
    ],
  },
  {
    groupId: 'grp_chen_m',
    records: [
      { name: 'Michael Chen', company: 'Vercel', email: 'michael.chen@vercel.com', source: 'Salesforce', confidence: 1 },
      { name: 'Micheal Chen', company: 'Vercel', email: 'micheal.chen@vercel.com', source: 'LinkedIn', confidence: 0.91 },
    ],
  },
];

/** Build the deterministic list of merge-candidate entities. */
export function generateMergeCandidates(): MergeableEntity[] {
  const out: MergeableEntity[] = [];
  for (const group of SEED_GROUPS) {
    group.records.forEach((r, i) => {
      out.push({
        id: `${group.groupId}_${i}`,
        zid: seedZid(r.email),
        name: r.name,
        company: r.company,
        email: r.email,
        source: r.source,
        confidence: r.confidence,
        groupId: group.groupId,
      });
    });
  }
  return out;
}
