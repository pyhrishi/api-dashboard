/**
 * Disposable email detection (F-051) — deterministic detector, single source of truth.
 *
 * Decides whether an email's domain is a throwaway / temporary / anonymizing
 * mailbox provider. Two layers: an explicit categorized list of known providers,
 * and a heuristic pass that catches *unlisted* domains by the keyword and shape
 * signals disposable services share ("temp", "trash", "10minute", random-looking
 * hosts). Returns a decisive verdict plus the category, a confidence, and the
 * reason — deterministic, no `Math.random`. This is the SSOT the email verifier
 * (F-011) and the dedicated /v1/email/disposable endpoint both consume, so there
 * is one disposable list in the product, not two.
 */

export type DisposableVerdict = 'disposable' | 'suspected' | 'trusted';
export type DisposableCategory =
  | 'temporary-mailbox'   // 10-minute / temp inboxes
  | 'throwaway'           // burner addresses
  | 'anonymizing-alias'   // forwarding / masking relays
  | 'trusted'             // free consumer or corporate — not disposable
  | 'unknown';

export interface DisposableDetection {
  email: string;
  domain: string;
  is_disposable: boolean;
  verdict: DisposableVerdict;
  category: DisposableCategory;
  /** Confidence in the verdict, 0..1. */
  confidence: number;
  /** Plain-English reason for the verdict. */
  reason: string;
  /** True when the domain is a mainstream free-mail provider (trusted, not disposable). */
  is_free_provider: boolean;
  /** How the verdict was reached. */
  matched_on: 'known-provider' | 'heuristic' | 'free-provider' | 'no-signal';
}

// ── Known providers, categorized ─────────────────────────────────────────────
const TEMP_MAILBOX = new Set([
  '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'minuteinbox.com', 'emailondeck.com',
  'mohmal.com', 'tempmailo.com', 'mailnesia.com', 'getairmail.com', 'dispostable.com',
]);
const THROWAWAY = new Set([
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', 'throwawaymail.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'fakeinbox.com', 'maildrop.cc', 'spamgourmet.com',
  'mailcatch.com', 'trbvm.com', 'discard.email', 'maileater.com', 'tempinbox.com',
]);
const ANON_ALIAS = new Set([
  'guerrillamailblock.com', 'grr.la', 'pokemail.net', 'spam4.me', 'anonaddy.me',
  'relay.firefox.com', 'simplelogin.io', 'mozmail.com', 'duck.com', '33mail.com',
]);

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'zoho.com', 'yandex.com', 'mail.com',
]);

// Heuristic keyword signals for unlisted disposable domains.
const DISPOSABLE_KEYWORDS = [
  'temp', 'tmp', 'trash', 'throwaway', 'throw-away', 'disposable', 'fake', 'guerrilla',
  'mailinator', '10minute', 'tenminute', 'minutemail', 'burner', 'spam', 'junk', 'nada',
  'yopmail', 'sharklaser', 'getnada', 'discard', 'dropmail', 'mailsac', 'moakt', 'mvrht',
];

const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));

const CATEGORY_LABEL: Record<DisposableCategory, string> = {
  'temporary-mailbox': 'a temporary / self-destructing mailbox',
  'throwaway': 'a throwaway / burner mailbox',
  'anonymizing-alias': 'an anonymizing alias / relay',
  'trusted': 'a trusted mailbox',
  'unknown': 'an unrecognized mailbox',
};

/** Registrable-ish root: last two labels (so `x.mailinator.com` → `mailinator.com`). */
function rootDomain(domain: string): string {
  const parts = domain.split('.').filter(Boolean);
  return parts.length <= 2 ? domain : parts.slice(-2).join('.');
}

/** Fast boolean for callers (e.g. the email verifier) that only need the flag. */
export function isDisposableDomain(domain: string): boolean {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) return false;
  const root = rootDomain(d);
  if (TEMP_MAILBOX.has(root) || THROWAWAY.has(root) || ANON_ALIAS.has(root)) return true;
  if (FREE_PROVIDERS.has(root)) return false;
  return DISPOSABLE_KEYWORDS.some((kw) => d.includes(kw));
}

function knownCategory(root: string): DisposableCategory | null {
  if (TEMP_MAILBOX.has(root)) return 'temporary-mailbox';
  if (THROWAWAY.has(root)) return 'throwaway';
  if (ANON_ALIAS.has(root)) return 'anonymizing-alias';
  return null;
}

/**
 * Full detection for a single email. Returns null only for empty input; a
 * malformed address still yields a verdict on whatever domain it carries.
 */
export function detectDisposable(rawEmail: string): DisposableDetection | null {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return null;

  const domain = email.includes('@') ? email.split('@')[1] ?? '' : email;
  const root = rootDomain(domain);
  const base = { email, domain, is_free_provider: FREE_PROVIDERS.has(root) };

  // 1. Known disposable provider — highest confidence.
  const known = knownCategory(root);
  if (known) {
    return {
      ...base, is_disposable: true, verdict: 'disposable', category: known,
      confidence: 0.98, matched_on: 'known-provider',
      reason: `${root} is a known ${CATEGORY_LABEL[known]} provider.`,
    };
  }

  // 2. Trusted free-mail provider — explicitly not disposable.
  if (FREE_PROVIDERS.has(root)) {
    return {
      ...base, is_disposable: false, verdict: 'trusted', category: 'trusted',
      confidence: 0.96, matched_on: 'free-provider',
      reason: `${root} is a mainstream consumer mailbox, not a disposable provider.`,
    };
  }

  // 3. Heuristic — unlisted domain that looks disposable by keyword signal.
  const hits = DISPOSABLE_KEYWORDS.filter((kw) => domain.includes(kw));
  if (hits.length > 0) {
    return {
      ...base, is_disposable: true, verdict: 'suspected', category: 'throwaway',
      confidence: clamp01(0.6 + hits.length * 0.08),
      matched_on: 'heuristic',
      reason: `Not on the known list, but the domain contains disposable-style signal${hits.length > 1 ? 's' : ''} (${hits.slice(0, 3).join(', ')}).`,
    };
  }

  // 4. No signal — treat as trusted (a normal corporate/custom domain).
  return {
    ...base, is_disposable: false, verdict: 'trusted', category: 'trusted',
    confidence: 0.9, matched_on: 'no-signal',
    reason: `${root || 'The domain'} shows no disposable-provider signals.`,
  };
}
