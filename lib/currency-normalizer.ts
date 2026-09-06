/**
 * Currency normalization (F-056) — the SSOT for turning messy money into one canonical value.
 *
 * Financial fields arrive from every source in every shape: "$1.2M", "€1.200.000,50",
 * "₹1,200 crore", "1,200,000 USD", "JPY 3,000,000", "(1,500)". All of that quietly
 * breaks aggregation and comparison. This module parses any of it into a canonical
 * value — the ISO 4217 currency, the numeric amount, and the amount converted to a
 * target reporting currency (USD by default) at a frozen reference FX rate — plus the
 * ambiguities it had to resolve, so a warehouse can normalize revenue, funding, and
 * deal sizes to one currency.
 *
 * Pure and deterministic — same input always yields the same result. No `Math.random`,
 * no network, and a frozen FX table (reference date 2026-09-01) so conversions never
 * drift. Formatting is done by hand (not `Intl`) to stay identical across environments.
 */

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'INR' | 'CAD' | 'AUD' | 'CHF' | 'SGD'
  | 'HKD' | 'KRW' | 'BRL' | 'MXN' | 'ZAR' | 'SEK' | 'NOK' | 'DKK' | 'AED' | 'RUB'
  | 'NZD' | 'PLN' | 'TRY' | 'THB' | 'IDR' | 'SAR' | 'ILS';

/** Frozen reference FX — units of USD per 1 unit of the currency (as of 2026-09-01). */
const FX_TO_USD: Record<CurrencyCode, number> = {
  USD: 1, EUR: 1.09, GBP: 1.27, JPY: 0.0067, CNY: 0.14, INR: 0.012, CAD: 0.73,
  AUD: 0.66, CHF: 1.13, SGD: 0.74, HKD: 0.128, KRW: 0.00074, BRL: 0.185, MXN: 0.055,
  ZAR: 0.054, SEK: 0.095, NOK: 0.093, DKK: 0.146, AED: 0.272, RUB: 0.011, NZD: 0.61,
  PLN: 0.25, TRY: 0.030, THB: 0.028, IDR: 0.000063, SAR: 0.267, ILS: 0.27,
};

const FX_REFERENCE_DATE = '2026-09-01';

/** Currencies conventionally written without minor units. */
const ZERO_DECIMAL = new Set<CurrencyCode>(['JPY', 'KRW', 'IDR']);

/** Display symbol per currency. */
const SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', CAD: 'CA$', AUD: 'A$',
  CHF: 'CHF', SGD: 'S$', HKD: 'HK$', KRW: '₩', BRL: 'R$', MXN: 'MX$', ZAR: 'R',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', AED: 'AED', RUB: '₽', NZD: 'NZ$', PLN: 'zł',
  TRY: '₺', THB: '฿', IDR: 'Rp', SAR: 'SAR', ILS: '₪',
};

// Multi-character prefixes checked before the bare '$' so "R$"/"S$"/"HK$" win.
const PREFIX_SYMBOLS: { token: string; code: CurrencyCode }[] = [
  { token: 'us$', code: 'USD' }, { token: 'r$', code: 'BRL' }, { token: 'hk$', code: 'HKD' },
  { token: 'a$', code: 'AUD' }, { token: 'au$', code: 'AUD' }, { token: 'c$', code: 'CAD' },
  { token: 'ca$', code: 'CAD' }, { token: 's$', code: 'SGD' }, { token: 'sg$', code: 'SGD' },
  { token: 'nz$', code: 'NZD' }, { token: 'mx$', code: 'MXN' },
];

// Single symbols. Ambiguous ones carry alternatives.
const SINGLE_SYMBOLS: { token: string; code: CurrencyCode; ambiguousWith?: CurrencyCode[] }[] = [
  { token: '€', code: 'EUR' }, { token: '£', code: 'GBP' }, { token: '₹', code: 'INR' },
  { token: '₩', code: 'KRW' }, { token: '₽', code: 'RUB' }, { token: '₺', code: 'TRY' },
  { token: '฿', code: 'THB' }, { token: '₪', code: 'ILS' }, { token: 'zł', code: 'PLN' },
  { token: '¥', code: 'JPY', ambiguousWith: ['CNY'] },
  { token: '$', code: 'USD', ambiguousWith: ['CAD', 'AUD', 'SGD', 'HKD', 'MXN', 'NZD'] },
  { token: 'kr', code: 'SEK', ambiguousWith: ['NOK', 'DKK'] },
];

const KNOWN_CODES = new Set<string>(Object.keys(FX_TO_USD));

