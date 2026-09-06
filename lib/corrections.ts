/**
 * User-reported corrections (F-046) — the SSOT for the correction feedback loop.
 *
 * A correction is a customer's claim that one field of one enrichment result is
 * wrong, plus the value they believe is right. Corrections are governed, not
 * silent: they land as `pending`, get an AI triage snapshot (see
 * `triageCorrection` in `lib/insight-engine.ts`), and only an accepted correction
 * is overlaid onto future results (via `applyCorrections` in
 * `src/data/enrichments.ts`) — attributed to "Customer Correction" (first-party).
 *
 * This module holds the pure, deterministic pieces shared across the store, the
 * insight engine, the Studio, and the review queue. No `Math.random`, no imports
 * from the view-model or store (so it can be a dependency of both).
 */

export type CorrectionStatus = 'pending' | 'accepted' | 'rejected';

/** The shape of the value being corrected — drives validation + display. */
export type CorrectionFieldKind = 'email' | 'phone' | 'url' | 'name' | 'company' | 'location' | 'title' | 'text';

/** A deterministic triage verdict on how plausible a reported correction is. */
export interface CorrectionTriage {
  /** Plausibility 0..1. */
  score: number;
  verdict: 'likely_valid' | 'needs_review' | 'suspect';
  reasons: string[];
}

export interface Correction {
  id: string;
  /** Stable key for the corrected entity — `${presetId}::${normalizedInput}`. */
  entityKey: string;
  presetId: string;
  presetLabel: string;
  /** The looked-up identifier (email/domain/etc), shown for context. */
  input: string;
  /** The result field label being corrected (matches EnrichmentField.label). */
  field: string;
  fieldKind: CorrectionFieldKind;
  oldValue: string;
  newValue: string;
  reason: string;
  status: CorrectionStatus;
  reportedBy: string;
  reportedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  environment: 'sandbox' | 'live';
  /** Triage snapshot computed at report time. */
  triage: CorrectionTriage;
}

/** What a caller supplies to report a correction (the store fills the rest). */
export interface CorrectionInput {
  presetId: string;
  presetLabel: string;
  input: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  environment: 'sandbox' | 'live';
}

export interface CorrectionSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  /** accepted / (accepted + rejected), 0 when nothing reviewed. */
  acceptRate: number;
  /** Pending corrections whose triage reads likely_valid — the "act now" count. */
  likelyValidPending: number;
}

export const normalizeInput = (raw: string): string => String(raw ?? '').trim().toLowerCase();

/** Stable identity for the corrected record, so overlays and dedupe line up. */
export const correctionEntityKey = (presetId: string, input: string): string =>
  `${presetId}::${normalizeInput(input)}`;

/** Deterministic id from the report time + a per-report sequence (no randomness). */
export const makeCorrectionId = (reportedAt: number, seq: number): string =>
  `crn_${reportedAt.toString(36)}${seq.toString(36).padStart(2, '0')}`;

/** Infer the value shape from a field label so we can validate the new value. */
export function inferFieldKind(label: string): CorrectionFieldKind {
  const l = label.toLowerCase();
  if (l.includes('email')) return 'email';
  if (l.includes('phone') || l.includes('mobile') || l.includes('tel')) return 'phone';
  if (l.includes('linkedin') || l.includes('url') || l.includes('website') || l.includes('domain') || l.includes('profile') || l.includes('link')) return 'url';
  if (l.includes('name')) return 'name';
  if (l.includes('company') || l.includes('employer') || l.includes('organization')) return 'company';
  if (l.includes('location') || l.includes('city') || l.includes('country') || l.includes('region') || l.includes('geo')) return 'location';
  if (l.includes('title') || l.includes('role') || l.includes('seniority') || l.includes('position')) return 'title';
  return 'text';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[\d][\d\s()\-.]{6,}$/;
const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i;

/** Does `value` look well-formed for its field kind? Empty is always invalid. */
export function validateFieldValue(kind: CorrectionFieldKind, value: string): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  switch (kind) {
    case 'email': return EMAIL_RE.test(v);
    case 'phone': return PHONE_RE.test(v);
    case 'url': return URL_RE.test(v);
    default: return v.length >= 2;
  }
}

/** Roll up a correction list into the KPIs the review queue shows. */
export function summarizeCorrections(list: Correction[]): CorrectionSummary {
  let pending = 0, accepted = 0, rejected = 0, likelyValidPending = 0;
  list.forEach((c) => {
    if (c.status === 'pending') {
      pending += 1;
      if (c.triage.verdict === 'likely_valid') likelyValidPending += 1;
    } else if (c.status === 'accepted') accepted += 1;
    else rejected += 1;
  });
  const reviewed = accepted + rejected;
  return {
    total: list.length,
    pending,
    accepted,
    rejected,
    acceptRate: reviewed === 0 ? 0 : accepted / reviewed,
    likelyValidPending,
  };
}

