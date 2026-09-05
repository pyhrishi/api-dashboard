/**
 * Email domain authentication (SPF / DKIM / DMARC) — deterministic mock.
 *
 * The domain-level complement to mailbox-level deliverability (F-011): given a
 * domain, inspect its email sending-authentication posture — SPF record + policy,
 * DKIM selectors, and DMARC policy/coverage — and score how well it is protected
 * against spoofing. Deterministic per domain (no `Math.random`), so the same
 * domain always returns the same posture across Studio, Explorer, and CLI.
 */

export type AuthStatus = 'pass' | 'partial' | 'fail';
export type DmarcPolicy = 'none' | 'quarantine' | 'reject';
export type AuthGrade = 'Strong' | 'Partial' | 'Weak' | 'None';

export interface DomainAuthCheck {
  key: 'spf' | 'dkim' | 'dmarc';
  label: string;
  status: AuthStatus;
  detail: string;
  record: string;
}

export interface DomainAuthProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface DomainAuthResult {
  domain: string;
  score: number; // 0-100 anti-spoofing posture
  grade: AuthGrade;
  /** True when a third party could plausibly spoof mail from this domain. */
  spoofable: boolean;
  spf: { present: boolean; policy: string; qualifier: AuthStatus; record: string };
  dkim: { present: boolean; selectors: string[]; status: AuthStatus };
  dmarc: { present: boolean; policy: DmarcPolicy; pct: number; rua: boolean; status: AuthStatus; record: string };
  checks: DomainAuthCheck[];
  confidence: number;
  last_verified: string;
  provenance: DomainAuthProvenance[];
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Reference "today" for deterministic freshness (matches the product's demo clock). */
const VERIFY_EPOCH = Date.UTC(2026, 8, 1);
function isoDaysBefore(days: number): string {
  return new Date(VERIFY_EPOCH - days * 86400000).toISOString().slice(0, 10);
}

function normalizeDomain(raw: string): string | null {
  const d = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('@')
    .pop() ?? '';
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) return null;
  return d;
}

const DKIM_SELECTORS = ['google', 's1', 'k1', 'selector1', 'mandrill', 'dkim'];

export function checkDomainAuth(rawDomain: string): DomainAuthResult | null {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;
  const h = hash(domain);

  // ── SPF ──────────────────────────────────────────────────────────────────
  const spfPresent = (h % 100) < 92;
  const spfPolicy = spfPresent ? (['-all', '~all', '?all'] as const)[(h >>> 3) % 3] : 'none';
  const spfQualifier: AuthStatus = !spfPresent ? 'fail' : spfPolicy === '-all' ? 'pass' : 'partial';
  const spfRecord = spfPresent
    ? `v=spf1 include:_spf.${domain} include:sendgrid.net ${spfPolicy}`
    : '(no SPF record found)';

  // ── DKIM ─────────────────────────────────────────────────────────────────
  const dkimPresent = ((h >>> 7) % 100) < 85;
  const selectorCount = dkimPresent ? 1 + ((h >>> 9) % 2) : 0;
  const selectors = DKIM_SELECTORS.slice(0, selectorCount);
  const dkimStatus: AuthStatus = dkimPresent ? 'pass' : 'fail';

  // ── DMARC ────────────────────────────────────────────────────────────────
  const dmarcPresent = ((h >>> 11) % 100) < 72;
  const dmarcPolicy: DmarcPolicy = dmarcPresent ? (['none', 'quarantine', 'reject'] as const)[(h >>> 13) % 3] : 'none';
  const pct = dmarcPresent ? ([100, 100, 50, 25] as const)[(h >>> 15) % 4] : 0;
  const rua = dmarcPresent && ((h >>> 17) % 100) < 62;
  const dmarcStatus: AuthStatus = !dmarcPresent
    ? 'fail'
    : dmarcPolicy === 'reject' && pct === 100
      ? 'pass'
      : 'partial';
  const dmarcRecord = dmarcPresent
    ? `v=DMARC1; p=${dmarcPolicy}; pct=${pct};${rua ? ` rua=mailto:dmarc@${domain};` : ''}`
    : '(no DMARC record found)';

  // ── Score & posture ────────────────────────────────────────────────────────
  const score =
    (spfQualifier === 'pass' ? 35 : spfQualifier === 'partial' ? 20 : 0) +
    (dkimPresent ? 25 : 0) +
    (dmarcPolicy === 'reject' ? 40 : dmarcPolicy === 'quarantine' ? 26 : dmarcPresent ? 12 : 0);
  const grade: AuthGrade = score >= 80 ? 'Strong' : score >= 55 ? 'Partial' : score >= 25 ? 'Weak' : 'None';
  const spoofable = !(dmarcPresent && (dmarcPolicy === 'reject' || dmarcPolicy === 'quarantine'));

  const checks: DomainAuthCheck[] = [
    { key: 'spf', label: 'SPF', status: spfQualifier, detail: spfPresent ? `Policy ${spfPolicy}` : 'No SPF record', record: spfRecord },
    { key: 'dkim', label: 'DKIM', status: dkimStatus, detail: dkimPresent ? `${selectors.length} selector${selectors.length === 1 ? '' : 's'}: ${selectors.join(', ')}` : 'No DKIM key published', record: dkimPresent ? `${selectors[0]}._domainkey.${domain}` : '(no DKIM selector found)' },
    { key: 'dmarc', label: 'DMARC', status: dmarcStatus, detail: dmarcPresent ? `p=${dmarcPolicy}, pct=${pct}${rua ? ', reporting on' : ''}` : 'No DMARC record', record: dmarcRecord },
  ];

  return {
    domain,
    score,
    grade,
    spoofable,
    spf: { present: spfPresent, policy: spfPolicy, qualifier: spfQualifier, record: spfRecord },
    dkim: { present: dkimPresent, selectors, status: dkimStatus },
    dmarc: { present: dmarcPresent, policy: dmarcPolicy, pct, rua, status: dmarcStatus, record: dmarcRecord },
    checks,
    confidence: 0.93,
    last_verified: isoDaysBefore(h % 21),
    provenance: [
      { field: 'spf', source: 'DNS TXT lookup', signal: spfPresent ? `SPF record resolves with ${spfPolicy}` : 'No SPF TXT record at the apex', confidence: 0.95 },
      { field: 'dkim', source: 'DNS selector probe', signal: dkimPresent ? `${selectors.length} DKIM selector(s) publish a key` : 'No DKIM key on common selectors', confidence: 0.9 },
      { field: 'dmarc', source: 'DNS TXT lookup', signal: dmarcPresent ? `_dmarc TXT publishes p=${dmarcPolicy}` : 'No _dmarc record — domain is spoofable', confidence: 0.96 },
    ],
  };
}