// Scale words → multiplier. Longer tokens first so "crore" beats "cr".
const SCALES: { token: string; factor: number; label: string }[] = [
  { token: 'trillion', factor: 1e12, label: 'trillion' },
  { token: 'billion', factor: 1e9, label: 'billion' },
  { token: 'million', factor: 1e6, label: 'million' },
  { token: 'thousand', factor: 1e3, label: 'thousand' },
  { token: 'crore', factor: 1e7, label: 'crore' },
  { token: 'lakh', factor: 1e5, label: 'lakh' },
  { token: 'lac', factor: 1e5, label: 'lakh' },
  { token: 'cr', factor: 1e7, label: 'crore' },
  { token: 'bn', factor: 1e9, label: 'billion' },
  { token: 'mn', factor: 1e6, label: 'million' },
  { token: 'mm', factor: 1e6, label: 'million' },
  { token: 'k', factor: 1e3, label: 'thousand' },
  { token: 'm', factor: 1e6, label: 'million' },
  { token: 'b', factor: 1e9, label: 'billion' },
  { token: 't', factor: 1e12, label: 'trillion' },
];

export interface NormalizedCurrency {
  input: string;
  /** Resolved ISO 4217 currency of the input. */
  currency: CurrencyCode | string;
  symbol: string;
  /** The parsed amount in the input's own currency. */
  amount: number;
  /** Scale word applied, if any ("million", "crore", …). */
  scaleApplied: string | null;
  /** Target reporting currency. */
  target: CurrencyCode;
  /** The amount converted into the target currency, or null when no FX rate exists. */
  targetAmount: number | null;
  /** FX rate used: 1 unit of `currency` = `rate` units of `target`. */
  rate: number | null;
  /** Frozen reference date for the FX rate. */
  rateDate: string;
  /** Human display of the canonical amount in its own currency. */
  formatted: string;
  /** Human display of the converted amount. */
  formattedTarget: string;
  /** 0..1 — how confident the parse is (explicit code > symbol > defaulted). */
  confidence: number;
  /** True when the currency had to be guessed from an ambiguous symbol. */
  ambiguous: boolean;
  /** Other currencies the symbol could have meant. */
  alternatives: CurrencyCode[];
  /** Human notes on every assumption made. */
  notes: string[];
}

// ── Number parsing ───────────────────────────────────────────────────────────

/** Parse a numeric substring with locale-aware separators into a number. */
function parseAmount(raw: string): { value: number; note: string | null } {
  let s = raw.replace(/\s/g, '').replace(/[’'`]/g, ''); // spaces + Swiss apostrophe = grouping
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); } // accounting parens
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return { value: NaN, note: null };

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let note: string | null = null;
  let cleaned: string;

  if (hasDot && hasComma) {
    // The separator that appears last is the decimal; the other is grouping.
    const decSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const grpSep = decSep === '.' ? ',' : '.';
    cleaned = s.split(grpSep).join('').replace(decSep, '.');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      cleaned = parts.join(''); // multiple same separators ⇒ grouping (incl. Indian 12,00,000)
    } else {
      const dec = parts[1] ?? '';
      if (dec.length === 3) {
        cleaned = parts.join(''); // e.g. "1,200"/"1.200" ⇒ thousands grouping
        note = `Assumed '${sep}' is thousands grouping (ambiguous — could be a decimal).`;
      } else {
        cleaned = `${parts[0]}.${dec}`; // 1–2 (or >3) trailing digits ⇒ decimal
      }
    }
  } else {
    cleaned = s;
  }

  const value = Number(cleaned);
  if (!isFinite(value)) return { value: NaN, note };
  return { value: negative ? -value : value, note };
}

// ── Formatting (deterministic, no Intl) ──────────────────────────────────────

