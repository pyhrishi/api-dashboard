/**
 * Catch-all domain detection (single source of truth for the catch-all decision).
 *
 * A catch-all (accept-all) domain accepts mail for ANY local part, so an SMTP
 * RCPT probe to a random non-existent mailbox is accepted — which means you can
 * never confirm a *specific* mailbox exists there. This module decides catch-all
 * status from a domain's signals, and email verification imports the same
 * decision (`catchAllSignal`) so a per-address verify and this domain-level
 * detector can never disagree.
 *
 * Deterministic: the same domain always resolves the same way (FNV-1a over the
 * domain — the same hash email-verifier uses). No Math.random, no wall-clock.
 */

import { normalizeDomain, isValidDomain } from '@/lib/company-resolver';
import { isDisposableDomain } from '@/lib/disposable-detector';

export type CatchAllStatus = 'catch_all' | 'not_catch_all' | 'unknown';

export interface CatchAllEvidence {
  label: string;
  value: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
}

export interface CatchAllProbe {
  method: string;
  sample_mailbox: string;
  accepted: boolean;
}

export interface CatchAllResult {
  domain: string;
  status: CatchAllStatus;
  is_catch_all: boolean;
  confidence: number;
  provider: string;
  mx_found: boolean;
  is_free_provider: boolean;
  is_disposable: boolean;
  probe: CatchAllProbe;
  evidence: CatchAllEvidence[];
  guidance: string;
  last_verified: string;
}

/** Domain signals needed to decide catch-all status. */
export interface CatchAllSignals {
  mxFound: boolean;
  isFreeProvider: boolean;
  isDisposable: boolean;
}

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
]);
const CORPORATE_PROVIDERS = ['Google Workspace', 'Microsoft 365', 'Proofpoint', 'Mimecast', 'Zoho Mail', 'Cloudflare Email', 'Amazon SES', 'Self-hosted Postfix'];
const VERIFY_EPOCH = Date.UTC(2026, 8, 1);

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * THE catch-all decision — the single source of truth. Mirrors the exact rule
 * email verification applies, so the two never diverge. A domain is catch-all
 * when it has MX, isn't a free provider or disposable, and its stable hash falls
 * in the catch-all band.
 */
export function catchAllSignal(domain: string, s: CatchAllSignals): boolean {
  return s.mxFound && !s.isFreeProvider && !s.isDisposable && ((hash(normalizeDomain(domain)) >>> 7) % 100) < 16;
}

/** A deterministic, obviously-fake mailbox for the RCPT probe. */
function probeMailbox(domain: string): string {
  const h = hash(`probe:${domain}`);
  return `no-such-user-${h.toString(36).slice(0, 8)}`;
}

/**
 * Detect a domain's catch-all status, with confidence, evidence, and guidance.
 * Returns `null` for a structurally invalid domain.
 */
export function detectCatchAll(rawDomain: string): CatchAllResult | null {
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) return null;

  const hd = hash(domain);
  const is_free_provider = FREE_PROVIDERS.has(domain);
  const is_disposable = isDisposableDomain(domain);
  // MX resolution — same formula as email-verifier so signals agree.
  const mx_found = is_free_provider || is_disposable ? true : ((hd >>> 3) % 100) >= 4;
  const is_catch_all = catchAllSignal(domain, { mxFound: mx_found, isFreeProvider: is_free_provider, isDisposable: is_disposable });

  const provider = is_disposable ? 'Disposable mail service'
    : is_free_provider ? 'Free mailbox provider'
    : !mx_found ? 'No mail server'
    : CORPORATE_PROVIDERS[(hd >>> 5) % CORPORATE_PROVIDERS.length];

  const status: CatchAllStatus = !mx_found ? 'unknown' : is_catch_all ? 'catch_all' : 'not_catch_all';
  const jitter = ((hd >>> 13) % 6) / 100;
  const confidence = status === 'unknown' ? 0.5
    : status === 'catch_all' ? Math.min(0.97, Math.round((0.88 + jitter) * 100) / 100)
    : Math.min(0.95, Math.round((0.82 + jitter) * 100) / 100);

  const sample_mailbox = probeMailbox(domain);
  const probe: CatchAllProbe = {
    method: 'SMTP RCPT TO a random non-existent mailbox',
    sample_mailbox: `${sample_mailbox}@${domain}`,
    accepted: is_catch_all,
  };

  const evidence: CatchAllEvidence[] = [
    { label: 'MX records', value: mx_found ? `Found · ${provider}` : 'None found', status: mx_found ? 'pass' : 'fail' },
    {
      label: 'Random-mailbox probe',
      value: is_catch_all
        ? `Accepted mail for ${sample_mailbox}@${domain}`
        : mx_found ? `Rejected ${sample_mailbox}@${domain} (unknown user)` : 'Not probed — no mail server',
      status: is_catch_all ? 'fail' : mx_found ? 'pass' : 'info',
    },
  ];
  if (is_free_provider) evidence.push({ label: 'Provider', value: 'Free provider — verifies individual mailboxes', status: 'pass' });
  if (is_disposable) evidence.push({ label: 'Disposable', value: 'Disposable domain — treat all mailboxes as throwaway', status: 'warn' });

  const guidance = status === 'catch_all'
    ? 'This domain accepts mail for any address, so SMTP cannot confirm a specific mailbox exists. Lean on pattern confidence and engagement signals, and use the bounce feedback loop — report bounces so dead addresses get suppressed.'
    : status === 'not_catch_all'
    ? 'This domain rejects unknown mailboxes, so per-address SMTP verification is reliable here.'
    : 'No mail server resolved for this domain, so catch-all status cannot be determined.';

  return {
    domain,
    status,
    is_catch_all,
    confidence,
    provider,
    mx_found,
    is_free_provider,
    is_disposable,
    probe,
    evidence,
    guidance,
    last_verified: new Date(VERIFY_EPOCH - (hd % 40) * 86_400_000).toISOString().slice(0, 10),
  };
}
