import { execute, estimateCost } from '@/lib/graphql/executor';
import { buildSDL, QUERIES, TYPES, EXAMPLE_QUERY } from '@/lib/graphql/schema';

describe('graphql schema', () => {
  it('renders SDL covering every query and type', () => {
    const sdl = buildSDL();
    expect(sdl).toContain('type Query {');
    for (const q of Object.values(QUERIES)) expect(sdl).toContain(`${q.name}(`);
    for (const t of Object.values(TYPES)) expect(sdl).toContain(`type ${t.name} {`);
  });

  it('every query returns a known object type', () => {
    for (const q of Object.values(QUERIES)) {
      expect(TYPES[q.returnType]).toBeDefined();
    }
  });
});

describe('graphql executor — happy path', () => {
  it('resolves a person and projects only the selected fields', () => {
    const { data, errors, cost } = execute('{ person(email: "jane@stripe.com") { full_name title company } }');
    expect(errors).toEqual([]);
    expect(cost).toBe(QUERIES.person.creditCost);
    const person = (data as Record<string, Record<string, unknown>>).person;
    expect(Object.keys(person).sort()).toEqual(['company', 'full_name', 'title']);
    expect(typeof person.full_name).toBe('string');
  });

  it('walks the person → employer graph join in one query', () => {
    const { data, errors } = execute(EXAMPLE_QUERY);
    expect(errors).toEqual([]);
    const person = (data as Record<string, Record<string, unknown>>).person;
    const employer = person.employer as Record<string, unknown>;
    expect(employer).toBeTruthy();
    expect(Object.keys(employer).sort()).toEqual(['employee_count', 'funding_stage', 'industry', 'name']);
    expect(typeof employer.industry).toBe('string');
  });

  it('supports multiple top-level queries and sums their cost', () => {
    const { data, errors, cost } = execute('{ person(email:"a@acme.com"){ full_name } company(domain:"acme.com"){ name industry } }');
    expect(errors).toEqual([]);
    expect(cost).toBe(QUERIES.person.creditCost + QUERIES.company.creditCost);
    expect(data).toHaveProperty('person');
    expect(data).toHaveProperty('company');
  });

  it('supports aliases', () => {
    const { data, errors } = execute('{ acme: company(domain:"acme.com"){ name } }');
    expect(errors).toEqual([]);
    expect(data).toHaveProperty('acme');
    expect(data).not.toHaveProperty('company');
  });

  it('substitutes variables', () => {
    const { data, errors } = execute('query($d: String!){ company(domain: $d){ name } }', { d: 'stripe.com' });
    expect(errors).toEqual([]);
    expect((data as Record<string, Record<string, unknown>>).company.name).toBeTruthy();
  });

  it('is deterministic', () => {
    const a = execute('{ company(domain:"stripe.com"){ name industry employee_count } }');
    const b = execute('{ company(domain:"stripe.com"){ name industry employee_count } }');
    expect(a).toEqual(b);
  });
});

describe('graphql executor — validation errors', () => {
  it('errors on an unknown top-level query, no throw', () => {
    const { data, errors } = execute('{ wizard(spell:"x"){ name } }');
    expect(errors[0].message).toMatch(/Cannot query field "wizard" on type "Query"/);
    expect(data).toHaveProperty('wizard', null);
  });

  it('errors on an unknown subfield', () => {
    const { errors } = execute('{ company(domain:"acme.com"){ name bogus_field } }');
    expect(errors.some((e) => /Cannot query field "bogus_field"/.test(e.message))).toBe(true);
  });

  it('errors on a missing required argument', () => {
    const { errors } = execute('{ company { name } }');
    expect(errors[0].message).toMatch(/missing required argument "domain"/);
  });

  it('errors when an object field has no sub-selection', () => {
    const { errors } = execute('{ company(domain:"acme.com") }');
    expect(errors[0].message).toMatch(/must have a selection of subfields/);
  });

  it('errors when a scalar is given a sub-selection', () => {
    const { errors } = execute('{ company(domain:"acme.com"){ name { nope } } }');
    expect(errors.some((e) => /scalar and cannot have a selection/.test(e.message))).toBe(true);
  });

  it('rejects mutations with a clear message, does not throw', () => {
    const { errors, data } = execute('mutation { person(email:"a@b.com"){ id } }');
    expect(data).toBeNull();
    expect(errors[0].message).toMatch(/Only "query" operations are supported/);
  });

  it('returns a syntax error for malformed input', () => {
    const { errors } = execute('{ person(email: }');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBeTruthy();
  });

  it('resolves null (not an error) for an unresolvable input', () => {
    const { data, errors } = execute('{ company(domain:"not a domain!!"){ name } }');
    expect(errors).toEqual([]);
    expect((data as Record<string, unknown>).company).toBeNull();
  });
});

describe('estimateCost', () => {
  it('sums query costs without executing', () => {
    expect(estimateCost('{ person(email:"a@b.com"){ full_name } company(domain:"b.com"){ name } }'))
      .toBe(QUERIES.person.creditCost + QUERIES.company.creditCost);
    expect(estimateCost('not valid')).toBe(0);
  });
});