/** The accepted corrections for one entity, newest-first — used to overlay a result. */
export function acceptedCorrectionsFor(list: Correction[], entityKey: string): Correction[] {
  return list
    .filter((c) => c.status === 'accepted' && c.entityKey === entityKey)
    .sort((a, b) => (b.reviewedAt ?? b.reportedAt) - (a.reviewedAt ?? a.reportedAt));
}

/**
 * Deterministic seed so the review queue and the Studio loop are demoable on first
 * load. Triage snapshots are hand-authored to match what `triageCorrection` would
 * produce, keeping this module free of an insight-engine import cycle.
 */
export function generateSeedCorrections(): Correction[] {
  // A fixed clock so ids + ordering are stable across reloads.
  const DAY = 86_400_000;
  const base = Date.UTC(2026, 7, 25, 9, 0, 0); // 2026-08-25
  // Preset ids + field labels match the real view-model so accepted corrections
  // actually overlay in the Studio (person: Phone/Company/Location; company: Headcount/…).
  const seeds: Array<Omit<Correction, 'id' | 'entityKey'> & { seq: number }> = [
    {
      seq: 1,
      presetId: 'person', presetLabel: 'Resolve a person', input: 'jane.doe@acme.com',
      field: 'Phone', fieldKind: 'phone', oldValue: '+1 (276) 842-8021', newValue: '+1 (276) 842-9100',
      reason: 'Direct line changed after the team moved floors — confirmed on a call this week.',
      status: 'accepted', reportedBy: 'dana@customerco.com', reportedAt: base + 0 * DAY, reviewedBy: 'admin@zintlr.com', reviewedAt: base + 1 * DAY, environment: 'sandbox',
      triage: { score: 0.74, verdict: 'likely_valid', reasons: ['New value is well-formed for a phone', 'Same country/area code as the current value', 'Reporter gave a specific, checkable reason'] },
    },
    {
      seq: 2,
      presetId: 'person', presetLabel: 'Resolve a person', input: 'jane.doe@acme.com',
      field: 'Company', fieldKind: 'company', oldValue: 'Acme Technologies · acme.com', newValue: 'Acme Corp · acme.com',
      reason: 'They rebranded from Acme Technologies to Acme Corp in Q2 — see the acme.com footer.',
      status: 'pending', reportedBy: 'dana@customerco.com', reportedAt: base + 2 * DAY, environment: 'sandbox',
      triage: { score: 0.72, verdict: 'likely_valid', reasons: ['New value is well-formed', 'Materially different from the current value', 'Reporter gave a specific, checkable reason'] },
    },
    {
      seq: 3,
      presetId: 'person', presetLabel: 'Resolve a person', input: 'marcus@stripe.com',
      field: 'Location', fieldKind: 'location', oldValue: 'San Francisco, US · America/Los_Angeles', newValue: 'New York, US · America/New_York',
      reason: 'Relocated to the New York office this quarter.',
      status: 'pending', reportedBy: 'crm@growthco.in', reportedAt: base + 3 * DAY, environment: 'live',
      triage: { score: 0.62, verdict: 'needs_review', reasons: ['New value is well-formed', 'Materially different from the current value', 'Location changes are hard to verify automatically'] },
    },
    {
      seq: 4,
      presetId: 'company', presetLabel: 'Enrich a company', input: 'stripe.com',
      field: 'Headcount', fieldKind: 'text', oldValue: '8,000 · Enterprise', newValue: '90000000',
      reason: 'wrong',
      status: 'pending', reportedBy: 'anon@tempmail.io', reportedAt: base + 4 * DAY, environment: 'live',
      triage: { score: 0.24, verdict: 'suspect', reasons: ['Implausible jump from the current value', 'Reason is too vague to verify', 'Reporter domain looks disposable'] },
    },
    {
      seq: 5,
      presetId: 'company', presetLabel: 'Enrich a company', input: 'stripe.com',
      field: 'Industry', fieldKind: 'text', oldValue: 'Financial Services · Payments', newValue: 'Financial Services · Payments',
      reason: 'looks fine actually',
      status: 'rejected', reportedBy: 'qa@testers.dev', reportedAt: base + 5 * DAY, reviewedBy: 'admin@zintlr.com', reviewedAt: base + 5 * DAY + 3600_000, environment: 'sandbox',
      triage: { score: 0.1, verdict: 'suspect', reasons: ['New value is identical to the current value — no change'] },
    },
  ];
  return seeds.map(({ seq, ...rest }) => ({
    ...rest,
    id: makeCorrectionId(rest.reportedAt, seq),
    entityKey: correctionEntityKey(rest.presetId, rest.input),
  }));
}
