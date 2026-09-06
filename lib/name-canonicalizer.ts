/**
 * Name canonicalization (F-030) — deterministic normalizer, single source of truth.
 *
 * Turns any spelling, casing, ordering, or accenting of a personal name into one
 * canonical form plus its parsed components (prefix / first / middle / last /
 * suffix), an ASCII-folded form, and a log of exactly what changed. Handles
 * nickname expansion (Bob → Robert), common typos (Jhon → John), "Last, First"
 * reordering, all-caps, diacritics (José → Jose), and surname casing (McDonald,
 * O'Brien, van der Berg). Pure and deterministic — no `Math.random`. This is the
 * SSOT that fuzzy matching (F-024) and entity de-dup consume, so a name is
 * normalized identically everywhere.
 */

export interface NameComponents {
  prefix: string | null;
  first: string;
  middle: string | null;
  last: string;
  suffix: string | null;
}

export interface NameCanonicalization {
  input: string;
  /** Canonical "First [Middle] Last" (nickname-expanded, correctly cased). */
  canonical: string;
  /** Diacritics folded to ASCII (e.g. "Jose Martinez"). */
  ascii: string;
  /** Full form with prefix + suffix, e.g. "Dr. Robert McDonald Jr." */
  formal: string;
  components: NameComponents;
  nickname_expanded: boolean;
  had_diacritics: boolean;
  /** True when the input was in "Last, First" order and was reordered. */
  reordered: boolean;
  /** Human-readable list of the transformations applied. */
  changes: string[];
  confidence: number;
}

// Exported so downstream features (fuzzy match, dedup) share one nickname map.
export const NICKNAMES: Record<string, string> = {
  bob: 'Robert', rob: 'Robert', bobby: 'Robert', bill: 'William', billy: 'William',
  will: 'William', jim: 'James', jimmy: 'James', mike: 'Michael', mikey: 'Michael',
  tom: 'Thomas', tommy: 'Thomas', dave: 'David', dan: 'Daniel', danny: 'Daniel',
  chris: 'Christopher', matt: 'Matthew', joe: 'Joseph', joey: 'Joseph', liz: 'Elizabeth',
  beth: 'Elizabeth', kate: 'Katherine', katie: 'Katherine', kathy: 'Katherine',
  sam: 'Samuel', alex: 'Alexander', nick: 'Nicholas', tony: 'Anthony', greg: 'Gregory',
  andy: 'Andrew', ben: 'Benjamin', charlie: 'Charles', ted: 'Theodore', ed: 'Edward',
  eddie: 'Edward', jen: 'Jennifer', jenny: 'Jennifer', peggy: 'Margaret', meg: 'Margaret',
  sue: 'Susan', patty: 'Patricia', trish: 'Patricia', becky: 'Rebecca', ron: 'Ronald',
};

// Common name typos → correct spelling.
export const NAME_TYPOS: Record<string, string> = {
  jhon: 'John', jon: 'John', gohn: 'John', wlliam: 'William', willaim: 'William',
  micheal: 'Michael', michal: 'Michael', stephan: 'Stephen', catherin: 'Catherine',
  sara: 'Sarah', maria: 'Maria', danial: 'Daniel', jospeh: 'Joseph', rechard: 'Richard',
};

const PREFIXES = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'sir', 'rev', 'capt', 'lt', 'col']);
const SUFFIXES: Record<string, string> = {
  jr: 'Jr.', sr: 'Sr.', ii: 'II', iii: 'III', iv: 'IV', v: 'V',
  phd: 'PhD', md: 'MD', esq: 'Esq.', mba: 'MBA', dds: 'DDS',
};
const PREFIX_LABEL: Record<string, string> = {
  dr: 'Dr.', mr: 'Mr.', mrs: 'Mrs.', ms: 'Ms.', miss: 'Miss', prof: 'Prof.',
  sir: 'Sir', rev: 'Rev.', capt: 'Capt.', lt: 'Lt.', col: 'Col.',
};
// Lowercased surname particles (nobiliary), kept lowercase in canonical form.
const PARTICLES = new Set(['van', 'von', 'der', 'de', 'del', 'della', 'di', 'da', 'la', 'le', 'du', 'bin', 'al', 'ter', 'ten']);

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));

