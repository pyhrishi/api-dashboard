// Representative top endpoints for the analytics dashboard. Paths mirror the
// canonical catalog (src/data/endpoints.ts) and the metric seed in lib/store.ts.
export const ENDPOINTS = [
  { id: 'all', label: 'All Endpoints', color: '#46BDC6' },
  { id: '/v1/people/phone', label: 'GET /v1/people/phone', color: '#46BDC6' },
  { id: '/v1/people', label: 'GET /v1/people', color: '#207C82' },
  { id: '/v1/companies', label: 'GET /v1/companies', color: '#5865F2' },
  { id: '/v1/companies/employees', label: 'GET /v1/companies/employees', color: '#C47B0A' },
];
