import {
  fixMojibake, normalizeText, canonicalUtf8, detectScripts, transliterate,
  asciiFold, stripControlChars, collapseWhitespace,
} from '@/lib/text-normalizer';

describe('encoding & language normalization (F-057)', () => {
  describe('fixMojibake', () => {
    it('repairs Latin-1 accented mojibake', () => {
      expect(fixMojibake('JosÃ© GarcÃ­a')).toBe('José García');
      expect(fixMojibake('MÃ¼nchen')).toBe('München');
      expect(fixMojibake('SÃ£o Paulo')).toBe('São Paulo');
    });
    it('repairs cp1252 punctuation mojibake', () => {
      expect(fixMojibake('itâ€™s')).toBe('it’s');
      expect(fixMojibake('â‚¬10')).toBe('€10');
    });
    it('leaves clean text untouched', () => {
      expect(fixMojibake('Normal ASCII, no change.')).toBe('Normal ASCII, no change.');
      expect(fixMojibake('Âme française')).toBe('Âme française'); // real Â preserved
    });
  });

  describe('unicode + whitespace + control', () => {
    it('composes decomposed sequences to NFC', () => {
      const decomposed = 'é'; // e + combining acute
      const r = normalizeText(decomposed);
      expect(r.normalized).toBe('é');
      expect(r.flags.wasDecomposed).toBe(true);
    });
    it('strips zero-width and control characters', () => {
      expect(stripControlChars('Jos​é﻿')).toBe('José');
    });
    it('collapses and trims whitespace', () => {
      expect(collapseWhitespace('  a   b\t c \n')).toBe('a b c');
    });
  });

  describe('script detection', () => {
    it('detects the primary script', () => {
      expect(detectScripts('Hello')).toEqual(['Latin']);
      expect(detectScripts('Пётр')).toEqual(['Cyrillic']);
      expect(detectScripts('北京')[0]).toBe('Han');
      expect(detectScripts('12:34 !')).toEqual([]); // no script-bearing chars
    });
    it('orders mixed scripts by frequency and flags mixed', () => {
      const r = normalizeText('Acme Корп');
      expect(r.scripts).toContain('Latin');
      expect(r.scripts).toContain('Cyrillic');
      expect(r.flags.mixedScript).toBe(true);
    });
  });

  describe('transliteration + folding', () => {
    it('transliterates Cyrillic to Latin', () => {
      expect(transliterate('Пётр', 'Cyrillic')).toBe('Petr');
    });
    it('transliterates Greek to Latin', () => {
      expect(transliterate('Αθηνα', 'Greek')).toBe('Athina');
    });
    it('returns null for scripts without a table', () => {
      expect(transliterate('北京', 'Han')).toBeNull();
    });
    it('folds Latin diacritics to ASCII', () => {
      expect(asciiFold('José García')).toBe('Jose Garcia');
      expect(asciiFold('Müller')).toBe('Muller');
    });
  });

  describe('normalizeText end-to-end', () => {
    it('produces a canonical form + ascii + language hint and records transforms', () => {
      const r = normalizeText('  JosÃ©   GarcÃ­a​ ');
      expect(r.normalized).toBe('José García');
      expect(r.ascii).toBe('Jose Garcia');
      expect(r.primaryScript).toBe('Latin');
      expect(r.languageHint).toBe('French');
      expect(r.flags.wasMojibake).toBe(true);
      expect(r.flags.changed).toBe(true);
      const types = r.transformations.map((t) => t.type);
      expect(types).toContain('mojibake_repaired');
      expect(types).toContain('diacritics_folded');
    });
    it('hints German / Spanish / Portuguese from diacritic markers', () => {
      expect(normalizeText('Müller').languageHint).toBe('German');
      expect(normalizeText('Muñoz').languageHint).toBe('Spanish');
      expect(normalizeText('São').languageHint).toBe('Portuguese');
    });
    it('transliterates a non-Latin record into ascii', () => {
      const r = normalizeText('Пётр Ильич');
      expect(r.primaryScript).toBe('Cyrillic');
      expect(r.ascii).toBe('Petr Ilich');
      expect(r.transformations.map((t) => t.type)).toContain('transliterated');
    });
    it('is a clean no-op for plain ASCII', () => {
      const r = normalizeText('Jane Doe');
      expect(r.flags.changed).toBe(false);
      expect(r.flags.isAscii).toBe(true);
      expect(r.transformations).toHaveLength(0);
    });
    it('is deterministic', () => {
      const input = 'MÃ¼ller & CÃ´té';
      expect(normalizeText(input)).toEqual(normalizeText(input));
    });
    it('handles empty input safely', () => {
      const r = normalizeText('');
      expect(r.normalized).toBe('');
      expect(r.languageHint).toBeNull();
      expect(r.flags.changed).toBe(false);
    });
  });

  describe('canonicalUtf8', () => {
    it('repairs + NFC + cleans but preserves non-Latin scripts', () => {
      expect(canonicalUtf8('JosÃ©​  GarcÃ­a')).toBe('José García');
      expect(canonicalUtf8('Пётр')).toBe('Пётр'); // not transliterated
    });
  });
});
