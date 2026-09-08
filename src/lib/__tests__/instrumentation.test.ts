/**
 * Instrumentation & de-anon SSOT (Phase 0, M1.3) — unit tests.
 */
import {
  SINKS, sinkById, routeEvent, generateVisitorFeed, deAnonStats,
} from '@/lib/instrumentation';

const NOW = 1_760_000_000_000;

describe('sinks', () => {
  it('has the four day-one sinks', () => {
    expect(SINKS.map((s) => s.id).sort()).toEqual(['clarity', 'ga', 'mixpanel', 'rb2b']);
    expect(sinkById('rb2b').purpose).toMatch(/de-anon/i);
  });
});

describe('routeEvent', () => {
  it('routes every event to Mixpanel', () => {
    expect(routeEvent('sandbox_fired_gated')).toContain('mixpanel');
    expect(routeEvent('signup_completed')).toContain('mixpanel');
  });
  it('routes lp_viewed to GA + Clarity + RB2B', () => {
    const r = routeEvent('lp_viewed');
    expect(r).toEqual(expect.arrayContaining(['ga', 'clarity', 'rb2b', 'mixpanel']));
  });
  it('routes identified-visitor moments to RB2B', () => {
    expect(routeEvent('signup_gate_shown')).toContain('rb2b');
    expect(routeEvent('signup_completed')).toContain('rb2b');
  });
  it('does not route a plain product event to RB2B', () => {
    expect(routeEvent('funnel_viewed')).not.toContain('rb2b');
  });
});

describe('generateVisitorFeed', () => {
  it('is deterministic and newest-first', () => {
    const a = generateVisitorFeed('seed', 40, NOW);
    const b = generateVisitorFeed('seed', 40, NOW);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].at).toBeGreaterThanOrEqual(a[i].at);
  });
  it('only identified visitors carry a person; EU/India are consent-gated', () => {
    const feed = generateVisitorFeed('seed', 60, NOW);
    expect(feed.filter((v) => v.consent === 'identified').every((v) => v.person !== null)).toBe(true);
    expect(feed.filter((v) => v.consent !== 'identified').every((v) => v.person === null)).toBe(true);
    // India (DPDP) and Germany (GDPR) are never fully identified.
    expect(feed.filter((v) => v.country === 'IN' || v.country === 'DE').every((v) => v.consent !== 'identified')).toBe(true);
    // US is the strongest coverage — at least some identified.
    expect(feed.some((v) => v.country === 'US' && v.consent === 'identified')).toBe(true);
  });
});

describe('deAnonStats', () => {
  it('counts identified vs consent-gated and computes identify rate', () => {
    const feed = generateVisitorFeed('seed', 60, NOW);
    const s = deAnonStats(feed);
    expect(s.total).toBe(60);
    expect(s.identified + s.consentGated).toBe(60);
    expect(s.identifyRatePct).toBe(Math.round((s.identified / 60) * 100));
    expect(s.byRegion.reduce((n, r) => n + r.count, 0)).toBe(60);
  });
});