function groupInt(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatMoney(amount: number, code: CurrencyCode | string): string {
  const decimals = ZERO_DECIMAL.has(code as CurrencyCode) ? 0 : 2;
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = groupInt(intPart) + (decPart ? `.${decPart}` : '');
  const sym = SYMBOLS[code as CurrencyCode];
  if (sym && sym.length <= 2 && !/[A-Z]/.test(sym)) return `${sign}${sym}${grouped}`;
  return `${sign}${grouped} ${code}`;
}

// ── Currency detection ───────────────────────────────────────────────────────

function detectCurrency(raw: string): { code: CurrencyCode | string; confidence: number; ambiguous: boolean; alternatives: CurrencyCode[]; note: string | null } {
  const lower = raw.toLowerCase();

  // 1. Explicit ISO code (highest confidence).
  const codeMatch = raw.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (codeMatch && KNOWN_CODES.has(codeMatch[1])) {
    return { code: codeMatch[1] as CurrencyCode, confidence: 0.98, ambiguous: false, alternatives: [], note: null };
  }
  if (codeMatch && /^[A-Z]{3}$/.test(codeMatch[1]) && codeMatch[1] !== 'USD') {
    // A 3-letter token that isn't a currency we price — keep it, flag no FX.
    // (Only treat as a code when it isn't a stray scale word like 'MMM'.)
  }

  // 2. Multi-char symbol prefix.
  for (let i = 0; i < PREFIX_SYMBOLS.length; i++) {
    if (lower.includes(PREFIX_SYMBOLS[i].token)) {
      return { code: PREFIX_SYMBOLS[i].code, confidence: 0.92, ambiguous: false, alternatives: [], note: null };
    }
  }

  // 3. Single symbol (some ambiguous).
  for (let i = 0; i < SINGLE_SYMBOLS.length; i++) {
    const s = SINGLE_SYMBOLS[i];
    if (raw.includes(s.token) || lower.includes(s.token)) {
      const alts = s.ambiguousWith ?? [];
      return {
        code: s.code,
        confidence: alts.length ? 0.82 : 0.9,
        ambiguous: alts.length > 0,
        alternatives: alts,
        note: alts.length ? `'${s.token}' is ambiguous — assumed ${s.code} (could be ${alts.join(', ')}).` : null,
      };
    }
  }

  // 4. Default: USD, low confidence.
  return { code: 'USD', confidence: 0.5, ambiguous: true, alternatives: [], note: 'No currency symbol or code found — defaulted to USD.' };
}

/** Find and strip a scale word; returns the factor + the string with it removed. */
function detectScale(raw: string): { factor: number; label: string | null; stripped: string } {
  const lower = ` ${raw.toLowerCase()} `;
  for (let i = 0; i < SCALES.length; i++) {
    const { token, factor, label } = SCALES[i];
    // A scale token attached to a digit ("1.2m", "50k") or as a standalone word ("1.2 million").
    const attached = new RegExp(`(\\d)\\s*${token}(?![a-z])`, 'i');
    const word = new RegExp(`\\b${token}\\b`, 'i');
    if (attached.test(raw) || word.test(lower)) {
      const stripped = raw.replace(new RegExp(`${token}(?![a-z])`, 'ig'), ' ');
      return { factor, label, stripped };
    }
  }
  return { factor: 1, label: null, stripped: raw };
}

/**
 * Normalize any messy monetary string into a canonical currency value, converted
 * to `target` (USD by default). Returns null only for empty input; an unparseable
 * amount yields a result with NaN guarded to a note.
 */
export function normalizeCurrency(input: string, target: CurrencyCode = 'USD'): NormalizedCurrency | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const notes: string[] = [];
  const cur = detectCurrency(raw);
  if (cur.note) notes.push(cur.note);

  // Remove ISO codes + symbols so only the number (and scale) remains.
  let rest = raw.toUpperCase().replace(/\b[A-Z]{3}\b/g, ' ');
  [...PREFIX_SYMBOLS.map((p) => p.token), ...SINGLE_SYMBOLS.map((s) => s.token)]
    .forEach((t) => { rest = rest.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' '); });

  const scale = detectScale(rest);
  if (scale.label) notes.push(`Scale word applied: ${scale.label} (×${scale.factor.toLocaleString('en-US')}).`);

  const numMatch = scale.stripped.match(/-?\(?[\d.,'’ ]*\d[\d.,'’ ]*\)?/);
  if (!numMatch) {
    notes.push('No numeric amount found.');
    return {
      input: raw, currency: cur.code, symbol: SYMBOLS[cur.code as CurrencyCode] ?? '',
      amount: NaN, scaleApplied: scale.label, target, targetAmount: null, rate: null,
      rateDate: FX_REFERENCE_DATE, formatted: '—', formattedTarget: '—',
      confidence: 0, ambiguous: cur.ambiguous, alternatives: cur.alternatives, notes,
    };
  }

  const parsed = parseAmount(numMatch[0]);
  if (parsed.note) notes.push(parsed.note);
  const amount = isFinite(parsed.value) ? parsed.value * scale.factor : NaN;

  // Convert to target.
  const fromRate = FX_TO_USD[cur.code as CurrencyCode];
  const toRate = FX_TO_USD[target];
  let targetAmount: number | null = null;
  let rate: number | null = null;
  if (fromRate !== undefined && toRate !== undefined && isFinite(amount)) {
    rate = fromRate / toRate;
    targetAmount = Math.round(amount * rate * 100) / 100;
  } else if (fromRate === undefined) {
    notes.push(`No reference FX rate for ${cur.code} — amount kept, not converted.`);
  }

  const confidence = isFinite(amount) ? cur.confidence : 0;

  return {
    input: raw,
    currency: cur.code,
    symbol: SYMBOLS[cur.code as CurrencyCode] ?? '',
    amount: isFinite(amount) ? Math.round(amount * 100) / 100 : NaN,
    scaleApplied: scale.label,
    target,
    targetAmount,
    rate: rate !== null ? Math.round(rate * 1e6) / 1e6 : null,
    rateDate: FX_REFERENCE_DATE,
    formatted: isFinite(amount) ? formatMoney(amount, cur.code) : '—',
    formattedTarget: targetAmount !== null ? formatMoney(targetAmount, target) : '—',
    confidence,
    ambiguous: cur.ambiguous,
    alternatives: cur.alternatives,
    notes,
  };
}

/** The frozen FX table + reference date, for display/coherence in the UI. */
export function getFxReference(): { date: string; rates: Record<string, number> } {
  return { date: FX_REFERENCE_DATE, rates: { ...FX_TO_USD } };
}

/** All supported target currencies. */
export function supportedCurrencies(): CurrencyCode[] {
  return Object.keys(FX_TO_USD) as CurrencyCode[];
}