/** Case a single surname token, honoring Mc/Mac, O', hyphenation, and particles. */
function caseSurnameToken(token: string): string {
  const lower = token.toLowerCase();
  if (PARTICLES.has(lower)) return lower;
  // Hyphenated: case each side.
  if (lower.includes('-')) return lower.split('-').map(caseSurnameToken).join('-');
  // O'Brien
  if (/^o'/.test(lower)) return "O'" + cap(lower.slice(2));
  // McDonald / MacArthur
  if (/^mc/.test(lower) && lower.length > 2) return 'Mc' + cap(lower.slice(2));
  if (/^mac/.test(lower) && lower.length > 3) return 'Mac' + cap(lower.slice(3));
  return cap(lower);
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Expand a nickname or fix a typo on a given-name token; returns [name, changed]. */
function normalizeGiven(token: string): { value: string; nickname: boolean; typo: boolean } {
  const lower = token.toLowerCase().replace(/[^a-z]/g, '');
  if (NAME_TYPOS[lower]) return { value: NAME_TYPOS[lower], nickname: false, typo: true };
  if (NICKNAMES[lower]) return { value: NICKNAMES[lower], nickname: true, typo: false };
  return { value: cap(token.toLowerCase()), nickname: false, typo: false };
}

/**
 * The simple canonical string other features share: nickname/typo-expanded,
 * correctly cased "First [Middle] Last" (no prefix/suffix). Stable and cheap.
 */
export function canonicalNameString(raw: string): string {
  const c = canonicalizeName(raw);
  return c ? c.canonical : '';
}

export function canonicalizeName(rawName: string): NameCanonicalization | null {
  const input = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!input) return null;

  const changes: string[] = [];
  const had_diacritics = stripDiacritics(input) !== input;

  // 1. "Last, First" ordering → reorder.
  let working = input;
  let reordered = false;
  const commaParts = input.split(',');
  if (commaParts.length === 2 && commaParts[0].trim() && commaParts[1].trim()) {
    // A trailing suffix after the comma (e.g. "Smith, Jr.") is not a reorder.
    const afterLower = commaParts[1].trim().toLowerCase().replace(/\./g, '');
    if (!SUFFIXES[afterLower]) {
      working = `${commaParts[1].trim()} ${commaParts[0].trim()}`;
      reordered = true;
      changes.push('Reordered from "Last, First" to "First Last"');
    } else {
      working = `${commaParts[0].trim()} ${commaParts[1].trim()}`;
    }
  }

  const wasUpper = working === working.toUpperCase() && /[A-Z]/.test(working);
  if (wasUpper) changes.push('Normalized ALL-CAPS to title case');

  // 2. Tokenize; pull off prefix + suffix.
  let tokens = working.split(' ').filter(Boolean);
  let prefix: string | null = null;
  let suffix: string | null = null;

  const firstTokClean = tokens[0]?.toLowerCase().replace(/\./g, '');
  if (firstTokClean && PREFIXES.has(firstTokClean)) {
    prefix = PREFIX_LABEL[firstTokClean];
    tokens = tokens.slice(1);
    changes.push(`Extracted prefix "${prefix}"`);
  }
  const lastTokClean = tokens[tokens.length - 1]?.toLowerCase().replace(/\./g, '');
  if (tokens.length > 1 && lastTokClean && SUFFIXES[lastTokClean]) {
    suffix = SUFFIXES[lastTokClean];
    tokens = tokens.slice(0, -1);
    changes.push(`Extracted suffix "${suffix}"`);
  }

  if (tokens.length === 0) return null;

  // 3. First / middle / last, expanding the given name.
  const firstNorm = normalizeGiven(tokens[0]);
  const first = firstNorm.value;
  if (firstNorm.nickname) changes.push(`Expanded nickname "${cap(tokens[0].toLowerCase())}" → "${first}"`);
  if (firstNorm.typo) changes.push(`Corrected typo "${cap(tokens[0].toLowerCase())}" → "${first}"`);

  let last = '';
  let middle: string | null = null;
  if (tokens.length === 1) {
    last = ''; // mononym
  } else {
    // Collect trailing surname (particle + name, e.g. "van der Berg").
    let surnameStart = tokens.length - 1;
    while (surnameStart > 1 && PARTICLES.has(tokens[surnameStart - 1].toLowerCase())) surnameStart--;
    last = tokens.slice(surnameStart).map(caseSurnameToken).join(' ');
    const mids = tokens.slice(1, surnameStart);
    if (mids.length) middle = mids.map((m) => cap(m.toLowerCase())).join(' ');
  }

  const canonical = [first, middle, last].filter(Boolean).join(' ');
  const formal = [prefix, first, middle, last, suffix].filter(Boolean).join(' ');
  const ascii = stripDiacritics(canonical);
  if (had_diacritics) changes.push('Folded accents to ASCII');

  // Confidence: a clean single/double-token name with no ambiguity scores high.
  let confidence = 0.95;
  if (tokens.length === 1) confidence = 0.7; // mononym — no surname to anchor
  if (tokens.length > 3) confidence -= 0.08;
  if (firstNorm.typo) confidence -= 0.05;
  confidence = clamp01(confidence);

  if (changes.length === 0) changes.push('Standardized capitalization');

  return {
    input,
    canonical,
    ascii,
    formal,
    components: { prefix, first, middle, last, suffix },
    nickname_expanded: firstNorm.nickname,
    had_diacritics,
    reordered,
    changes,
    confidence,
  };
}
