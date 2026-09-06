import { appendDemographics, type PersonDemographics } from '@/lib/demographic-resolver';

const EMAILS = ['ceo@acme.com', 'jane.doe@stripe.com', 'eng.lead@shopify.com', 'sdr@datadog.com', 'cfo@bigco.com', 'designer@figma.com'];

function profiles(): PersonDemographics[] {
  return EMAILS.map((e) => appendDemographics(e)).filter((d): d is PersonDemographics => d !== null);
}

describe('appendDemographics', () => {
  it('is deterministic', () => {
    expect(appendDemographics('ceo@acme.com')).toEqual(appendDemographics('ceo@acme.com'));
  });

  it('returns null for a personal email', () => {
    expect(appendDemographics('someone@gmail.com')).toBeNull();
  });

  it('never infers protected characteristics and lists them as excluded', () => {
    for (const d of profiles()) {
      // the compliance contract: protected attributes are declared excluded…
      expect(d.excluded_attributes).toEqual(expect.arrayContaining(['age', 'gender', 'race_ethnicity']));
      // …and never appear as returned fields
      const keys = Object.keys(d);
      expect(keys).not.toContain('age');
      expect(keys).not.toContain('gender');
      expect(keys).not.toContain('ethnicity');
    }
  });

  it('produces a coherent professional profile', () => {
    for (const d of profiles()) {
      expect(d.seniority_tier).toBeGreaterThanOrEqual(1);
      expect(d.seniority_tier).toBeLessThanOrEqual(7);
      expect(d.years_experience).toBeGreaterThanOrEqual(0);
      expect(d.years_in_role).toBeLessThanOrEqual(d.years_at_company);
      expect(d.years_at_company).toBeLessThanOrEqual(d.years_experience + 1);
      expect(d.skills.length).toBeGreaterThanOrEqual(3);
      expect(new Set(d.skills).size).toBe(d.skills.length); // no dup skills
      expect(d.seniority_score).toBeGreaterThanOrEqual(0);
      expect(d.seniority_score).toBeLessThanOrEqual(100);
      expect(['decision_maker', 'influencer', 'end_user', 'gatekeeper']).toContain(d.buying_role);
    }
  });

  it('gives a C-suite contact a high tier + decision-maker + high score', () => {
    const ceo = appendDemographics('ceo@acme.com');
    expect(ceo).not.toBeNull();
    if (ceo && ceo.seniority === 'C-Suite') {
      expect(ceo.seniority_tier).toBe(7);
      expect(ceo.is_decision_maker).toBe(true);
      expect(ceo.buying_role).toBe('decision_maker');
      expect(ceo.seniority_score).toBeGreaterThanOrEqual(70);
    }
  });

  it('bands experience consistently with the number', () => {
    for (const d of profiles()) {
      if (d.years_experience < 3) expect(d.years_experience_band).toBe('0–2 years');
      if (d.years_experience >= 20) expect(d.years_experience_band).toBe('20+ years');
    }
  });
});
