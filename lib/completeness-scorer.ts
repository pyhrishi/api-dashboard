/**
 * Completeness scoring (F-048) — rate how filled-out a returned record is.
 *
 * A resolved record can come back with every field populated or riddled with
 * gaps. Completeness scoring measures, deterministically, what share of the
 * record's expected attributes actually carry a real value (not a "—" / "N/A"
 * placeholder), so a user knows at a glance how much of the record they got.
 * Pure function of the view-model's fields — no randomness, no network.
 */

export type CompletenessTier = 'complete' | 'partial' | 'sparse';

export interface CompletenessScore {
  /** 0..100 — share of expected fields that are populated. */
  score: number;
  populated: number;
  total: number;
  /** Labels of the fields that came back empty. */
  missing: string[];
  tier: CompletenessTier;
}

const PLACEHOLDER_TOKENS = new Set([
  '', 'na', 'null', 'undefined', 'unknown', 'none', 'notavailable', 'notprovided', 'nil',
]);

/** True when a field value carries real data rather than a placeholder like "—" or "N/A". */
export function isFieldPopulated(value: string): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  // Strip separators and dashes; a value that is only punctuation ("—", "— · —") is empty.
  const stripped = v.replace(/[·|/,.\s—–-]+/g, '');
  if (!stripped) return false;
  return !PLACEHOLDER_TOKENS.has(stripped);
}

function tierOf(score: number): CompletenessTier {
  if (score >= 80) return 'complete';
  if (score >= 50) return 'partial';
  return 'sparse';
}

/**
 * Score completeness over a record's display fields. Returns null when there are
 * no fields to rate (e.g. structured-only results like social or deliverability),
 * so the caller can simply omit the chip.
 */
export function scoreCompleteness(fields: { label: string; value: string }[]): CompletenessScore | null {
  const total = fields.length;
  if (total === 0) return null;

  const missing: string[] = [];
  let populated = 0;
  for (const f of fields) {
    if (isFieldPopulated(f.value)) populated += 1;
    else missing.push(f.label);
  }

  const score = Math.round((populated / total) * 100);
  return { score, populated, total, missing, tier: tierOf(score) };
}
