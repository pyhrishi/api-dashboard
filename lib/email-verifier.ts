/**
 * Email deliverability scoring — deterministic mock (single source of truth).
 *
 * Given an email address, runs the checks a real deliverability engine performs
 * (syntax, MX, SMTP mailbox handshake, catch-all, disposable, role-based, free
 * provider, greylisting) and composes them into a 0-100 inbox-reachability score
 * plus a decisive verdict — with the individual check results and per-signal
 * provenance behind the number. Syntax is checked for real; every other signal
 * is derived deterministically from an FNV-1a hash of the normalized address, so
 * the same email always scores the same across the Studio, Explorer, and CLI —
 * no `Math.random`. Roadmap F-011 (also covers F-049 catch-all, F-051 disposable).
 */

export type DeliverabilityVerdict = 'deliverable' | 'risky' | 'undeliverable' | 'unknown';
export type DeliverabilityCheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface DeliverabilityCheck {
  key: string;
  label: string;
  status: DeliverabilityCheckStatus;
  detail: string;
}

export interface DeliverabilityProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface EmailDeliverability {
  email: string;
  domain: string;
  verdict: DeliverabilityVerdict;
  /** Inbox-reachability score, 0..100. */
  score: number;
  is_valid_syntax: boolean;
  /** Domain publishes mail-exchanger (MX) records. */
  mx_found: boolean;
  /** SMTP handshake accepted for this specific mailbox. */
  smtp_check: boolean;
  /** Domain accepts mail to any address — the mailbox cannot be individually confirmed. */
  is_catch_all: boolean;
  /** Throwaway / temporary-mailbox provider. */
  is_disposable: boolean;
  /** Shared inbox (info@, sales@, support@…) rather than a person. */
  is_role_based: boolean;
  /** Free consumer mailbox (Gmail, Yahoo…) rather than a corporate domain. */
  is_free_provider: boolean;
  /** Server is temporarily deferring — retry recommended before a final verdict. */
  is_greylisted: boolean;
  /** Suggested correction for a likely typo domain, else null. */
  did_you_mean: string | null;
  /** Mail provider operating the domain, e.g. "Google Workspace". */
  provider: string;
  checks: DeliverabilityCheck[];
  /** Confidence in the verdict itself, 0..1 (lower when the mailbox is ambiguous). */
  confidence: number;
  last_verified: string;
  provenance: DeliverabilityProvenance[];
}

/** RFC-5322-lite syntax check — good enough to reject the obviously malformed. */
const SYNTAX_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'zoho.com', 'yandex.com', 'mail.com',
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com',
  'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'sharklasers.com', 'maildrop.cc', 'fakeinbox.com', 'mailnesia.com', 'emailondeck.com',
]);

const ROLE_PREFIXES = new Set([
  'info', 'admin', 'administrator', 'support', 'sales', 'contact', 'help', 'billing',
  'hello', 'team', 'office', 'no-reply', 'noreply', 'donotreply', 'marketing', 'hr',
  'jobs', 'careers', 'webmaster', 'postmaster', 'abuse', 'security', 'privacy', 'legal',
  'accounts', 'enquiries', 'inquiries', 'press', 'media', 'newsletter',
]);

/** Common typo domains → the address the sender almost certainly meant. */
const TYPO_CORRECTIONS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhaoo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outook.com': 'outlook.com', 'iclod.com': 'icloud.com',
};

const CORPORATE_PROVIDERS = ['Google Workspace', 'Microsoft 365', 'Zoho Mail', 'Custom / self-hosted'];

/** FNV-1a — small deterministic string hash (distinct stream from other resolvers). */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** ISO date for deterministic "last verified" freshness (matches the demo clock). */
function verifiedDate(h: number): string {
  const epoch = Date.UTC(2026, 8, 1); // 2026-09-01
  const daysAgo = h % 45;
  return new Date(epoch - daysAgo * 86400000).toISOString().slice(0, 10);
}

function freeProviderName(domain: string): string {
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'Gmail';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'Microsoft Outlook';
  if (['yahoo.com', 'ymail.com'].includes(domain)) return 'Yahoo Mail';
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'Apple iCloud';
  if (['proton.me', 'protonmail.com'].includes(domain)) return 'Proton Mail';
  return 'Consumer webmail';
}

