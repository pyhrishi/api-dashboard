/**
 * gRPC high-throughput channel — schema definition (single source of truth, client-safe).
 *
 * A protobuf service over the same enrichment data the REST + GraphQL gateways
 * serve, for enterprise-scale ingestion: unary calls for one-offs and bidirectional
 * streaming methods that push thousands of records over a single multiplexed HTTP/2
 * channel. This module carries only the *shape* (proto messages, methods, per-call
 * credit cost) and a `.proto` renderer; it imports no resolvers, so the console can
 * render the schema + client snippets without pulling server code into the bundle.
 * The transcoder (server) pairs it with the resolvers.
 *
 * Field names deliberately match the REST/JSON + GraphQL field names (snake_case),
 * so a gRPC message decodes to the same shape as a REST payload — one data model,
 * three protocols. Browsers can't speak raw gRPC (HTTP/2 trailers), so the live
 * channel is exposed via gRPC-JSON transcoding (Connect-style) over POST /api/grpc.
 */

export const GRPC_PACKAGE = 'zinbit.enrichment.v1';
export const GRPC_SERVICE = 'EnrichmentService';

export type ProtoScalar = 'string' | 'int32' | 'int64' | 'double' | 'bool';
export type RpcType = 'unary' | 'server_stream' | 'client_stream' | 'bidi_stream';

export interface ProtoField {
  name: string;
  type: ProtoScalar;
  tag: number;
  repeated?: boolean;
  description: string;
}

export interface ProtoMessage {
  name: string;
  description: string;
  fields: ProtoField[];
}

export interface RpcMethod {
  name: string;
  rpcType: RpcType;
  requestType: string;
  responseType: string;
  /** Credits per message (a stream bills per record). */
  creditCost: number;
  description: string;
  /** Links to the server transcoder's resolver map. */
  resolverKey: string;
}

// ── Messages (field names mirror REST/GraphQL exactly) ───────────────────────

const PERSON_FIELDS: ProtoField[] = [
  { name: 'id', type: 'string', tag: 1, description: 'Persistent Zinbit identity id.' },
  { name: 'email', type: 'string', tag: 2, description: 'The work email queried.' },
  { name: 'email_verified', type: 'bool', tag: 3, description: 'Whether the mailbox is deliverable.' },
  { name: 'first_name', type: 'string', tag: 4, description: 'Given name.' },
  { name: 'last_name', type: 'string', tag: 5, description: 'Family name.' },
  { name: 'full_name', type: 'string', tag: 6, description: 'Full display name.' },
  { name: 'title', type: 'string', tag: 7, description: 'Current job title.' },
  { name: 'seniority', type: 'string', tag: 8, description: 'Normalized seniority tier.' },
  { name: 'department', type: 'string', tag: 9, description: 'Functional department.' },
  { name: 'company', type: 'string', tag: 10, description: 'Current employer name.' },
  { name: 'company_domain', type: 'string', tag: 11, description: 'Employer primary domain.' },
  { name: 'phone', type: 'string', tag: 12, description: 'Direct phone (masked on live keys).' },
  { name: 'location', type: 'string', tag: 13, description: 'City / region.' },
  { name: 'linkedin_url', type: 'string', tag: 14, description: 'LinkedIn profile URL.' },
  { name: 'confidence', type: 'double', tag: 15, description: 'Overall match confidence, 0–1.' },
  { name: 'sources', type: 'string', tag: 16, repeated: true, description: 'Contributing data sources.' },
];

const COMPANY_FIELDS: ProtoField[] = [
  { name: 'id', type: 'string', tag: 1, description: 'Persistent company id.' },
  { name: 'domain', type: 'string', tag: 2, description: 'Primary domain.' },
  { name: 'name', type: 'string', tag: 3, description: 'Company name.' },
  { name: 'legal_name', type: 'string', tag: 4, description: 'Registered legal name.' },
  { name: 'industry', type: 'string', tag: 5, description: 'Primary industry.' },
  { name: 'sub_industry', type: 'string', tag: 6, description: 'Sub-industry.' },
  { name: 'type', type: 'string', tag: 7, description: 'Ownership type.' },
  { name: 'employee_count', type: 'int32', tag: 8, description: 'Estimated headcount.' },
  { name: 'employee_band', type: 'string', tag: 9, description: 'Headcount band.' },
  { name: 'revenue_band', type: 'string', tag: 10, description: 'Estimated revenue band.' },
  { name: 'founded_year', type: 'int32', tag: 11, description: 'Year founded.' },
  { name: 'hq_city', type: 'string', tag: 12, description: 'Headquarters city.' },
  { name: 'hq_country', type: 'string', tag: 13, description: 'Headquarters country.' },
  { name: 'tech_stack', type: 'string', tag: 14, repeated: true, description: 'Detected technologies.' },
  { name: 'funding_stage', type: 'string', tag: 15, description: 'Latest funding stage.' },
  { name: 'total_raised_usd', type: 'int64', tag: 16, description: 'Total raised, USD.' },
  { name: 'confidence', type: 'double', tag: 17, description: 'Overall match confidence, 0–1.' },
];

