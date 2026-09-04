import { PhoneCall, Mail, Globe2, SearchCheck, Building2, Landmark, Users, Fingerprint, Briefcase } from 'lucide-react';
import React from 'react';
import { ENDPOINTS, type Endpoint } from '@/data/endpoints';
import { generateCodeSamples } from '@/lib/codeSampleGenerator';

/**
 * Landing-page API catalog for the IntegrationTerminal "IDE".
 *
 * This is a DERIVED view of the single source of truth (src/data/endpoints.ts):
 * the endpoint names, paths and code snippets come straight from the real
 * catalog + generator, so the marketing surface can never drift from the docs,
 * console Explorer, OpenAPI spec, or CLI. We only curate here which endpoints to
 * feature, their category grouping, an icon, an illustrative response, and a
 * latency badge for the terminal theatre.
 */

export type ApiCategory = 'people' | 'company' | 'identity';

export interface CodeSnippets {
  curl: string;
  node: string;
  python: string;
}

export interface ApiEndpoint {
  id: string;
  categoryId: ApiCategory;
  name: string;
  icon: React.ReactNode;
  desc: string;
  snippets: CodeSnippets;
  response: string;
  latency: string;
}

export const CATEGORIES: { id: ApiCategory; name: string }[] = [
  { id: 'people', name: 'People Intelligence' },
  { id: 'company', name: 'Company Intelligence' },
  { id: 'identity', name: 'Identity Resolution' }
];

/** Per-featured-endpoint presentation data. Keyed by the real endpoint `id`. */
interface FeatureMeta {
  categoryId: ApiCategory;
  icon: React.ReactNode;
  latency: string;
  response: string;
}

const FEATURED: Record<string, FeatureMeta> = {
  'email-to-phone': {
    categoryId: 'people',
    icon: <PhoneCall className="w-4 h-4" />,
    latency: '85ms',
    response: `{
  "status": "success",
  "credits_charged": 2,
  "data": {
    "email": "ceo@example.com",
    "person_name": "Jane Doe",
    "phone": "+1 (555) 123-4567",
    "line_type": "mobile",
    "confidence_score": 0.98
  }
}`
  },
  'phone-to-email': {
    categoryId: 'people',
    icon: <Mail className="w-4 h-4" />,
    latency: '92ms',
    response: `{
  "status": "success",
  "credits_charged": 2,
  "data": {
    "phone": "+1 (555) 123-4567",
    "email": "jane.doe@example.com",
    "email_verified": true,
    "confidence_score": 0.95
  }
}`
  },
  'linkedin-to-profile': {
    categoryId: 'people',
    icon: <Globe2 className="w-4 h-4" />,
    latency: '140ms',
    response: `{
  "status": "success",
  "credits_charged": 3,
  "data": {
    "full_name": "Jane Doe",
    "headline": "VP of Engineering at Example Inc",
    "location": "San Francisco, CA",
    "current_company": "Example Inc",
    "experience_years": 12
  }
}`
  },
  'people-ai-search': {
    categoryId: 'people',
    icon: <SearchCheck className="w-4 h-4" />,
    latency: '210ms',
    response: `{
  "status": "success",
  "credits_charged": 5,
  "query": "VPs of Sales at SaaS startups in Bangalore",
  "result_count": 42,
  "data": [
    { "name": "Arjun Mehta", "title": "VP Sales", "company": "CloudScale" }
  ]
}`
  },
  'domain-to-cin': {
    categoryId: 'company',
    icon: <Building2 className="w-4 h-4" />,
    latency: '76ms',
    response: `{
  "status": "success",
  "credits_charged": 1,
  "data": {
    "domain": "example.in",
    "cin": "U72900KA2021PTC142000",
    "legal_name": "Example India Pvt Ltd",
    "status": "Active"
  }
}`
  },
  'cin-to-company-data': {
    categoryId: 'company',
    icon: <Landmark className="w-4 h-4" />,
    latency: '110ms',
    response: `{
  "status": "success",
  "credits_charged": 3,
  "data": {
    "cin": "U72900KA2021PTC142000",
    "legal_name": "Example India Pvt Ltd",
    "incorporation_date": "2021-03-14",
    "paid_up_capital": "₹1,00,00,000",
    "directors": 3
  }
}`
  },
  'company-employees': {
    categoryId: 'company',
    icon: <Users className="w-4 h-4" />,
    latency: '155ms',
    response: `{
  "status": "success",
  "credits_charged": 2,
  "pagination": { "next_cursor": "ZXlKdi...", "has_more": true },
  "data": [
    { "name": "Priya Nair", "title": "Staff Engineer", "department": "Engineering" }
  ]
}`
  },
  'identity-resolve': {
    categoryId: 'identity',
    icon: <Fingerprint className="w-4 h-4" />,
    latency: '95ms',
    response: `{
  "status": "success",
  "credits_charged": 3,
  "input_type": "email",
  "data": {
    "resolved": true,
    "person_id": "prs_9f2c8a",
    "name": "Jane Doe",
    "company": "Example Inc"
  }
}`
  },
  'din-to-phone': {
    categoryId: 'identity',
    icon: <Briefcase className="w-4 h-4" />,
    latency: '120ms',
    response: `{
  "status": "success",
  "credits_charged": 2,
  "data": {
    "din": "09876543",
    "director_name": "Rahul Verma",
    "phone": "+91 98765 43210",
    "associated_companies": 4
  }
}`
  }
};

/** Build canonical curl/node/python snippets for an endpoint from its example params. */
function buildSnippets(endpoint: Endpoint): CodeSnippets {
  const parameters = Object.fromEntries(
    endpoint.parameters
      .filter(p => p.required)
      .map(p => [p.name, p.example])
  );
  const samples = generateCodeSamples({ endpoint, parameters, apiKey: 'sk_live_••••••' });
  return { curl: samples.curl, node: samples.nodejs, python: samples.python };
}

export const API_CATALOG: ApiEndpoint[] = Object.entries(FEATURED)
  .map(([id, meta]) => {
    const endpoint = ENDPOINTS.find(e => e.id === id);
    if (!endpoint) return null;
    return {
      id: endpoint.id,
      categoryId: meta.categoryId,
      name: endpoint.name,
      icon: meta.icon,
      desc: endpoint.description,
      snippets: buildSnippets(endpoint),
      response: meta.response,
      latency: meta.latency
    };
  })
  .filter((e): e is ApiEndpoint => e !== null);
