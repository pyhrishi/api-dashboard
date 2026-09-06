import { resolveIdentityHistory, type IdentityHistory } from '@/lib/identity-history-resolver';

const EMAILS = ['ceo@acme.com', 'jane.doe@stripe.com', 'director@datadoghq.com', 'sarah.chen@shopify.com', 'vp.eng@figma.com'];

function all(): IdentityHistory[] {
  return EMAILS.map((e) => resolveIdentityHistory(e)).filter((h): h is IdentityHistory => h !== null);
}

const ym = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));

describe('resolveIdentityHistory', () => {
  it('is deterministic', () => {
    expect(resolveIdentityHistory('jane.doe@stripe.com')).toEqual(resolveIdentityHistory('jane.doe@stripe.com'));
  });

  it('returns null for a personal email', () => {
    expect(resolveIdentityHistory('someone@gmail.com')).toBeNull();
  });

  it('anchors the current state to the resolved person and marks exactly one current', () => {
    for (const h of all()) {
      const current = h.states.filter((s) => s.is_current);
      expect(current).toHaveLength(1);
      expect(current[0].id).toBe(h.current_state_id);
      expect(current[0].period_end).toBeNull();
      expect(current[0].email).toBe(h.subject_email);
      expect(h.states[0].is_current).toBe(true); // newest first
    }
  });

  it('orders states newest→oldest with contiguous, non-overlapping periods', () => {
    for (const h of all()) {
      for (let i = 1; i < h.states.length; i++) {
        const newer = h.states[i - 1];
        const older = h.states[i];
        // an older role ends exactly when the newer role starts
        expect(older.period_end).toBe(newer.period_start);
        expect(ym(older.period_start)).toBeLessThan(ym(older.period_end!));
      }
    }
  });

  it('shows seniority progression (non-decreasing from past to present)', () => {
    const LADDER = ['Individual Contributor', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Suite'];
    for (const h of all()) {
      // states are newest-first; walking to older should never increase seniority
      for (let i = 1; i < h.states.length; i++) {
        expect(LADDER.indexOf(h.states[i].seniority)).toBeLessThanOrEqual(LADDER.indexOf(h.states[i - 1].seniority));
      }
    }
  });

  it('ties every state to one Zinbit ID and counts distinct employers', () => {
    for (const h of all()) {
      expect(h.zinbit_id.length).toBeGreaterThan(0);
      const domains = new Set(h.states.map((s) => s.domain));
      expect(h.employer_count).toBe(domains.size);
      expect(h.span_years).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits an email-change transition for each prior role', () => {
    for (const h of all()) {
      const priorCount = h.states.length - 1;
      const emailChanges = h.transitions.filter((t) => t.type === 'email_change');
      expect(emailChanges.length).toBe(priorCount);
    }
  });
});
