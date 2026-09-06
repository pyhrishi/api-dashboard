/**
 * User-reported corrections (F-046) — the programmatic reporting channel.
 *
 * Developers can report a wrong field value straight from their pipeline
 * (`POST /v1/feedback/correction`) instead of only through the console. This
 * module is the gateway-side registry behind that endpoint: it records reports,
 * runs the same deterministic triage the console shows, and lists them back
 * (`GET /v1/feedback/correction`). Reports land as `pending` — a human still
 * accepts them in the Corrections console before they overlay results — so the
 * loop stays governed, never a silent overwrite.
 *
 * In-memory, per-process (like the other gateway registries). A small
 * deterministic seed makes the endpoint demoable immediately. No `Math.random`.
 */

import { inferFieldKind, type CorrectionTriage } from '@/lib/corrections';
import { triageCorrection } from '@/lib/insight-engine';

export interface GatewayCorrection {
  id: string;
  target: string;
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
  status: 'pending';
  reported_at: string;
  triage: CorrectionTriage;
}

const store: GatewayCorrection[] = [];
let counter = 0;
const SEED_DATE = '2026-08-25';

let seeded = false;
function ensureSeed(): void {
  if (seeded) return;
  seeded = true;
  record({ target: 'jane.doe@acme.com', field: 'Title', old_value: 'Chief Operating Officer', new_value: 'Chief Executive Officer', reason: 'Promoted to CEO in July 2026 — confirmed on the company blog.', reported_at: SEED_DATE });
  record({ target: 'acme.com', field: 'Employees', old_value: '1,200', new_value: '1,450', reason: 'Latest headcount from their careers page.', reported_at: SEED_DATE });
}

interface RecordInput {
  target: string;
  field: string;
  old_value: string;
  new_value: string;
  reason?: string;
  reported_at?: string;
}

/** Record a reported correction, computing its triage. Returns the stored record. */
export function record(input: RecordInput): GatewayCorrection {
  counter += 1;
  const fieldKind = inferFieldKind(input.field);
  const triage = triageCorrection({ fieldKind, oldValue: input.old_value, newValue: input.new_value, reason: input.reason ?? '' });
  const rec: GatewayCorrection = {
    id: `crn_gw_${counter.toString(36).padStart(3, '0')}`,
    target: input.target,
    field: input.field,
    old_value: input.old_value,
    new_value: input.new_value,
    reason: input.reason ?? '',
    status: 'pending',
    reported_at: input.reported_at ?? new Date().toISOString().slice(0, 10),
    triage,
  };
  store.push(rec);
  return rec;
}

export interface CorrectionFeedbackStats {
  total_reports: number;
  pending: number;
  by_verdict: Record<CorrectionTriage['verdict'], number>;
  recent: GatewayCorrection[];
}

/** A snapshot of the correction registry for the list/stats endpoint. */
export function getCorrectionStats(): CorrectionFeedbackStats {
  ensureSeed();
  const by_verdict: Record<CorrectionTriage['verdict'], number> = { likely_valid: 0, needs_review: 0, suspect: 0 };
  store.forEach((r) => { by_verdict[r.triage.verdict] += 1; });
  return {
    total_reports: store.length,
    pending: store.length,
    by_verdict,
    recent: store.slice(-10).reverse(),
  };
}

/** Report a correction through the gateway. Seeds first so demo data is present. */
export function recordCorrection(input: RecordInput): GatewayCorrection {
  ensureSeed();
  return record(input);
}

/** Reset all state — test-only. */
export function __resetCorrectionFeedback(): void {
  store.length = 0;
  counter = 0;
  seeded = false;
}
