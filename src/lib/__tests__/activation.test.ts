/**
 * Activation & consumption SSOT (Phase 3, M4) — unit tests.
 */
import {
  ACTIVATION_TARGET_MS, MILESTONES, MILESTONE_META,
  reachedMilestones, newMilestones, currentMilestone, timeToFirstCallMs, isActivatedFast, fmtDuration,
} from '@/lib/activation';

describe('milestones', () => {
  it('has the five consumption milestones with 50% = Sales Ready', () => {
    expect([...MILESTONES]).toEqual([10, 25, 50, 75, 100]);
    expect(MILESTONE_META[50].signal).toBe('sales_ready');
  });
  it('reachedMilestones returns all at/below the used-percent', () => {
    expect(reachedMilestones(0)).toEqual([]);
    expect(reachedMilestones(30)).toEqual([10, 25]);
    expect(reachedMilestones(50)).toEqual([10, 25, 50]);
    expect(reachedMilestones(100)).toEqual([10, 25, 50, 75, 100]);
  });
  it('newMilestones excludes already-fired ones', () => {
    expect(newMilestones(60, [10, 25])).toEqual([50]);
    expect(newMilestones(60, [10, 25, 50])).toEqual([]);
  });
  it('currentMilestone is the highest reached', () => {
    expect(currentMilestone(0)).toBeNull();
    expect(currentMilestone(40)).toBe(25);
    expect(currentMilestone(100)).toBe(100);
  });
});

describe('activation timing', () => {
  it('time-to-first-call is the gap between key and fire', () => {
    expect(timeToFirstCallMs(1000, 4000)).toBe(3000);
    expect(timeToFirstCallMs(null, 4000)).toBeNull();
    expect(timeToFirstCallMs(1000, null)).toBeNull();
  });
  it('fast activation is within the 10-minute target', () => {
    expect(isActivatedFast(5 * 60 * 1000)).toBe(true);
    expect(isActivatedFast(ACTIVATION_TARGET_MS)).toBe(true);
    expect(isActivatedFast(ACTIVATION_TARGET_MS + 1)).toBe(false);
    expect(isActivatedFast(null)).toBe(false);
  });
  it('fmtDuration is compact', () => {
    expect(fmtDuration(45000)).toBe('45s');
    expect(fmtDuration(125000)).toBe('2m 05s');
  });
});