export const MESSAGES: Record<string, ProtoMessage> = {
  EnrichCompanyRequest: { name: 'EnrichCompanyRequest', description: 'Look up a company by domain.', fields: [{ name: 'domain', type: 'string', tag: 1, description: 'Company domain to enrich.' }] },
  EnrichPersonRequest: { name: 'EnrichPersonRequest', description: 'Look up a person by work email.', fields: [{ name: 'email', type: 'string', tag: 1, description: 'Work email to resolve.' }] },
  CompanyByIpRequest: { name: 'CompanyByIpRequest', description: 'Reverse an IP to a company.', fields: [{ name: 'ip', type: 'string', tag: 1, description: 'IPv4 address.' }] },
  Person: { name: 'Person', description: 'A resolved individual.', fields: PERSON_FIELDS },
  Company: { name: 'Company', description: 'A resolved company.', fields: COMPANY_FIELDS },
};

// ── Methods ──────────────────────────────────────────────────────────────────

export const METHODS: Record<string, RpcMethod> = {
  EnrichCompany: { name: 'EnrichCompany', rpcType: 'unary', requestType: 'EnrichCompanyRequest', responseType: 'Company', creditCost: 1, description: 'Enrich a single company from its domain.', resolverKey: 'company' },
  EnrichPerson: { name: 'EnrichPerson', rpcType: 'unary', requestType: 'EnrichPersonRequest', responseType: 'Person', creditCost: 2, description: 'Resolve a single person from a work email.', resolverKey: 'person' },
  CompanyByIp: { name: 'CompanyByIp', rpcType: 'unary', requestType: 'CompanyByIpRequest', responseType: 'Company', creditCost: 2, description: 'Reverse an IP address to the company that owns it.', resolverKey: 'companyByIp' },
  BatchEnrichCompanies: { name: 'BatchEnrichCompanies', rpcType: 'bidi_stream', requestType: 'EnrichCompanyRequest', responseType: 'Company', creditCost: 1, description: 'Bidirectional stream — push company domains and receive enriched records over one multiplexed channel. Enterprise-scale throughput.', resolverKey: 'company' },
  StreamEnrichPeople: { name: 'StreamEnrichPeople', rpcType: 'bidi_stream', requestType: 'EnrichPersonRequest', responseType: 'Person', creditCost: 2, description: 'Bidirectional stream — push work emails and receive resolved people as they complete.', resolverKey: 'person' },
};

/** The request field name for a method (the single input key its message carries). */
export function inputKeyFor(method: RpcMethod): 'domain' | 'email' | 'ip' {
  const req = MESSAGES[method.requestType];
  return (req?.fields[0]?.name ?? 'domain') as 'domain' | 'email' | 'ip';
}

export const isStreaming = (m: RpcMethod): boolean => m.rpcType === 'server_stream' || m.rpcType === 'client_stream' || m.rpcType === 'bidi_stream';

const RPC_SIGNATURE: Record<RpcType, (req: string, res: string) => string> = {
  unary: (req, res) => `(${req}) returns (${res})`,
  server_stream: (req, res) => `(${req}) returns (stream ${res})`,
  client_stream: (req, res) => `(stream ${req}) returns (${res})`,
  bidi_stream: (req, res) => `(stream ${req}) returns (stream ${res})`,
};

/** Render the schema as a proto3 `.proto` file — powers GET /api/grpc + the console. */
export function renderProto(): string {
  const lines: string[] = [
    'syntax = "proto3";', '',
    `package ${GRPC_PACKAGE};`, '',
    `// Zinbit Enrichment — high-throughput gRPC channel.`,
    `service ${GRPC_SERVICE} {`,
  ];
  for (const m of Object.values(METHODS)) {
    lines.push(`  // ${m.description} (${m.creditCost} credit${m.creditCost === 1 ? '' : 's'}/record)`);
    lines.push(`  rpc ${m.name} ${RPC_SIGNATURE[m.rpcType](m.requestType, m.responseType)};`);
  }
  lines.push('}', '');
  for (const msg of Object.values(MESSAGES)) {
    lines.push(`// ${msg.description}`, `message ${msg.name} {`);
    for (const f of msg.fields) {
      lines.push(`  ${f.repeated ? 'repeated ' : ''}${f.type} ${f.name} = ${f.tag};`);
    }
    lines.push('}', '');
  }
  return lines.join('\n').trim();
}
