/**
 * GraphQL gateway — schema definition (single source of truth, client-safe).
 *
 * A typed schema over the same enrichment data the REST gateway serves, so a
 * developer can query exactly the fields they need — walking person → employer
 * in one call. This module carries only the *shape* (types, fields, queries,
 * args, per-query credit cost) and an SDL renderer; it imports no resolvers, so
 * the Explorer page can render the schema browser without pulling server code
 * into the client bundle. The executor (server) pairs it with `resolvers.ts`.
 *
 * Field names deliberately match the REST/JSON field names (snake_case), so a
 * GraphQL result is identical to the REST payload for the same fields — one
 * data shape, two query languages. No divergence to reconcile.
 */

/** A field on an object type. `type` is a scalar name or another object type; `list` wraps it in [ ]. */
export interface GqlField {
  name: string;
  type: string;
  list?: boolean;
  description: string;
}

export interface GqlType {
  name: string;
  description: string;
  fields: GqlField[];
}

export interface GqlArg {
  name: string;
  type: 'String' | 'Int';
  required: boolean;
  example: string;
  description: string;
}

/** A top-level query field. `resolverKey` links to the server resolver map. */
export interface GqlQuery {
  name: string;
  args: GqlArg[];
  returnType: string;
  creditCost: number;
  description: string;
  resolverKey: string;
}

export const SCALARS = ['String', 'Int', 'Float', 'Boolean', 'ID'] as const;

export const TYPES: Record<string, GqlType> = {
  Person: {
    name: 'Person',
    description: 'A resolved individual, keyed by work email.',
    fields: [
      { name: 'id', type: 'ID', description: 'Persistent Zinbit identity id.' },
      { name: 'email', type: 'String', description: 'The work email queried.' },
      { name: 'email_verified', type: 'Boolean', description: 'Whether the mailbox is deliverable.' },
      { name: 'first_name', type: 'String', description: 'Given name.' },
      { name: 'last_name', type: 'String', description: 'Family name.' },
      { name: 'full_name', type: 'String', description: 'Full display name.' },
      { name: 'title', type: 'String', description: 'Current job title.' },
      { name: 'seniority', type: 'String', description: 'Normalized seniority tier.' },
      { name: 'department', type: 'String', description: 'Functional department.' },
      { name: 'company', type: 'String', description: 'Current employer name.' },
      { name: 'company_domain', type: 'String', description: 'Employer primary domain.' },
      { name: 'phone', type: 'String', description: 'Direct phone (masked on live keys).' },
      { name: 'phone_verified', type: 'Boolean', description: 'Whether the phone is reachable.' },
      { name: 'location', type: 'String', description: 'City / region.' },
      { name: 'timezone', type: 'String', description: 'IANA timezone.' },
      { name: 'linkedin_url', type: 'String', description: 'LinkedIn profile URL.' },
      { name: 'github_url', type: 'String', description: 'GitHub profile URL, when known.' },
      { name: 'twitter_url', type: 'String', description: 'X/Twitter profile URL, when known.' },
      { name: 'confidence', type: 'Float', description: 'Overall match confidence, 0–1.' },
      { name: 'is_personal_email', type: 'Boolean', description: 'True for consumer mailboxes.' },
      { name: 'last_verified', type: 'String', description: 'ISO date the record was last verified.' },
      { name: 'sources', type: 'String', list: true, description: 'Contributing data sources.' },
      { name: 'employer', type: 'Company', description: 'The employer, resolved from the email domain — the graph join.' },
    ],
  },
  Company: {
    name: 'Company',
    description: 'A resolved company, keyed by domain or inferred from an IP.',
    fields: [
      { name: 'id', type: 'ID', description: 'Persistent company id.' },
      { name: 'domain', type: 'String', description: 'Primary domain.' },
      { name: 'name', type: 'String', description: 'Company name.' },
      { name: 'legal_name', type: 'String', description: 'Registered legal name.' },
      { name: 'description', type: 'String', description: 'One-line company description.' },
      { name: 'industry', type: 'String', description: 'Primary industry.' },
      { name: 'sub_industry', type: 'String', description: 'Sub-industry.' },
      { name: 'type', type: 'String', description: 'Ownership type (private/public/…).' },
      { name: 'employee_count', type: 'Int', description: 'Estimated headcount.' },
      { name: 'employee_band', type: 'String', description: 'Headcount band.' },
      { name: 'revenue_band', type: 'String', description: 'Estimated revenue band.' },
      { name: 'founded_year', type: 'Int', description: 'Year founded.' },
      { name: 'hq_city', type: 'String', description: 'Headquarters city.' },
      { name: 'hq_country', type: 'String', description: 'Headquarters country.' },
      { name: 'timezone', type: 'String', description: 'HQ timezone.' },
      { name: 'tech_stack', type: 'String', list: true, description: 'Detected technologies.' },
      { name: 'funding_stage', type: 'String', description: 'Latest funding stage.' },
      { name: 'total_raised_usd', type: 'Int', description: 'Total raised, USD.' },
      { name: 'linkedin_url', type: 'String', description: 'Company LinkedIn URL.' },
      { name: 'twitter_url', type: 'String', description: 'Company X/Twitter URL, when known.' },
      { name: 'logo_initials', type: 'String', description: 'Initials for a fallback logo.' },
      { name: 'confidence', type: 'Float', description: 'Overall match confidence, 0–1.' },
      { name: 'last_verified', type: 'String', description: 'ISO date last verified.' },
    ],
  },
};

