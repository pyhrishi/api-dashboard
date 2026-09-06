/**
 * Encoding & language normalization (F-057) — the SSOT for cleaning messy text.
 *
 * Real-world names, companies, and addresses arrive mojibaked ("JosÃ©"),
 * decomposed (an "e" + a combining accent instead of "é"), padded with
 * zero-width and control characters, or written in a non-Latin script. All of
 * that quietly breaks matching. This module enforces one canonical UTF-8 form
 * and exposes the script/language it detected, so the rest of the platform (the
 * name canonicalizer, fuzzy matcher, and the Studio "Normalize text" tool) works
 * from clean, comparable strings.
 *
 * Pure and deterministic — same input always yields the same normalization. No
 * `Math.random`, no network. Iterates code points via `Array.from` (never
 * `for..of`/spread over a string) to stay correct under the low tsconfig target.
 */

export type ScriptName =
  | 'Latin' | 'Cyrillic' | 'Greek' | 'Han' | 'Hiragana' | 'Katakana'
  | 'Hangul' | 'Arabic' | 'Hebrew' | 'Devanagari' | 'Thai' | 'Common';

export type TransformationType =
  | 'mojibake_repaired' | 'unicode_nfc' | 'control_stripped'
  | 'whitespace_collapsed' | 'diacritics_folded' | 'transliterated';

export interface Transformation {
  type: TransformationType;
  detail: string;
}

export interface NormalizedText {
  original: string;
  /** Canonical UTF-8: mojibake-repaired → NFC → control-stripped → whitespace-collapsed. */
  normalized: string;
  /** ASCII form: transliterated (non-Latin) or diacritic-folded (Latin). Empty if not derivable. */
  ascii: string;
  scripts: ScriptName[];
  primaryScript: ScriptName;
  /** Coarse language hint from script + diacritic markers (best-effort, not full detection). */
  languageHint: string | null;
  transformations: Transformation[];
  flags: {
    wasMojibake: boolean;
    hadControlChars: boolean;
    wasDecomposed: boolean;
    mixedScript: boolean;
    isAscii: boolean;
    changed: boolean;
  };
  /** UTF-8 byte lengths, before and after — a compact "what changed" signal. */
  bytes: { original: number; normalized: number };
}

// ── Mojibake repair ───────────────────────────────────────────────────────────
// The classic failure: UTF-8 bytes decoded as Latin-1/Windows-1252. Repair the
// most common sequences directly (longest first so multi-byte wins).
const MOJIBAKE_PAIRS: Array<[string, string]> = [
  ['\u00e2\u0080\u0099', '\u2019'],
  ['\u00e2\u20ac\u2122', '\u2019'],
  ['\u00e2\u0080\u0098', '\u2018'],
  ['\u00e2\u20ac\u02dc', '\u2018'],
  ['\u00e2\u0080\u009c', '\u201c'],
  ['\u00e2\u20ac\u0153', '\u201c'],
  ['\u00e2\u0080\u009d', '\u201d'],
  ['\u00e2\u20ac\u009d', '\u201d'],
  ['\u00e2\u0080\u0094', '\u2014'],
  ['\u00e2\u20ac\u201d', '\u2014'],
  ['\u00e2\u0080\u0093', '\u2013'],
  ['\u00e2\u20ac\u201c', '\u2013'],
  ['\u00e2\u0080\u00a6', '\u2026'],
  ['\u00e2\u20ac\u00a6', '\u2026'],
  ['\u00e2\u0080\u00a2', '\u2022'],
  ['\u00e2\u20ac\u00a2', '\u2022'],
  ['\u00e2\u0082\u00ac', '\u20ac'],
  ['\u00e2\u201a\u00ac', '\u20ac'],
  ['\u00c3\u00a1', '\u00e1'],
  ['\u00c3\u00a9', '\u00e9'],
  ['\u00c3\u00ad', '\u00ed'],
  ['\u00c3\u00b3', '\u00f3'],
  ['\u00c3\u00ba', '\u00fa'],
  ['\u00c3\u00b1', '\u00f1'],
  ['\u00c3\u00bc', '\u00fc'],
  ['\u00c3\u00b6', '\u00f6'],
  ['\u00c3\u00a4', '\u00e4'],
  ['\u00c3\u00ab', '\u00eb'],
  ['\u00c3\u00af', '\u00ef'],
  ['\u00c3\u00a0', '\u00e0'],
  ['\u00c3\u00a8', '\u00e8'],
  ['\u00c3\u00ac', '\u00ec'],
  ['\u00c3\u00b2', '\u00f2'],
  ['\u00c3\u00b9', '\u00f9'],
  ['\u00c3\u00a2', '\u00e2'],
  ['\u00c3\u00aa', '\u00ea'],
  ['\u00c3\u00ae', '\u00ee'],
  ['\u00c3\u00b4', '\u00f4'],
  ['\u00c3\u00bb', '\u00fb'],
  ['\u00c3\u00a7', '\u00e7'],
  ['\u00c3\u00a3', '\u00e3'],
  ['\u00c3\u00b5', '\u00f5'],
  ['\u00c3\u009f', '\u00df'],
  ['\u00c3\u0178', '\u00df'],
  ['\u00c3\u0081', '\u00c1'],
  ['\u00c3\u0089', '\u00c9'],
  ['\u00c3\u2030', '\u00c9'],
  ['\u00c3\u008d', '\u00cd'],
  ['\u00c3\u0093', '\u00d3'],
  ['\u00c3\u201c', '\u00d3'],
  ['\u00c3\u009a', '\u00da'],
  ['\u00c3\u0161', '\u00da'],
  ['\u00c3\u0091', '\u00d1'],
  ['\u00c3\u2018', '\u00d1'],
  ['\u00c3\u009c', '\u00dc'],
  ['\u00c3\u0153', '\u00dc'],
  ['\u00c3\u0096', '\u00d6'],
  ['\u00c3\u2013', '\u00d6'],
  ['\u00c3\u0084', '\u00c4'],
  ['\u00c3\u201e', '\u00c4'],
  ['\u00c3\u0087', '\u00c7'],
  ['\u00c3\u2021', '\u00c7'],
  ['\u00c3\u0080', '\u00c0'],
  ['\u00c3\u20ac', '\u00c0'],
  ['\u00c3\u0088', '\u00c8'],
  ['\u00c3\u02c6', '\u00c8'],
  ['\u00c2\u00a3', '\u00a3'],
  ['\u00c2\u00a9', '\u00a9'],
  ['\u00c2\u00ae', '\u00ae'],
  ['\u00c2\u00b0', '\u00b0'],
];

