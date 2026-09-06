import { resolveZinbitId, zidForPerson, zidForCompany, isZinbitId } from '@/lib/zinbit-id';
import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { hashEmail } from '@/lib/hashed-email-resolver';
import { toEnrichmentResult } from '@/data/enrichments';

describe('persistent Zinbit ID', () => {
  it('is deterministic and well-formed for a person', () => {
    const a = resolveZinbitId('jane.doe@acme.com');
    const b = resolveZinbitId('jane.doe@acme.com');
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
    expect(a!.entity_type).toBe('person');
    expect(a!.zinbit_id).toMatch(/^zid_p_[0-9a-z]+$/);
    expect(isZinbitId(a!.zinbit_id)).toBe(true);
  });

  it('matches the standalone person/company id helpers', () => {
    const person = resolvePersonFromEmail('marcus@stripe.com')!;
    expect(resolveZinbitId('marcus@stripe.com')!.zinbit_id).toBe(zidForPerson(person));
    const company = resolveCompanyFromDomain('stripe.com')!;
    expect(resolveZinbitId('stripe.com')!.zinbit_id).toBe(zidForCompany(company));
  });

  it('gives people and companies distinct id namespaces', () => {
    expect(resolveZinbitId('jane.doe@acme.com')!.zinbit_id.startsWith('zid_p_')).toBe(true);
    expect(resolveZinbitId('acme.com')!.zinbit_id.startsWith('zid_c_')).toBe(true);
  });

  it('exposes a hashed-email alias coherent with the hashed-email resolver', () => {
    const res = resolveZinbitId('jane.doe@acme.com')!;
    const hashedAlias = res.aliases.find((a) => a.type === 'hashed_email');
    expect(hashedAlias).toBeDefined();
    expect(hashedAlias!.value).toBe(`sha256:${hashEmail('jane.doe@acme.com')}`);
    // and the canonical email alias is present
    expect(res.aliases.some((a) => a.type === 'email')).toBe(true);
  });

  it('resolves a domain to a company zid with domain + website aliases', () => {
    const res = resolveZinbitId('shopify.com')!;
    expect(res.entity_type).toBe('company');
    expect(res.aliases.map((a) => a.type)).toEqual(expect.arrayContaining(['domain', 'website']));
  });

  it('returns null for unresolvable input', () => {
    expect(resolveZinbitId('not an identifier')).toBeNull();
    expect(resolveZinbitId('')).toBeNull();
  });

  it('validates the id format', () => {
    expect(isZinbitId('zid_p_0a1b2c3d')).toBe(true);
    expect(isZinbitId('zid_x_123')).toBe(false);
    expect(isZinbitId('person_123')).toBe(false);
  });

  it('flows through the Studio dispatch into a zid view-model', () => {
    const res = resolveZinbitId('jane.doe@acme.com')!;
    const vm = toEnrichmentResult({ success: true, ...res });
    expect(vm).not.toBeNull();
    expect(vm!.badges).toEqual(expect.arrayContaining(['person']));
    expect(vm!.fields.some((f) => f.value === res.zinbit_id)).toBe(true);
  });
});
