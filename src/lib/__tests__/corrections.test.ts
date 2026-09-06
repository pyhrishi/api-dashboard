import {
  correctionEntityKey, inferFieldKind, validateFieldValue, summarizeCorrections,
  acceptedCorrectionsFor, generateSeedCorrections, makeCorrectionId, normalizeInput,
  type Correction,
} from '@/lib/corrections';
import { triageCorrection } from '@/lib/insight-engine';

describe('corrections SSOT (F-046)', () => {
  it('builds a stable, normalized entity key', () => {
    expect(correctionEntityKey('resolve-person', '  Jane.Doe@Acme.com ')).toBe('resolve-person::jane.doe@acme.com');
    expect(correctionEntityKey('a', 'X')).toBe(correctionEntityKey('a', 'x'));
  });

  it('infers the field kind from a label', () => {
    expect(inferFieldKind('Email')).toBe('email');
    expect(inferFieldKind('Work Phone')).toBe('phone');
    expect(inferFieldKind('LinkedIn')).toBe('url');
    expect(inferFieldKind('Company')).toBe('company');
    expect(inferFieldKind('Location')).toBe('location');
    expect(inferFieldKind('Title')).toBe('title');
    expect(inferFieldKind('Full Name')).toBe('name');
    expect(inferFieldKind('Employees')).toBe('text');
  });

  it('validates a value against its field kind', () => {
    expect(validateFieldValue('email', 'a@b.com')).toBe(true);
    expect(validateFieldValue('email', 'not-an-email')).toBe(false);
    expect(validateFieldValue('phone', '+1 (415) 555-0100')).toBe(true);
    expect(validateFieldValue('phone', 'call me')).toBe(false);
    expect(validateFieldValue('url', 'acme.com')).toBe(true);
    expect(validateFieldValue('text', '')).toBe(false);
    expect(validateFieldValue('text', 'ok')).toBe(true);
  });

  it('makes deterministic, unique ids', () => {
    const ts = 1_724_000_000_000;
    expect(makeCorrectionId(ts, 1)).toBe(makeCorrectionId(ts, 1));
    expect(makeCorrectionId(ts, 1)).not.toBe(makeCorrectionId(ts, 2));
    expect(makeCorrectionId(ts, 1).startsWith('crn_')).toBe(true);
  });

  it('normalizes input safely', () => {
    expect(normalizeInput(undefined as unknown as string)).toBe('');
    expect(normalizeInput('  A ')).toBe('a');
  });

  it('seeds deterministically with unique ids and valid triage', () => {
    const a = generateSeedCorrections();
    const b = generateSeedCorrections();
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    a.forEach((c) => {
      expect(c.entityKey).toBe(correctionEntityKey(c.presetId, c.input));
      expect(c.triage.score).toBeGreaterThanOrEqual(0);
      expect(c.triage.score).toBeLessThanOrEqual(1);
    });
  });

  it('summarizes counts and accept rate', () => {
    const seed = generateSeedCorrections();
    const s = summarizeCorrections(seed);
    expect(s.total).toBe(seed.length);
    expect(s.pending + s.accepted + s.rejected).toBe(seed.length);
    // seed has 1 accepted + 1 rejected → accept rate 0.5
    expect(s.acceptRate).toBeCloseTo(0.5, 5);
    expect(s.likelyValidPending).toBeGreaterThanOrEqual(1);
    expect(summarizeCorrections([]).acceptRate).toBe(0);
  });

  it('returns only accepted corrections for an entity, newest-first', () => {
    const base = Date.UTC(2026, 0, 1);
    const mk = (id: string, entityKey: string, status: Correction['status'], reviewedAt?: number): Correction => ({
      id, entityKey, presetId: 'p', presetLabel: 'P', input: 'x', field: 'F', fieldKind: 'text',
      oldValue: 'a', newValue: 'b', reason: '', status, reportedBy: 'u@co.com', reportedAt: base, reviewedAt,
      environment: 'live', triage: { score: 0.8, verdict: 'likely_valid', reasons: [] },
    });
    const list = [
      mk('1', 'p::x', 'accepted', base + 1000),
      mk('2', 'p::x', 'pending'),
      mk('3', 'p::x', 'accepted', base + 5000),
      mk('4', 'p::y', 'accepted', base + 9000),
    ];
    const got = acceptedCorrectionsFor(list, 'p::x');
    expect(got.map((c) => c.id)).toEqual(['3', '1']);
  });
});

describe('correction triage (insight-engine, F-046)', () => {
  it('scores a well-formed, explained, material change as likely valid', () => {
    const t = triageCorrection({ fieldKind: 'title', oldValue: 'COO', newValue: 'Chief Executive Officer', reason: 'Promoted to CEO in July 2026 — confirmed on the blog.' });
    expect(t.verdict).toBe('likely_valid');
    expect(t.score).toBeGreaterThanOrEqual(0.7);
  });

  it('flags a no-op correction as suspect', () => {
    const t = triageCorrection({ fieldKind: 'company', oldValue: 'Stripe', newValue: 'Stripe', reason: 'looks fine' });
    expect(t.verdict).toBe('suspect');
    expect(t.reasons[0]).toMatch(/identical/i);
  });

  it('penalizes an implausible numeric jump from a disposable reporter', () => {
    const t = triageCorrection({ fieldKind: 'text', oldValue: '1,200', newValue: '50000000', reason: 'wrong', reportedBy: 'anon@tempmail.io' });
    expect(t.verdict).toBe('suspect');
    expect(t.reasons.join(' ')).toMatch(/implausible|disposable|vague/i);
  });

  it('penalizes a malformed email correction', () => {
    const t = triageCorrection({ fieldKind: 'email', oldValue: 'a@b.com', newValue: 'not-an-email', reason: 'changed' });
    expect(t.score).toBeLessThan(0.5);
  });

  it('is deterministic', () => {
    const input = { fieldKind: 'phone' as const, oldValue: '+1 415 555 0100', newValue: '+1 415 555 0199', reason: 'new direct line after move' };
    expect(triageCorrection(input)).toEqual(triageCorrection(input));
  });
});
