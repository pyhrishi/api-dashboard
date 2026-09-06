/**
 * GraphQL gateway — server resolver map.
 *
 * Pairs each schema query with the SAME deterministic resolver the REST gateway
 * uses, so GraphQL and REST never disagree. The `person` resolver performs the
 * graph join the schema advertises: it resolves the employer from the person's
 * email domain and attaches it as `employer`, so a single query can walk
 * person → company. Returns a plain object graph (or null); the executor does
 * the field projection.
 *
 * Imported only by the executor/route (server + jest), never by the client
 * Explorer — keeps resolver code out of the browser bundle.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';
import { resolveCompanyFromDomain } from '@/lib/company-resolver';
import { resolveCompanyFromIp } from '@/lib/ip-resolver';

export type GqlResolver = (args: Record<string, string>) => object | null;

export const RESOLVERS: Record<string, GqlResolver> = {
  person: (args) => {
    const person = resolvePersonFromEmail(args.email ?? '');
    if (!person) return null;
    // The graph join the schema promises: employer resolved from the email domain.
    const employer = person.company_domain ? resolveCompanyFromDomain(person.company_domain) : null;
    return { ...person, employer };
  },
  company: (args) => resolveCompanyFromDomain(args.domain ?? ''),
  companyByIp: (args) => {
    const intel = resolveCompanyFromIp(args.ip ?? '');
    // The Company node lives under `.company` on the IP intel; null for non-corporate IPs.
    return intel?.company ?? null;
  },
};