export const QUERIES: Record<string, GqlQuery> = {
  person: {
    name: 'person',
    args: [{ name: 'email', type: 'String', required: true, example: 'jane@stripe.com', description: 'A work email to resolve.' }],
    returnType: 'Person',
    creditCost: 2,
    description: 'Resolve a person from a work email — with their employer available as a nested join.',
    resolverKey: 'person',
  },
  company: {
    name: 'company',
    args: [{ name: 'domain', type: 'String', required: true, example: 'stripe.com', description: 'A company domain to enrich.' }],
    returnType: 'Company',
    creditCost: 1,
    description: 'Enrich a company from its domain.',
    resolverKey: 'company',
  },
  companyByIp: {
    name: 'companyByIp',
    args: [{ name: 'ip', type: 'String', required: true, example: '8.8.8.8', description: 'An IPv4 address to reverse to a company.' }],
    returnType: 'Company',
    creditCost: 2,
    description: 'Reverse an IP address to the company that owns it.',
    resolverKey: 'companyByIp',
  },
};

/** Is this type name a scalar (leaf), vs. an object type that needs a selection set? */
export const isScalarType = (typeName: string): boolean => (SCALARS as readonly string[]).includes(typeName);

/** Render the schema as GraphQL SDL — powers the Explorer's schema browser and GET /api/graphql. */
export function buildSDL(): string {
  const lines: string[] = ['"""', 'Zinbit GraphQL Gateway — query the enrichment graph in one call.', '"""', 'type Query {'];
  for (const q of Object.values(QUERIES)) {
    const args = q.args.map((a) => `${a.name}: ${a.type}${a.required ? '!' : ''}`).join(', ');
    lines.push(`  "${q.description} (${q.creditCost} credit${q.creditCost === 1 ? '' : 's'})"`);
    lines.push(`  ${q.name}(${args}): ${q.returnType}`);
  }
  lines.push('}', '');
  for (const t of Object.values(TYPES)) {
    lines.push(`"${t.description}"`, `type ${t.name} {`);
    for (const f of t.fields) {
      const ft = f.list ? `[${f.type}]` : f.type;
      lines.push(`  "${f.description}"`, `  ${f.name}: ${ft}`);
    }
    lines.push('}', '');
  }
  return lines.join('\n').trim();
}

/** A ready-to-run example query for the Explorer. */
export const EXAMPLE_QUERY = `# Walk person → employer in one call, selecting only what you need.
query Resolve {
  person(email: "jane@stripe.com") {
    full_name
    title
    seniority
    employer {
      name
      industry
      employee_count
      funding_stage
    }
  }
}`;