const MOJIBAKE_MARKERS = /[\u00c2\u00c3\u00e2]/;

/** Repair common UTF-8-as-Latin1 mojibake. Returns the input unchanged if none present. */
export function fixMojibake(input: string): string {
  if (!MOJIBAKE_MARKERS.test(input)) return input;
  let out = input;
  MOJIBAKE_PAIRS.forEach(([bad, good]) => {
    if (out.indexOf(bad) !== -1) out = out.split(bad).join(good);
  });
  return out;
}

// ── Control / invisible characters ──────────────────────────────────────────
// Zero-width, BOM, bidi controls, and C0/C1 controls (keep \t \n \r for now).
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_RE, '');
}

export function collapseWhitespace(input: string): string {
  return input.replace(/[\t\n\r ]+/g, ' ').trim();
}

// ── Script detection ────────────────────────────────────────────────────────
function scriptOfCodePoint(cp: number): ScriptName | null {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ||
      (cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) return 'Latin';
  if (cp >= 0x400 && cp <= 0x4ff) return 'Cyrillic';
  if ((cp >= 0x370 && cp <= 0x3ff) || (cp >= 0x1f00 && cp <= 0x1fff)) return 'Greek';
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) return 'Han';
  if (cp >= 0x3040 && cp <= 0x309f) return 'Hiragana';
  if (cp >= 0x30a0 && cp <= 0x30ff) return 'Katakana';
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff)) return 'Hangul';
  if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f)) return 'Arabic';
  if (cp >= 0x590 && cp <= 0x5ff) return 'Hebrew';
  if (cp >= 0x900 && cp <= 0x97f) return 'Devanagari';
  if (cp >= 0xe00 && cp <= 0xe7f) return 'Thai';
  return null; // digits, punctuation, spaces, emoji → not script-bearing
}

/** The scripts present in a string, most-frequent first (script-bearing chars only). */
export function detectScripts(input: string): ScriptName[] {
  const counts = new Map<ScriptName, number>();
  Array.from(input).forEach((ch) => {
    const s = scriptOfCodePoint(ch.codePointAt(0) ?? 0);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

// ── Transliteration (script → Latin) ────────────────────────────────────────
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const GREEK_MAP: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l',
  μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f',
  χ: 'ch', ψ: 'ps', ω: 'o',
};

/** Transliterate Cyrillic/Greek to Latin. Returns null when the primary script has no table. */
export function transliterate(input: string, primaryScript: ScriptName): string | null {
  const map = primaryScript === 'Cyrillic' ? CYRILLIC_MAP : primaryScript === 'Greek' ? GREEK_MAP : null;
  if (!map) return null;
  return Array.from(input).map((ch) => {
    const lower = ch.toLowerCase();
    const mapped = map[lower];
    if (mapped === undefined) return ch;
    // Preserve capitalization of the source letter.
    return ch !== lower && mapped ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : mapped;
  }).join('');
}

/** Fold Latin diacritics to ASCII (é→e, ü→u, ñ→n) via NFD + combining-mark strip. */
export function asciiFold(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7f]/g, '');
}

