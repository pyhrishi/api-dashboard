export type ApiScope = 'identity:read' | 'corporate:read' | 'search:execute' | '*';

export const ScopeEndpointMap: Record<ApiScope, string[]> = {
  '*': ['*'],
  'identity:read': ['/v1/people/phone', '/v1/people/email', '/v1/people/linkedin/contact', '/v1/people/linkedin', '/v1/directors/phone'],
  'corporate:read': ['/v1/companies/cin', '/v1/companies', '/v1/companies/linkedin', '/v1/people/linkedin/profile', '/v1/batch/companies/enrich'],
  'search:execute': ['/v1/people', '/v2/people', '/v1/people/search/ai', '/v1/enrichment/reverse', '/v1/companies/employees', '/v1/identity/resolve']
};