export function verifyEmailDeliverability(rawEmail: string): EmailDeliverability | null {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return null;

  const atParts = email.split('@');
  const localPart = atParts[0] ?? '';
  const domain = atParts[1] ?? '';
  const rootPrefix = localPart.split('+')[0]; // strip Gmail-style +tags before role check
  // Two hash streams: domain-level signals (MX, provider, catch-all, greylist) come
  // from the domain so every mailbox on it agrees; mailbox-level signals (the SMTP
  // RCPT handshake) come from the full address. `h` (full email) also seeds freshness.
  const h = hash(email);
  const hd = hash(domain);

  // ── 1. Syntax ──────────────────────────────────────────────────────────────
  const is_valid_syntax = SYNTAX_RE.test(email);
  if (!is_valid_syntax) {
    const did_you_mean = domain && TYPO_CORRECTIONS[domain] ? `${localPart}@${TYPO_CORRECTIONS[domain]}` : null;
    return {
      email, domain, verdict: 'undeliverable', score: 3,
      is_valid_syntax: false, mx_found: false, smtp_check: false, is_catch_all: false,
      is_disposable: false, is_role_based: false, is_free_provider: false, is_greylisted: false,
      did_you_mean, provider: 'Unknown',
      checks: [{ key: 'syntax', label: 'Syntax', status: 'fail', detail: 'Address is not a valid RFC-5322 email.' }],
      confidence: 0.98, last_verified: verifiedDate(h),
      provenance: [{ field: 'syntax', source: 'Format validation', signal: 'Failed RFC-5322 structural check', confidence: 0.98 }],
    };
  }

  const is_free_provider = FREE_PROVIDERS.has(domain);
  const is_disposable = DISPOSABLE_DOMAINS.has(domain);
  const is_role_based = ROLE_PREFIXES.has(rootPrefix);
  const did_you_mean = TYPO_CORRECTIONS[domain] ? `${localPart}@${TYPO_CORRECTIONS[domain]}` : null;

  // ── 2. Infrastructure — MX + provider (domain-level: same for every mailbox) ──
  // Disposable and free domains always resolve; corporate domains almost always do.
  const mx_found = is_free_provider || is_disposable ? true : ((hd >>> 3) % 100) >= 4;
  let provider: string;
  if (is_disposable) provider = 'Disposable mail service';
  else if (is_free_provider) provider = freeProviderName(domain);
  else if (!mx_found) provider = 'No mail server';
  else provider = CORPORATE_PROVIDERS[(hd >>> 5) % CORPORATE_PROVIDERS.length];

  // ── 3. Domain posture (catch-all, greylist) + mailbox SMTP handshake ─────────
  const is_catch_all = mx_found && !is_free_provider && !is_disposable && ((hd >>> 7) % 100) < 16;
  const is_greylisted = mx_found && !is_disposable && ((hd >>> 9) % 100) < 7;
  // SMTP mailbox handshake (RCPT TO): mailbox-level, so it varies per address.
  // Fails for a small minority of corporate mailboxes (bounced / unknown user).
  const smtp_check = mx_found && !is_catch_all && (is_free_provider || ((h >>> 11) % 100) >= 8);

  // ── 4. Score composition (transparent, additive penalties) ───────────────────
  let score = 100;
  if (!mx_found) score -= 92;
  if (is_disposable) score -= 62;
  if (is_catch_all) score -= 28;
  // A rejected mailbox is a hard bounce — the score must read as clearly undeliverable.
  if (!smtp_check && mx_found && !is_catch_all) score -= 72;
  if (is_role_based) score -= 16;
  if (is_free_provider) score -= 6;
  if (is_greylisted) score -= 10;
  score = clampScore(score);

  // ── 5. Verdict (hard rules first, then the score band) ───────────────────────
  let verdict: DeliverabilityVerdict;
  if (!mx_found) verdict = 'undeliverable';
  else if (is_disposable) verdict = 'undeliverable';
  else if (!smtp_check && !is_catch_all) verdict = 'undeliverable';
  else if (is_catch_all || is_role_based || is_greylisted || score < 80) verdict = 'risky';
  else verdict = 'deliverable';

  // Confidence in the verdict — clear pass/fail is certain; catch-all/greylist is ambiguous.
  let confidence = 0.95;
  if (is_catch_all) confidence = 0.62;
  else if (is_greylisted) confidence = 0.7;
  else if (verdict === 'risky') confidence = 0.8;
  confidence = clamp01(confidence);

  // ── 6. Human-readable check breakdown ────────────────────────────────────────
  const checks: DeliverabilityCheck[] = [
    { key: 'syntax', label: 'Syntax', status: 'pass', detail: 'Well-formed RFC-5322 address.' },
    {
      key: 'mx', label: 'MX records',
      status: mx_found ? 'pass' : 'fail',
      detail: mx_found ? `Domain accepts mail via ${provider}.` : 'No mail-exchanger records — the domain cannot receive email.',
    },
    {
      key: 'smtp', label: 'SMTP mailbox',
      status: !mx_found ? 'fail' : is_catch_all ? 'warn' : smtp_check ? 'pass' : 'fail',
      detail: !mx_found
        ? 'Skipped — no mail server to connect to.'
        : is_catch_all
          ? 'Domain is catch-all; the individual mailbox cannot be confirmed.'
          : smtp_check
            ? 'Mailbox accepted the SMTP handshake.'
            : 'Mailbox rejected the SMTP handshake (unknown user).',
    },
    {
      key: 'catch_all', label: 'Catch-all',
      status: is_catch_all ? 'warn' : 'pass',
      detail: is_catch_all ? 'Accepts any address — deliverability of this specific mailbox is unconfirmed.' : 'Not a catch-all domain.',
    },
    {
      key: 'disposable', label: 'Disposable',
      status: is_disposable ? 'fail' : 'pass',
      detail: is_disposable ? 'Throwaway / temporary-mailbox provider — do not send.' : 'Not a known disposable provider.',
    },
    {
      key: 'role_based', label: 'Role-based',
      status: is_role_based ? 'warn' : 'pass',
      detail: is_role_based ? `Shared inbox ("${rootPrefix}@") rather than an individual.` : 'Individual mailbox, not a shared role address.',
    },
    {
      key: 'free_provider', label: 'Free provider',
      status: is_free_provider ? 'info' : 'pass',
      detail: is_free_provider ? `Consumer mailbox on ${provider}, not a corporate domain.` : 'Corporate / custom domain.',
    },
  ];
  if (is_greylisted) {
    checks.push({ key: 'greylist', label: 'Greylisting', status: 'warn', detail: 'Server is temporarily deferring — retry shortly to confirm.' });
  }

  // ── 7. Provenance ────────────────────────────────────────────────────────────
  const provenance: DeliverabilityProvenance[] = [
    { field: 'mx', source: 'DNS resolver', signal: mx_found ? `MX record set found for ${domain}` : `No MX records for ${domain}`, confidence: 0.97 },
    { field: 'smtp', source: 'SMTP handshake', signal: is_catch_all ? 'Catch-all accepted the probe' : smtp_check ? 'RCPT TO accepted by the mail server' : 'RCPT TO rejected by the mail server', confidence: is_catch_all ? 0.6 : 0.9 },
    { field: 'reputation', source: 'Domain intelligence', signal: is_disposable ? 'Domain on the disposable-provider list' : is_free_provider ? 'Recognized free-mail provider' : 'Corporate domain, no abuse flags', confidence: 0.93 },
  ];
  if (is_role_based) {
    provenance.push({ field: 'role', source: 'Local-part analysis', signal: `Prefix "${rootPrefix}" matches a shared-inbox pattern`, confidence: 0.95 });
  }

  return {
    email, domain, verdict, score,
    is_valid_syntax, mx_found, smtp_check, is_catch_all,
    is_disposable, is_role_based, is_free_provider, is_greylisted,
    did_you_mean, provider, checks, confidence,
    last_verified: verifiedDate(h), provenance,
  };
}
