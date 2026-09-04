import { ROADMAP_AREAS, BUILT_FEATURE_IDS, isFeatureBuilt, ROADMAP_BUILT } from '@/lib/roadmap';

describe('roadmap build status', () => {
  const allIds = new Set(ROADMAP_AREAS.flatMap((a) => a.features.map((f) => f.id)));

  it('every built id is a real roadmap feature (no typos)', () => {
    // Set is not spreadable under the project's tsconfig target — iterate with forEach.
    BUILT_FEATURE_IDS.forEach((id) => {
      expect(allIds.has(id)).toBe(true);
    });
  });

  it('ROADMAP_BUILT matches the set size and isFeatureBuilt', () => {
    expect(ROADMAP_BUILT).toBe(BUILT_FEATURE_IDS.size);
    expect(isFeatureBuilt('F-001')).toBe(true);
    expect(isFeatureBuilt('F-590')).toBe(false);
  });

  it('the five flagship Studio presets are marked built', () => {
    ['F-001', 'F-002', 'F-003', 'F-004', 'F-007'].forEach((id) => expect(isFeatureBuilt(id)).toBe(true));
  });
});
