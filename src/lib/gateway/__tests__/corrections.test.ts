import { recordCorrection, getCorrectionStats, __resetCorrectionFeedback } from '@/lib/gateway/corrections';

describe('gateway correction feedback (F-046)', () => {
  beforeEach(() => __resetCorrectionFeedback());

  it('seeds the registry on first read', () => {
    const stats = getCorrectionStats();
    expect(stats.total_reports).toBeGreaterThan(0);
    expect(stats.pending).toBe(stats.total_reports);
  });

  it('records a report as pending with a triage verdict', () => {
    __resetCorrectionFeedback();
    const rec = recordCorrection({ target: 'jane.doe@acme.com', field: 'Title', old_value: 'COO', new_value: 'Chief Executive Officer', reason: 'Promoted to CEO in July 2026, confirmed on the blog.' });
    expect(rec.status).toBe('pending');
    expect(rec.id.startsWith('crn_gw_')).toBe(true);
    expect(rec.triage.verdict).toBe('likely_valid');
  });

  it('tallies reports by triage verdict', () => {
    __resetCorrectionFeedback();
    recordCorrection({ target: 'a@b.com', field: 'Title', old_value: 'X', new_value: 'Chief Executive Officer', reason: 'A specific, checkable reason for the change.' });
    recordCorrection({ target: 'c.com', field: 'Employees', old_value: '10', new_value: '900000', reason: 'x' });
    const stats = getCorrectionStats();
    // 2 seeds + 2 reports = 4
    expect(stats.total_reports).toBe(4);
    const summed = stats.by_verdict.likely_valid + stats.by_verdict.needs_review + stats.by_verdict.suspect;
    expect(summed).toBe(stats.total_reports);
    expect(stats.by_verdict.suspect).toBeGreaterThanOrEqual(1);
  });

  it('assigns unique ids', () => {
    __resetCorrectionFeedback();
    const a = recordCorrection({ target: 't', field: 'Title', old_value: 'a', new_value: 'bbb' });
    const b = recordCorrection({ target: 't', field: 'Title', old_value: 'a', new_value: 'ccc' });
    expect(a.id).not.toBe(b.id);
  });
});