// ── Language hint (coarse, marker-based) ─────────────────────────────────────
function languageHintFor(normalized: string, primaryScript: ScriptName): string | null {
  if (primaryScript === 'Cyrillic') return 'Russian/Slavic (Cyrillic)';
  if (primaryScript === 'Greek') return 'Greek';
  if (primaryScript === 'Han') return 'Chinese/Japanese (Han)';
  if (primaryScript === 'Hiragana' || primaryScript === 'Katakana') return 'Japanese';
  if (primaryScript === 'Hangul') return 'Korean';
  if (primaryScript === 'Arabic') return 'Arabic';
  if (primaryScript === 'Hebrew') return 'Hebrew';
  if (primaryScript === 'Devanagari') return 'Hindi/Devanagari';
  if (primaryScript === 'Thai') return 'Thai';
  if (primaryScript !== 'Latin') return null;
  const s = normalized.toLowerCase();
  if (/ß|ä|ö|ü/.test(s)) return 'German';
  if (/ñ|¿|¡/.test(s)) return 'Spanish';
  if (/ã|õ|ç/.test(s)) return 'Portuguese';
  if (/[àâæœ]|ë|ï|ç|é|è/.test(s)) return 'French';
  if (/å|ø|æ/.test(s)) return 'Nordic';
  if (/[čšžě]/.test(s)) return 'Czech/Slavic (Latin)';
  return /[^\x00-\x7f]/.test(normalized) ? 'Latin (accented)' : 'English/ASCII';
}

const utf8Bytes = (s: string): number => {
  // Byte length without relying on Buffer (works in the browser bundle too).
  let n = 0;
  Array.from(s).forEach((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  });
  return n;
};

/**
 * Normalize any text to one canonical UTF-8 form and describe what changed and
 * what script/language it is. The heart of F-057; deterministic.
 */
export function normalizeText(raw: string): NormalizedText {
  const original = String(raw ?? '');
  const transformations: Transformation[] = [];

  // 1. Repair mojibake.
  const demojibaked = fixMojibake(original);
  const wasMojibake = demojibaked !== original;
  if (wasMojibake) transformations.push({ type: 'mojibake_repaired', detail: 'Repaired UTF-8 decoded as Latin-1/Windows-1252' });

  // 2. Unicode NFC (compose decomposed sequences).
  const nfc = demojibaked.normalize('NFC');
  const wasDecomposed = nfc !== demojibaked;
  if (wasDecomposed) transformations.push({ type: 'unicode_nfc', detail: 'Composed to Unicode NFC' });

  // 3. Strip control / invisible characters.
  const noControl = stripControlChars(nfc);
  const hadControlChars = noControl !== nfc;
  if (hadControlChars) transformations.push({ type: 'control_stripped', detail: 'Removed zero-width / control characters' });

  // 4. Collapse whitespace.
  const normalized = collapseWhitespace(noControl);
  if (normalized !== noControl) {
    transformations.push({ type: 'whitespace_collapsed', detail: 'Collapsed and trimmed whitespace' });
  }

  // 5. Script + language.
  const scripts = detectScripts(normalized);
  const primaryScript: ScriptName = scripts[0] ?? 'Common';
  const mixedScript = scripts.filter((s) => s !== 'Common').length > 1;
  const languageHint = normalized ? languageHintFor(normalized, primaryScript) : null;

  // 6. ASCII form: transliterate non-Latin, else diacritic-fold.
  let ascii = '';
  if (primaryScript === 'Latin' || primaryScript === 'Common') {
    ascii = asciiFold(normalized);
    if (ascii !== normalized && ascii) transformations.push({ type: 'diacritics_folded', detail: 'Folded diacritics to ASCII' });
  } else {
    const t = transliterate(normalized, primaryScript);
    if (t) {
      ascii = asciiFold(t);
      transformations.push({ type: 'transliterated', detail: `Transliterated ${primaryScript} to Latin` });
    } else {
      ascii = asciiFold(normalized); // best effort; may be empty for unsupported scripts
    }
  }

  const isAscii = !/[^\x00-\x7f]/.test(normalized);

  return {
    original,
    normalized,
    ascii,
    scripts,
    primaryScript,
    languageHint,
    transformations,
    flags: {
      wasMojibake,
      hadControlChars,
      wasDecomposed,
      mixedScript,
      isAscii,
      changed: normalized !== original,
    },
    bytes: { original: utf8Bytes(original), normalized: utf8Bytes(normalized) },
  };
}

/**
 * The canonical UTF-8 form only — mojibake-repaired + NFC + cleaned. Cheap enough
 * to run upstream of matching (name canonicalizer, fuzzy matcher) so comparisons
 * never diverge over encoding. Non-Latin scripts are preserved (not transliterated).
 */
export function canonicalUtf8(raw: string): string {
  return collapseWhitespace(stripControlChars(fixMojibake(String(raw ?? '')).normalize('NFC')));
}
