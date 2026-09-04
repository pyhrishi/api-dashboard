import { parseCsv, toCsv, flattenObject, autoMapColumns, detectDelimiter } from '@/lib/csv';

describe('csv utilities', () => {
  it('parses quoted fields, escaped quotes, and CRLF', () => {
    const text = 'email,company\r\n"a@b.com","Acme, Inc"\r\n"c@d.com","She said ""hi"""\r\n';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(['email', 'company']);
    expect(rows).toEqual([
      { email: 'a@b.com', company: 'Acme, Inc' },
      { email: 'c@d.com', company: 'She said "hi"' },
    ]);
  });

  it('detects semicolon and tab delimiters and strips a BOM', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    const { headers, rows } = parseCsv('﻿email\tphone\nx@y.com\t123');
    expect(headers).toEqual(['email', 'phone']);
    expect(rows[0]).toEqual({ email: 'x@y.com', phone: '123' });
  });

  it('pads short rows, drops blank lines, and names blank headers', () => {
    const { headers, rows } = parseCsv('email,,phone\n\na@b.com\n');
    expect(headers).toEqual(['email', 'column_2', 'phone']);
    expect(rows).toEqual([{ email: 'a@b.com', column_2: '', phone: '' }]);
  });

  it('round-trips through toCsv with escaping', () => {
    const csv = toCsv([{ a: 'x,y', b: 'q"r', c: 3 }], ['a', 'b', 'c']);
    expect(csv).toBe('a,b,c\r\n"x,y","q""r",3');
    expect(parseCsv(csv).rows[0]).toEqual({ a: 'x,y', b: 'q"r', c: '3' });
  });

  it('flattens nested objects and stringifies arrays', () => {
    expect(flattenObject({ a: { b: 1, c: null }, d: [1, 2] })).toEqual({ 'a.b': 1, 'a.c': '', d: '[1,2]' });
  });

  it('auto-maps parameters to headers by name and alias', () => {
    expect(autoMapColumns(['email', 'linkedin_url'], ['Work Email', 'LinkedIn', 'Company'])).toEqual({ email: 'Work Email', linkedin_url: 'LinkedIn' });
    expect(autoMapColumns(['domain'], ['website'])).toEqual({ domain: 'website' });
    expect(autoMapColumns(['cin'], ['name'])).toEqual({});
  });
});
