/**
 * Batch endpoint fan-out — deterministic (single source of truth).
 *
 * Runs one enrichment operation over many inputs in a single request and returns
 * a per-item status plus a summary. Reuses the existing resolvers, so batch
 * results are identical to the equivalent single lookups. Only-charge-on-match:
 * the summary bills for matched items only. Deterministic (no `Math.random`).
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { verifyPhoneForEmail } from '@/lib/phone-verifier';
import { verifyEmailDeliverability } from '@/lib/email-verifier';

export type BatchOperation = 'people' | 'company' | 'phone' | 'email-verify';
export type BatchItemStatus = 'matched' | 'missed';

export interface BatchItem {
  input: string;
  status: BatchItemStatus;
  data: unknown | null;
}

export interface BatchSummary {
  total: number;
  matched: number;
  missed: number;
  match_rate: number; // 0..1
  credits: number; // charged for matched items only
}

export interface BatchResult {
  operation: BatchOperation;
  summary: BatchSummary;
  results: BatchItem[];
}

const OPERATIONS: readonly BatchOperation[] = ['people', 'company', 'phone', 'email-verify'];
/** Credits charged per *matched* item, mirroring each single-lookup endpoint's cost. */
const CREDIT_PER_MATCH: Record<BatchOperation, number> = { people: 1, company: 2, phone: 2, 'email-verify': 1 };
/** Cap items per request so a batch can't be abused as an unbounded scrape. */
export const BATCH_MAX_ITEMS = 50;

export function isBatchOperation(op: string): op is BatchOperation {
  return (OPERATIONS as readonly string[]).includes(op);
}

function runOne(op: BatchOperation, input: string): unknown | null {
  switch (op) {
    case 'people': return resolvePersonFromEmail(input);
    case 'company': return resolveCompanyFromDomain(input);
    case 'phone': return verifyPhoneForEmail(input);
    case 'email-verify': return verifyEmailDeliverability(input);
  }
}

/** Parse a comma/newline-separated input list into a de-duplicated, capped array. */
export function parseBatchInputs(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[\n,]+/)) {
    const v = part.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= BATCH_MAX_ITEMS) break;
  }
  return out;
}

export function runBatch(operation: string, rawInputs: string): BatchResult | null {
  if (!isBatchOperation(operation)) return null;
  const inputs = parseBatchInputs(rawInputs);
  if (inputs.length === 0) return null;

  const results: BatchItem[] = inputs.map((input) => {
    const data = runOne(operation, input);
    return { input, status: data ? 'matched' : 'missed', data: data ?? null };
  });

  const matched = results.filter((r) => r.status === 'matched').length;
  return {
    operation,
    summary: {
      total: inputs.length,
      matched,
      missed: inputs.length - matched,
      match_rate: Math.round((matched / inputs.length) * 100) / 100,
      credits: matched * CREDIT_PER_MATCH[operation],
    },
    results,
  };
}
