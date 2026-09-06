/**
 * Endpoint Metadata Structure
 * The single source of truth for the Zinbit API catalog — every endpoint with its
 * parameters, descriptions, credit costs, and next-step recommendations.
 * Consumed by the docs, Endpoint Explorer, code generators, OpenAPI/Postman specs,
 * the CLI, and the landing-page catalog (lib/api-catalog.tsx).
 */

export type ParameterType = 'string' | 'email' | 'phone' | 'number' | 'array';
export type HTTPMethod = 'GET' | 'POST' | 'DELETE';
export type NextStepCategory = 'sdks' | 'logging' | 'webhooks' | 'errorHandling';

export interface EndpointParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  example: string;
  placeholder?: string;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
}

export interface NextStepRecommendation {
  id: string;
  title: string;
  description: string;
  category: NextStepCategory;
  link: string; // internal route or external URL
}

export interface Endpoint {
  id: string;
  name: string;
  description: string; // 1-2 sentences
  method: HTTPMethod;
  path: string;
  version?: 'v1' | 'v2';
  creditCost: number;
  isRecommendedForFirstCall: boolean;
  parameters: EndpointParameter[];
  nextStepRecommendations: NextStepRecommendation[];
  isDeprecated?: boolean;
  sunsetDate?: string;
  replacementEndpointId?: string;
}

/**
 * The complete Zinbit API endpoint catalog.
 */
export const ENDPOINTS: Endpoint[] = [
  {
    id: 'company-employees',
    name: 'Company Employees',
    description: 'Retrieve a paginated list of employees for a given company domain using cursor-based pagination.',
    method: 'GET',
    path: '/v1/companies/employees',
    creditCost: 2,
    isRecommendedForFirstCall: true,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The domain of the company (e.g., acme.com)',
        example: 'acme.com',
        placeholder: 'Enter company domain',
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        description: 'Maximum number of records to return per page (max 100)',
        example: '10',
        placeholder: '10',
        maxValue: 100,
        minValue: 1,
      },
      {
        name: 'cursor',
        type: 'string',
        required: false,
        description: 'Cursor token for fetching the next page of results',
        example: 'eyJvZmZzZXQiOjEwfQ==',
        placeholder: 'Leave blank for first page',
      },
      {
        name: 'department',
        type: 'string',
        required: false,
        description: 'Filter employees by department',
        example: 'Engineering',
        placeholder: 'e.g., Engineering, Sales',
      },
      {
        name: 'sort',
        type: 'string',
        required: false,
        description: 'Sort by one or more fields, comma-separated; prefix a field with "-" for descending (e.g. -department,name). (F-078)',
        example: '-name,department',
        placeholder: '-name,department',
      },
      {
        name: 'filter',
        type: 'string',
        required: false,
        description: 'Filter clauses "field:op:value", comma-separated (ANDed). Operators: eq, ne, gt, gte, lt, lte, contains, startsWith, endsWith, in ("in" takes a pipe list). E.g. department:in:Sales|Engineering,name:contains:smith. (F-078)',
        example: 'department:eq:Engineering',
        placeholder: 'department:eq:Engineering',
        maxLength: 300,
      }
    ],
    nextStepRecommendations: [
      {
        id: 'pagination-guide',
        title: 'Implementing Pagination',
        description: 'Learn how to traverse large employee datasets efficiently using our cursor-based pagination.',
        category: 'sdks',
        link: '/docs#pagination'
      }
    ]
  },
  {
    id: 'people-search',
    name: 'People Search',
    description: 'Search for a person by email, name, or phone. Returns contact details, company info, and professional data.',
    method: 'GET',
    path: '/v1/people',
    creditCost: 1,
    isRecommendedForFirstCall: true,
    isDeprecated: true,
    sunsetDate: '2027-01-15T00:00:00Z',
    replacementEndpointId: 'v2-people-search',
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email address to search for',
        example: 'john.doe@acme.com',
        placeholder: 'user@example.com',
      },
      {
        name: 'first_name',
        type: 'string',
        required: false,
        description: 'Optional: First name for additional filtering',
        example: 'John',
        placeholder: 'John',
        maxLength: 50,
      },
      {
        name: 'last_name',
        type: 'string',
        required: false,
        description: 'Optional: Last name for additional filtering',
        example: 'Doe',
        placeholder: 'Doe',
        maxLength: 50,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'sdk-nodejs',
        title: 'Node.js SDK',
        description: 'Install our official Node.js SDK for easier integration and batching.',
        category: 'sdks',
        link: '/console/sdks?lang=nodejs',
      },
      {
        id: 'request-logging',
        title: 'Enable Request Logging',
        description: 'Monitor all API requests and responses in real-time from your dashboard.',
        category: 'logging',
        link: '/console/logs',
      },
      {
        id: 'webhooks-setup',
        title: 'Set Up Webhooks',
        description: 'Get notified when contact data is updated with real-time webhooks.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'email-to-phone',
    name: 'Find Phone by Email',
    description: 'Append a verified phone number to any corporate email — with line type, live-status verification, carrier, region, and Do-Not-Call (DNC) standing. 99.2% coverage on US B2B contacts.',
    method: 'GET',
    path: '/v1/people/phone',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Corporate email address',
        example: 'john.doe@acme.com',
        placeholder: 'user@company.com',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'batch-processing',
        title: 'Batch Processing',
        description: 'Upload CSV files to process thousands of emails at once.',
        category: 'sdks',
        link: '/console/explorer?endpoint=batch-email-to-phone',
      },
      {
        id: 'error-handling',
        title: 'Error Handling Guide',
        description: 'Learn how to gracefully handle invalid emails and API errors.',
        category: 'errorHandling',
        link: '/docs/error-codes',
      },
    ],
  },

  {
    id: 'phone-to-email',
    name: 'Find Email by Phone',
    description: 'Reverse lookup a mobile or landline number to find the associated corporate email and contact info.',
    method: 'GET',
    path: '/v1/people/email',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'phone',
        type: 'phone',
        required: true,
        description: 'Phone number (10-15 digits, no formatting required)',
        example: '5551234567',
        placeholder: '555-123-4567',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'sdk-python',
        title: 'Python SDK',
        description: 'Use our Python library for data science and ML workflows.',
        category: 'sdks',
        link: '/console/sdks?lang=python',
      },
    ],
  },

  {
    id: 'linkedin-to-profile',
    name: 'LinkedIn to Profile Data',
    description: 'Extract rich, structured JSON data from a LinkedIn profile URL including current role, experience, and education.',
    method: 'GET',
    path: '/v1/people/linkedin/profile',
    creditCost: 3,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'linkedin_url',
        type: 'string',
        required: true,
        description: 'Full LinkedIn profile URL',
        example: 'https://www.linkedin.com/in/john-doe-123',
        placeholder: 'https://www.linkedin.com/in/username',
        maxLength: 500,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'crm-integration',
        title: 'CRM Integration',
        description: 'Automatically sync LinkedIn data to your CRM system.',
        category: 'logging',
        link: '/console/integrations',
      },
    ],
  },

  {
    id: 'linkedin-to-contact',
    name: 'LinkedIn to Contact',
    description: 'Resolve a LinkedIn URL to verified email addresses and direct-dial phone numbers with high confidence scoring.',
    method: 'GET',
    path: '/v1/people/linkedin/contact',
    creditCost: 4,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'linkedin_url',
        type: 'string',
        required: true,
        description: 'Full LinkedIn profile URL',
        example: 'https://www.linkedin.com/in/john-doe-123',
        placeholder: 'https://www.linkedin.com/in/username',
        maxLength: 500,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'verification-confidence',
        title: 'Understanding Confidence Scores',
        description: 'Learn how to interpret confidence scores for contact verification.',
        category: 'errorHandling',
        link: '/docs/confidence-scores',
      },
    ],
  },

  {
    id: 'domain-to-cin',
    name: 'Domain to CIN',
    description: 'Map any company domain to its official Ministry of Corporate Affairs (MCA) Corporate Identity Number (CIN).',
    method: 'GET',
    path: '/v1/companies/cin',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain (e.g., acme.com)',
        example: 'acme.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'financial-data',
        title: 'Financial Data Overlay',
        description: 'Access audited financial data and compliance information via CIN.',
        category: 'sdks',
        link: '/console/explorer?endpoint=cin-to-company-data',
      },
    ],
  },

  {
    id: 'cin-to-company-data',
    name: 'CIN to Company Data',
    description: 'Retrieve verified financial, compliance, and legal entity data using a Corporate Identity Number (CIN).',
    method: 'GET',
    path: '/v1/companies',
    creditCost: 3,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'cin',
        type: 'string',
        required: true,
        description: 'Corporate Identity Number from MCA registry',
        example: 'L72900KA2020PLC123456',
        placeholder: 'L72900KA2020PLC123456',
        maxLength: 50,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'compliance-monitoring',
        title: 'Compliance Monitoring',
        description: 'Set up alerts for corporate compliance changes and filings.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'domain-to-linkedin',
    name: 'Domain to LinkedIn URL',
    description: 'Find the official company LinkedIn page URL from a bare domain name.',
    method: 'GET',
    path: '/v1/companies/linkedin',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    isDeprecated: true,
    sunsetDate: '2026-12-31',
    replacementEndpointId: 'people-ai-search',
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain',
        example: 'acme.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'company-enrichment',
        title: 'Full Company Enrichment',
        description: 'Combine with other endpoints for complete company profile.',
        category: 'logging',
        link: '/console/explorer?filter=company',
      },
    ],
  },

  {
    id: 'contact-to-linkedin',
    name: 'Contact to LinkedIn URL',
    description: 'Find a person\'s LinkedIn profile URL using their name, company, and optional job title.',
    method: 'GET',
    path: '/v1/people/linkedin',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    isDeprecated: true,
    sunsetDate: '2026-12-31',
    replacementEndpointId: 'people-ai-search',
    parameters: [
      {
        name: 'first_name',
        type: 'string',
        required: true,
        description: 'Person\'s first name',
        example: 'John',
        placeholder: 'John',
        maxLength: 50,
      },
      {
        name: 'last_name',
        type: 'string',
        required: true,
        description: 'Person\'s last name',
        example: 'Doe',
        placeholder: 'Doe',
        maxLength: 50,
      },
      {
        name: 'company_name',
        type: 'string',
        required: true,
        description: 'Current company name',
        example: 'Acme Corporation',
        placeholder: 'Company Name',
        maxLength: 100,
      },
      {
        name: 'job_title',
        type: 'string',
        required: false,
        description: 'Optional: Job title for higher accuracy',
        example: 'Software Engineer',
        placeholder: 'CTO',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'profile-sync',
        title: 'Profile Sync to CRM',
        description: 'Automatically sync LinkedIn profiles to your sales CRM.',
        category: 'logging',
        link: '/console/integrations/salesforce',
      },
    ],
  },

  {
    id: 'reverse-enrichment',
    name: 'Reverse Enrichment',
    description: 'Input an IP address, email domain, or partial footprint to identify the B2B visitor and company.',
    method: 'GET',
    path: '/v1/enrichment/reverse',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'IP address, domain, or partial footprint (email prefix)',
        example: '192.168.1.1',
        placeholder: '192.168.1.1 or user@',
        maxLength: 255,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'visitor-tracking',
        title: 'Website Visitor Tracking',
        description: 'Identify companies visiting your website in real-time.',
        category: 'webhooks',
        link: '/console/explorer?endpoint=web-visitor-tracking',
      },
    ],
  },

  {
    id: 'din-to-phone',
    name: 'DIN to Phone',
    description: 'Map a Director Identification Number to direct contact information and corporate details.',
    method: 'GET',
    path: '/v1/directors/phone',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'din',
        type: 'string',
        required: true,
        description: 'Director Identification Number from MCA',
        example: '00123456',
        placeholder: '00123456',
        maxLength: 20,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'director-network',
        title: 'Director Network Analysis',
        description: 'Analyze director networks and corporate connections.',
        category: 'logging',
        link: '/docs/director-networks',
      },
    ],
  },

  {
    id: 'people-ai-search',
    name: 'People AI Search',
    description: 'Use natural language queries (e.g., "VP of Sales at SaaS startups in Bangalore") to search 400M+ B2B contacts.',
    method: 'POST',
    path: '/v1/people/search/ai',
    creditCost: 5,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Natural language search query',
        example: 'VP of Sales at SaaS startups in Bangalore',
        placeholder: 'Describe the person you\'re looking for',
        maxLength: 1000,
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        description: 'Maximum number of results (default: 10, max: 100)',
        example: '10',
        placeholder: '10',
        minValue: 1,
        maxValue: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'advanced-search',
        title: 'Advanced Search Filters',
        description: 'Learn advanced search syntax for precise targeting.',
        category: 'errorHandling',
        link: '/docs/ai-search-syntax',
      },
    ],
  },
  {
    id: 'batch-company-enrich',
    name: 'Batch Company Enrich',
    description: 'Enrich multiple company profiles in a single request. Perfect for processing high-volume datasets synchronously.',
    method: 'POST',
    path: '/v1/batch/companies/enrich',
    creditCost: 10,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domains',
        type: 'array',
        required: true,
        description: 'An array of company domains to enrich (max 50).',
        example: '["acme.com", "zintlr.com", "example.com"]',
        placeholder: 'e.g., ["acme.com", "zintlr.com"]',
        maxLength: 50,
      }
    ],
    nextStepRecommendations: [
      {
        id: 'ns_batch_async',
        title: 'Use Async Processing for Huge Batches',
        description: 'For payloads exceeding 50 items, use the Prefer: respond-async header to prevent connection timeouts.',
        category: 'webhooks',
        link: '/docs/async-processing'
      }
    ]
  },
  {
    id: 'identity-resolve',
    name: 'Universal Identity Resolution',
    description: 'Auto-detects the input type (email, phone, LinkedIn, domain) and resolves it to a standardized Person or Company profile.',
    method: 'GET',
    path: '/v1/identity/resolve',
    creditCost: 3,
    isRecommendedForFirstCall: true,
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'The identifier to resolve (e.g., email address, phone number, LinkedIn URL, or company domain).',
        example: 'john@acme.com',
        placeholder: 'e.g., john@acme.com or +1234567890',
        maxLength: 255,
      }
    ],
    nextStepRecommendations: [
      {
        id: 'ns_id_webhooks',
        title: 'Subscribe to Identity Updates',
        description: 'Get notified via webhook if a resolved identity changes jobs or companies.',
        category: 'webhooks',
        link: '/console/webhooks'
      }
    ]
  },
  {
    id: 'v2-people-search',
    name: 'People Search (v2 Beta)',
    description: 'Next-generation people search with enhanced data coverage, faster response times, and new social links.',
    method: 'GET',
    path: '/v2/people',
    version: 'v2',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email address to search for',
        example: 'john.doe@acme.com',
        placeholder: 'user@example.com',
      }
    ],
    nextStepRecommendations: [
      {
        id: 'v2-migration',
        title: 'Migrating to v2 API',
        description: 'Read the migration guide to update your integrations to our new v2 endpoints.',
        category: 'sdks',
        link: '/docs/v2-migration'
      }
    ]
  },

  {
    id: 'company-enrich',
    name: 'Company Enrichment',
    description: 'Enrich a bare domain into a full company profile — firmographics, headcount, revenue band, tech stack, and funding.',
    method: 'GET',
    path: '/v1/companies/enrich',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain (with or without protocol/www)',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'company-people',
        title: 'People at this company',
        description: 'List employees for an enriched company with the employees endpoint.',
        category: 'logging',
        link: '/console/explorer?endpoint=company-employees',
      },
      {
        id: 'company-webhooks',
        title: 'Monitor company changes',
        description: 'Get notified when firmographics or funding change with webhooks.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'ip-to-company',
    name: 'Reverse IP to Company',
    description: 'Identify the company behind an anonymous website visitor by their IP — with a network classification (corporate egress vs. datacenter / VPN / consumer / mobile), ISP, ASN, and geo.',
    method: 'GET',
    path: '/v1/enrichment/ip',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'ip',
        type: 'string',
        required: true,
        description: 'IPv4 or IPv6 address of the visitor',
        example: '52.38.104.17',
        placeholder: '203.0.113.42',
        maxLength: 45,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'ip-company-people',
        title: 'People at this company',
        description: 'List employees for the company behind a corporate IP.',
        category: 'logging',
        link: '/console/explorer?endpoint=company-employees',
      },
      {
        id: 'ip-webhooks',
        title: 'Deanonymize traffic live',
        description: 'Stream identified visitors to your CRM with webhooks.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'email-to-social',
    name: 'Discover Social Profiles',
    description: "Discover a person's professional social footprint from their email — LinkedIn, GitHub, X, Stack Overflow, Medium, and personal sites, each with a handle, verification, follower/reputation signal, and match confidence.",
    method: 'GET',
    path: '/v1/people/social',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Corporate or personal email address',
        example: 'jane.doe@acme.com',
        placeholder: 'user@company.com',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'social-to-person',
        title: 'Full person profile',
        description: 'Resolve the same email to a complete verified profile.',
        category: 'sdks',
        link: '/console/studio',
      },
      {
        id: 'social-webhooks',
        title: 'Watch for profile changes',
        description: "Get a webhook when a contact's social footprint changes.",
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'title-normalize',
    name: 'Normalize Job Title',
    description: 'Normalize any raw job title into a canonical title plus seniority, function, department, and management level — with the lexicon tokens behind each. Ideal for lead routing and scoring.',
    method: 'GET',
    path: '/v1/titles/normalize',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Raw job title to normalize',
        example: 'VP, Engineering',
        placeholder: 'e.g. Sr. SWE II, Head of Growth',
        maxLength: 120,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'title-to-person',
        title: 'Resolve the person',
        description: 'Pair a normalized title with a full person profile for scoring.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'firmographic-append',
    name: 'Firmographic Append',
    description: 'Append standardized firmographic classification codes to a domain — NAICS and SIC (with titles), employee and revenue bands, ownership, and entity type. The CRM-ready segmentation layer, distinct from the full company dossier.',
    method: 'GET',
    path: '/v1/companies/firmographics',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain to classify',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'firmographic-to-company',
        title: 'Full company dossier',
        description: 'Enrich the same domain into industry, tech stack, and funding.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'technographic-detect',
    name: 'Technographic Detection',
    description: "Detect the software, vendors, and infrastructure a company runs — categorized (cloud, data, security, CRM…), each technology with its detection method (DNS, HTTP header, JS fingerprint, job posting), confidence, and first/last-seen dates. Derives GTM signals (data-warehouse modernization, Salesforce-led motion, observability gaps) and a stack-spend estimate.",
    method: 'GET',
    path: '/v1/companies/technographics',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain to scan for its technology stack',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'technographic-to-company',
        title: 'Full company dossier',
        description: 'Enrich the same domain into firmographics, headcount, and funding.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'funding-signals',
    name: 'Funding & Investment Signals',
    description: "Turn a domain into a company's full funding story — a round-by-round history (Seed → Series E) with each round's date, amount, lead investor, participating investors, and post-money valuation — plus the deduplicated investor roster, total raised, and latest valuation. Anchored to the company graph, so funding never contradicts the firmographic stage. Bootstrapped, public-only, and personal domains return a clean no-funding result.",
    method: 'GET',
    path: '/v1/companies/funding',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain to look up funding history for',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'funding-to-company',
        title: 'Full company dossier',
        description: 'Enrich the same domain into industry, headcount, and tech stack.',
        category: 'sdks',
        link: '/console/studio',
      },
      {
        id: 'funding-to-signals',
        title: 'Watch for new rounds',
        description: 'Get notified when a target company raises a new round.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'company-offices',
    name: 'HQ & Office Geo-Resolution',
    description: "Resolve a domain to its headquarters — a full geocoded address (street, region, postal code, ISO country, latitude/longitude, IANA timezone, UTC offset) — and its wider office footprint: every location by function (engineering, sales, support, remote hub) with headcount, coordinates, and local time. Derives reach signals: countries, continents, follow-the-sun coverage, and the best UTC window to reach HQ. Anchored to the company graph so geography never contradicts the dossier.",
    method: 'GET',
    path: '/v1/companies/offices',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain to resolve HQ and office locations for',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'offices-to-company',
        title: 'Full company dossier',
        description: 'Enrich the same domain into industry, headcount, and tech stack.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'company-news',
    name: 'Company News & Event Feed',
    description: "Turn a domain into a chronological feed of the company's trigger events — funding rounds, leadership changes, expansions, product launches, M&A, partnerships, and hiring surges — each with a type, date, headline, source, sentiment, and a 0-100 importance score. Funding events are reconciled with the funding graph, so the feed never contradicts the funding or firmographic data. Personal-email domains return no company.",
    method: 'GET',
    path: '/v1/companies/news',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Company domain to pull recent news and events for',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'news-to-funding',
        title: 'Funding detail',
        description: 'Drill into the full round history behind a funding event.',
        category: 'sdks',
        link: '/console/studio',
      },
      {
        id: 'news-to-webhooks',
        title: 'Watch for new events',
        description: 'Get a webhook when a target company posts a new event.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'email-verify',
    name: 'Verify Email Deliverability',
    description: 'Score any email for inbox reachability before you send. Returns a 0-100 deliverability score and a decisive verdict, decomposed into every check behind it — syntax, MX, SMTP mailbox handshake, catch-all, disposable, role-based, and free-provider — each with its own result and provenance. Catches typos with a did-you-mean suggestion.',
    method: 'GET',
    path: '/v1/email/verify',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email address to verify',
        example: 'john@datadoghq.com',
        placeholder: 'user@company.com',
        maxLength: 254,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'verify-a-list',
        title: 'Verify a whole list',
        description: 'Upload a CSV and score every address before your next campaign.',
        category: 'sdks',
        link: '/console/jobs',
      },
      {
        id: 'email-to-person',
        title: 'Resolve the person',
        description: 'Turn a deliverable email into a full verified profile.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'email-domain-auth',
    name: 'Email Domain Authentication',
    description: "Inspect a domain's email sending-authentication posture — SPF record + policy, DKIM selectors, and DMARC policy/coverage — and score how well it is protected against spoofing (0-100 with a Strong/Partial/Weak/None grade and a spoofable verdict). The domain-level complement to mailbox deliverability.",
    method: 'GET',
    path: '/v1/email/domain-auth',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Domain (or email address) to inspect',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 254,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'domain-auth-to-verify',
        title: 'Verify a specific mailbox',
        description: 'Score inbox reachability for an address on this domain.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'record-validate',
    name: 'Validate a Record',
    description: 'Run cross-field consistency checks on a resolved record and catch impossible or improbable combinations single-field validation misses — email vs company domain, title vs seniority, phone vs HQ geo, name vs email. Returns an integrity score, a decisive consistent/inconsistent verdict, and a per-rule breakdown.',
    method: 'GET',
    path: '/v1/records/validate',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email of the record to validate',
        example: 'jane.doe@acme.com',
        placeholder: 'user@company.com',
        maxLength: 254,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'validate-to-person',
        title: 'See the full record',
        description: 'Resolve the same email to the complete profile behind the checks.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'email-disposable',
    name: 'Detect Disposable Email',
    description: "Flag throwaway, temporary, and anonymizing mailboxes before they reach signup. Returns a decisive verdict (disposable / suspected / trusted), the provider category, a confidence, and the reason — catching both known providers and unlisted domains that look disposable by pattern. A lightweight, single-purpose check when you don't need full deliverability scoring.",
    method: 'GET',
    path: '/v1/email/disposable',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email address to check',
        example: 'user@mailinator.com',
        placeholder: 'user@company.com',
        maxLength: 254,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'disposable-to-deliverability',
        title: 'Full deliverability score',
        description: 'Go beyond disposable — score inbox reachability with every signal.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'batch-enrich',
    name: 'Batch Enrich',
    description: 'Run one enrichment operation over many inputs in a single request and get a per-item status (matched / missed) plus a summary. Only matched items are billed. Up to 50 inputs per call — for larger lists use Bulk Jobs.',
    method: 'POST',
    path: '/v1/batch/enrich',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'operation',
        type: 'string',
        required: true,
        description: 'Which lookup to run on each input: people, company, phone, or email-verify',
        example: 'people',
        placeholder: 'people | company | phone | email-verify',
      },
      {
        name: 'inputs',
        type: 'string',
        required: true,
        description: 'Comma- or newline-separated inputs (emails for people/phone/email-verify, domains for company). Max 50.',
        example: 'jane.doe@acme.com, marcus@stripe.com, ceo@zomato.in',
        placeholder: 'a@acme.com, b@stripe.com, …',
        maxLength: 4000,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'batch-to-bulk',
        title: 'Bulk Enrichment Jobs',
        description: 'For thousands of rows or CSV uploads, run an async Bulk Job instead.',
        category: 'sdks',
        link: '/console/jobs',
      },
    ],
  },

  {
    id: 'async-job-create',
    name: 'Create Async Job',
    description: 'Kick off a long-running enrichment as an async job. POST a list of identifiers (up to 10,000) with the operation to run; the call returns immediately with a job id and a 202, and credits are charged up front for the batch. Poll the job for progress and results — the programmatic path for volumes too large to run synchronously.',
    method: 'POST',
    path: '/v1/jobs',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'endpoint',
        type: 'string',
        required: true,
        description: 'The lookup to run per input (e.g. people-search, company-enrich)',
        example: 'people-search',
        placeholder: 'people-search',
      },
      {
        name: 'inputs',
        type: 'array',
        required: true,
        description: 'Identifiers to enrich — emails for people, domains for companies (max 10,000)',
        example: '["marcus@stripe.com","priya.nair@zomato.in"]',
        placeholder: '["user@company.com", ...]',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'poll-the-job',
        title: 'Poll the job',
        description: 'Call GET /v1/jobs/{id} to watch progress and pull results when it completes.',
        category: 'sdks',
        link: '/console/async-jobs',
      },
      {
        id: 'async-webhooks',
        title: 'Get notified instead of polling',
        description: 'Wire a webhook to receive results when the job finishes.',
        category: 'webhooks',
        link: '/console/webhooks',
      },
    ],
  },

  {
    id: 'async-job-get',
    name: 'Get Async Job',
    description: 'Poll an async job by id for its live status (queued / running / completed / cancelled), progress (processed of total), matched/missed counts, and — once complete — the per-row results.',
    method: 'GET',
    path: '/v1/jobs/{id}',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'id',
        type: 'string',
        required: true,
        description: 'The job id returned by POST /v1/jobs',
        example: 'job_ab12cd34',
        placeholder: 'job_...',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'view-jobs-console',
        title: 'Async Jobs console',
        description: 'Watch every job live, with progress bars and results.',
        category: 'sdks',
        link: '/console/async-jobs',
      },
    ],
  },

  {
    id: 'async-job-list',
    name: 'List Async Jobs',
    description: 'List the recent async jobs created with your key, newest first, each with its current status and progress.',
    method: 'GET',
    path: '/v1/jobs',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'list-to-console',
        title: 'Async Jobs console',
        description: 'The same list, live-polling, in the dashboard.',
        category: 'sdks',
        link: '/console/async-jobs',
      },
    ],
  },

  {
    id: 'async-job-cancel',
    name: 'Cancel Async Job',
    description: 'Cancel an async job that has not yet completed. Already-completed jobs cannot be cancelled; a cancelled job stops advancing and returns whatever it had processed.',
    method: 'POST',
    path: '/v1/jobs/{id}/cancel',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'id',
        type: 'string',
        required: true,
        description: 'The job id to cancel',
        example: 'job_ab12cd34',
        placeholder: 'job_...',
      },
    ],
    nextStepRecommendations: [],
  },

  {
    id: 'enrich-stream',
    name: 'Streaming Inline Enrichment',
    description: "Enrich a list of identifiers over a single low-latency connection that streams each row's result as NDJSON the moment it resolves — so you process the first row while the last is still enriching, instead of waiting for the whole batch. Each line is a JSON object (a start frame, one row per input with status matched/missed/error, then an end summary). Ideal for real-time pipelines.",
    method: 'POST',
    path: '/v1/enrich/stream',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'endpoint',
        type: 'string',
        required: true,
        description: 'The lookup to run per input (people-search for emails, company-enrich for domains)',
        example: 'people-search',
        placeholder: 'people-search',
      },
      {
        name: 'inputs',
        type: 'array',
        required: true,
        description: 'Identifiers to enrich — emails for people, domains for companies (max 500)',
        example: '["marcus@stripe.com","priya.nair@zomato.in"]',
        placeholder: '["user@company.com", ...]',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'stream-console',
        title: 'Watch it stream live',
        description: 'Open the Streaming console to see rows arrive one by one.',
        category: 'sdks',
        link: '/console/stream',
      },
      {
        id: 'stream-to-async',
        title: 'Very large batches',
        description: 'For huge volumes, kick off an async job and poll it instead.',
        category: 'sdks',
        link: '/console/async-jobs',
      },
    ],
  },

  {
    id: 'hashed-email',
    name: 'Hashed-Email Lookup',
    description: 'Privacy-preserving identity resolution: enrich against a SHA-256 hash of an email address instead of the raw PII. Pass the hex digest of the lowercased, trimmed email and — if it matches an opted-in record — get back the full person (name, title, company, contact) without ever transmitting the plaintext. Ideal for GDPR-conscious and adtech match workflows.',
    method: 'GET',
    path: '/v1/identity/hashed',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email_sha256',
        type: 'string',
        required: true,
        description: 'SHA-256 hex digest of the lowercased, trimmed email (64 hex chars). An optional "sha256:" prefix is accepted.',
        example: 'a3f5b1c9e2d47680b1122a9f3e5c7d81904a6b2c3d4e5f60718293a4b5c6d7e8',
        placeholder: 'sha256 hex digest',
        maxLength: 71,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'hashed-to-studio',
        title: 'Hash an email in the Studio',
        description: 'The Studio hashes an email in your browser and looks it up — plaintext never leaves the page.',
        category: 'sdks',
        link: '/console/studio?preset=hashed-email',
      },
      {
        id: 'hashed-to-privacy',
        title: 'Privacy & compliance',
        description: 'See how hashed identifiers keep raw PII out of your enrichment pipeline.',
        category: 'errorHandling',
        link: '/console/legal',
      },
    ],
  },

  {
    id: 'fuzzy-match',
    name: 'Probabilistic Fuzzy Matching',
    description: "Resolve a messy name + company (typos, nicknames, spelling variants) to the people it most likely refers to. Returns ranked candidates each with a match probability and the per-field name/company similarity behind it (real Jaro-Winkler), a canonical interpretation of your query, and a decisive verdict (strong / likely / weak / no match). Pass the query as \"Name, Company\".",
    method: 'GET',
    path: '/v1/match/fuzzy',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'The name and company to match, as "Name, Company" (or "Name at Company")',
        example: 'Jhon Smith, Stipe',
        placeholder: 'Jane Doe, Acme',
        maxLength: 160,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'fuzzy-to-person',
        title: 'Resolve the match',
        description: 'Take the best-match email into a full person profile.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'records-dedupe',
    name: 'Entity De-duplication',
    description: "Collapse a messy list of records into golden records. Pass a \";\"-separated list of \"Name, Company\" rows (typos, nicknames, and company-vs-domain variants welcome) and get back clustered golden records — each with the merged members, every member's similarity to the golden, and a merge confidence — plus a dedup summary. Uses the same Jaro-Winkler engine as Fuzzy Matching.",
    method: 'GET',
    path: '/v1/records/dedupe',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'records',
        type: 'string',
        required: true,
        description: 'A ";"-separated list of "Name, Company" records (min 2, max 50)',
        example: 'John Smith, Stripe; Jhon Smith, Stipe; Jane Doe, Acme',
        placeholder: 'Name, Company; Name, Company; …',
        maxLength: 2000,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'dedupe-to-fuzzy',
        title: 'Score a single match',
        description: 'Use Fuzzy Matching to resolve one messy "Name, Company" to real people.',
        category: 'sdks',
        link: '/console/studio?preset=fuzzy',
      },
    ],
  },

  {
    id: 'identity-zid',
    name: 'Persistent Zinbit ID',
    description: "Resolve any identifier (a corporate email or a company domain) to its persistent Zinbit ID — a stable canonical entity ID (zid_p_… for people, zid_c_… for companies) that is the same no matter which identifier you look the entity up by, and that survives an email change. Returns the ID, the entity type, the aliases that all unify to it, and when it was first seen. Key your records on it to join and dedupe across sources.",
    method: 'GET',
    path: '/v1/identity/zid',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'A corporate email (→ person) or a company domain (→ company)',
        example: 'jane.doe@acme.com',
        placeholder: 'email or company domain',
        maxLength: 160,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'zid-to-person',
        title: 'Enrich the entity',
        description: 'Take the same identifier into a full person or company profile.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'name-canonicalize',
    name: 'Name Canonicalization',
    description: "Normalize any spelling, casing, ordering, or accenting of a personal name into one canonical form. Returns the canonical \"First Last\", an ASCII-folded form, a formal form (with prefix + suffix), the parsed components (prefix / first / middle / last / suffix), and a log of exactly what changed — reordering, nickname expansion (Bob → Robert), typo fixes, diacritic folding, and surname casing (McDonald, O'Brien, van der Berg).",
    method: 'GET',
    path: '/v1/names/canonicalize',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'The personal name to canonicalize',
        example: 'SMITH, Bob',
        placeholder: 'e.g. Dr. josé garcía jr.',
        maxLength: 120,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'name-to-fuzzy',
        title: 'Match the name',
        description: 'Use the canonical name to fuzzy-match a person at a company.',
        category: 'sdks',
        link: '/console/studio',
      },
    ],
  },

  {
    id: 'negative-cache-stats',
    name: 'Negative-Cache Stats',
    description: "Report how much spend negative-match caching has saved. The gateway remembers coverage misses (lookups that resolved to no match) for a short TTL and serves an identical repeat from cache at zero credits — this free, keyless-billed endpoint returns active cached negatives, cache hits served, total credits saved, hit rate, and the top entries.",
    method: 'GET',
    path: '/v1/cache/negative',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'negative-cache-to-billing',
        title: 'See credits saved in Billing',
        description: 'Negative-cache hits never touch your credit balance.',
        category: 'sdks',
        link: '/console/billing',
      },
    ],
  },

  {
    id: 'bounce-report',
    name: 'Report a Bounce',
    description: "Close the deliverability feedback loop: when a send hard-bounces or is marked spam, report it here and the address is suppressed — a subsequent Verify Email Deliverability call returns undeliverable with a 'reported bounce' reason. POST an email and a bounce type (hard / soft / complaint). Free, keyless-billed. Hard bounces and complaints suppress immediately; soft bounces suppress once they repeat.",
    method: 'POST',
    path: '/v1/feedback/bounce',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'The address that bounced',
        example: 'old.contact@acme.com',
        placeholder: 'user@company.com',
      },
      {
        name: 'type',
        type: 'string',
        required: false,
        description: 'Bounce type: hard, soft, or complaint (default hard)',
        example: 'hard',
        placeholder: 'hard',
        maxLength: 10,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'bounce-to-verify',
        title: 'Verify the address',
        description: 'Re-check deliverability — the suppressed address now returns undeliverable.',
        category: 'sdks',
        link: '/console/studio?preset=email-verify',
      },
    ],
  },

  {
    id: 'bounce-stats',
    name: 'Bounce Feedback Stats',
    description: 'Read the bounce feedback registry: how many addresses are suppressed, total reports, a breakdown by bounce type (hard / soft / complaint), and the most recent reports. Free, keyless-billed.',
    method: 'GET',
    path: '/v1/feedback/bounce',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'bounce-stats-to-report',
        title: 'Report a bounce',
        description: 'Feed a hard bounce back to suppress an address.',
        category: 'sdks',
        link: '/console/explorer?endpoint=bounce-report',
      },
    ],
  },

  {
    id: 'catch-all-detect',
    name: 'Catch-All Domain Detection',
    description: "Detect whether a domain is catch-all (accept-all) — one that accepts mail for any local part, so an SMTP probe can never confirm a specific mailbox exists. Returns a decisive status (catch-all / not catch-all / unknown), a confidence, the MX provider, the random-mailbox probe result, per-signal evidence, and guidance on how to enrich safely against the domain. Uses the same catch-all decision as Verify Email Deliverability, so the two never disagree.",
    method: 'GET',
    path: '/v1/email/catch-all',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The email domain to check for catch-all behavior',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 100,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'catch-all-to-verify',
        title: 'Verify a specific address',
        description: 'On a non-catch-all domain, per-mailbox verification is reliable.',
        category: 'sdks',
        link: '/console/studio?preset=email-verify',
      },
    ],
  },

  {
    id: 'correction-report',
    name: 'Report a Correction',
    description: "Report a wrong field value straight from your pipeline (F-046). POST the target identifier, the field, and the corrected value (plus the old value and a reason to speed review). The correction is triaged and lands pending in the Corrections console — a reviewer accepts it before it overlays future results, so the loop stays governed rather than a silent overwrite. Free, keyless-billed.",
    method: 'POST',
    path: '/v1/feedback/correction',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'target',
        type: 'string',
        required: true,
        description: 'The looked-up identifier the correction is about (email, domain, etc.)',
        example: 'jane.doe@acme.com',
        placeholder: 'user@company.com',
        maxLength: 200,
      },
      {
        name: 'field',
        type: 'string',
        required: true,
        description: 'The result field being corrected (e.g. Title, Phone, Location)',
        example: 'Title',
        placeholder: 'Title',
        maxLength: 60,
      },
      {
        name: 'new_value',
        type: 'string',
        required: true,
        description: 'The value it should be',
        example: 'Chief Executive Officer',
        placeholder: 'Correct value',
        maxLength: 300,
      },
      {
        name: 'old_value',
        type: 'string',
        required: false,
        description: 'The current (wrong) value, for context',
        example: 'Chief Operating Officer',
        placeholder: 'Current value',
        maxLength: 300,
      },
      {
        name: 'reason',
        type: 'string',
        required: false,
        description: 'Why the value is wrong — a specific, checkable reason triages higher',
        example: 'Promoted to CEO in July 2026 — confirmed on the company blog.',
        placeholder: 'What changed and how you know',
        maxLength: 500,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'correction-to-console',
        title: 'Review in the console',
        description: 'Reported corrections are triaged and accepted in the Corrections queue.',
        category: 'sdks',
        link: '/console/corrections',
      },
    ],
  },

  {
    id: 'correction-stats',
    name: 'Correction Feedback Stats',
    description: 'Read the correction feedback registry: total reports, how many are pending, a breakdown by AI triage verdict (likely-valid / needs-review / suspect), and the most recent reports. Free, keyless-billed.',
    method: 'GET',
    path: '/v1/feedback/correction',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'correction-stats-to-report',
        title: 'Report a correction',
        description: 'Flag a wrong field value from your pipeline.',
        category: 'sdks',
        link: '/console/explorer?endpoint=correction-report',
      },
    ],
  },

  {
    id: 'suppression-add',
    name: 'Add to Suppression List',
    description: "Add an email or domain to your do-not-contact / suppression list (F-052). Once suppressed, any enrichment lookup on that address — or any mailbox on a suppressed domain — returns 'suppressed, details withheld' at zero credits, so you can't accidentally resolve a contact you're obligated not to reach (unsubscribes, GDPR erasures, competitor blocks). Free, keyless-billed.",
    method: 'POST',
    path: '/v1/suppression',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'identifier',
        type: 'string',
        required: true,
        description: 'The email or domain to suppress. A domain suppresses every mailbox on it.',
        example: 'unsubscribed@acme.com',
        placeholder: 'user@company.com or company.com',
        maxLength: 200,
      },
      {
        name: 'reason',
        type: 'string',
        required: false,
        description: 'Why it is suppressed: unsubscribed | do_not_contact | gdpr_erasure | competitor | complaint | manual',
        example: 'unsubscribed',
        placeholder: 'unsubscribed',
        maxLength: 40,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'suppression-add-to-list',
        title: 'View the suppression list',
        description: 'See everything currently suppressed and why.',
        category: 'sdks',
        link: '/console/explorer?endpoint=suppression-list',
      },
    ],
  },

  {
    id: 'suppression-list',
    name: 'Suppression List Stats',
    description: 'Read the suppression registry: total entries, a breakdown by kind (email / domain) and reason, and the most recent additions. Free, keyless-billed.',
    method: 'GET',
    path: '/v1/suppression',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'suppression-list-to-add',
        title: 'Suppress a contact',
        description: 'Add an email or domain to the do-not-contact list.',
        category: 'sdks',
        link: '/console/explorer?endpoint=suppression-add',
      },
    ],
  },

  {
    id: 'suppression-remove',
    name: 'Remove from Suppression List',
    description: 'Remove an email or domain from the suppression list so future lookups resolve normally again. Free, keyless-billed.',
    method: 'DELETE',
    path: '/v1/suppression',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'identifier',
        type: 'string',
        required: true,
        description: 'The email or domain to remove from suppression.',
        example: 'unsubscribed@acme.com',
        placeholder: 'user@company.com or company.com',
        maxLength: 200,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'suppression-remove-to-list',
        title: 'View the suppression list',
        description: 'Confirm the current state of the registry.',
        category: 'sdks',
        link: '/console/explorer?endpoint=suppression-list',
      },
    ],
  },

  {
    id: 'text-normalize',
    name: 'Normalize Text & Encoding',
    description: "Enforce UTF-8 and normalize language variants on any messy string (F-057). Repairs mojibake (JosÃ© → José), composes to Unicode NFC, strips zero-width/control characters, detects the script(s) and a language hint, and returns both a canonical UTF-8 form and an ASCII form (transliterated for Cyrillic/Greek, diacritic-folded for Latin) — plus the exact list of transformations applied. Deterministic; the same cleanup runs upstream of name matching so records compare correctly regardless of encoding.",
    method: 'GET',
    path: '/v1/text/normalize',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'text',
        type: 'string',
        required: true,
        description: 'The raw text to normalize (a name, company, or address)',
        example: 'JosÃ© GarcÃ­a',
        placeholder: 'Paste messy or non-UTF-8 text',
        maxLength: 500,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'normalize-to-canonicalize',
        title: 'Canonicalize a name',
        description: 'Feed the clean text into name canonicalization for matching.',
        category: 'sdks',
        link: '/console/studio?preset=canonicalize',
      },
    ],
  },

  {
    id: 'idempotency-stats',
    name: 'Idempotency Registry',
    description: "Read the idempotency registry (F-061): active keys, replays served, and the credits those replays saved. To make a pipeline write idempotent (e.g. batch enrichment), send an `Idempotency-Key: <uuid>` header on the POST — the first call runs and its response is stored for 24h; any retry with the same key replays that exact response, not re-processed and not re-billed (X-Idempotency-Replayed: true). Reusing a key with a different request body returns 409 IDEMPOTENCY_KEY_REUSED. Free, keyless-billed.",
    method: 'GET',
    path: '/v1/idempotency',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'idempotency-to-console',
        title: 'Open the Idempotency console',
        description: 'See active keys, replays, and credits saved with live TTL countdowns.',
        category: 'sdks',
        link: '/console/idempotency',
      },
    ],
  },

  {
    id: 'circuits-stats',
    name: 'Circuit Breakers',
    description: "Read the per-upstream circuit breakers (F-066): each data provider's state (CLOSED / OPEN / HALF_OPEN), failure rate, trip count, cooldown, and the endpoints it powers. A failing upstream trips only its own breaker, so dependent endpoints return 503 with Retry-After and X-Upstream while everything else keeps serving. POST { upstream, mode: OPEN | CLOSED | auto } to force a breaker for a game-day drill. Free, keyless-billed.",
    method: 'GET',
    path: '/v1/circuits',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'circuits-to-console',
        title: 'Open the Circuit Breakers console',
        description: 'Watch upstream health live and run drain/reset drills.',
        category: 'sdks',
        link: '/console/circuits',
      },
    ],
  },

  {
    id: 'compression-stats',
    name: 'Compression Savings',
    description: "Read cumulative payload-compression savings (F-080): total bytes saved, overall ratio, and a per-encoding breakdown (Brotli / Gzip / uncompressed). To compress a response, send an `Accept-Encoding: br` (or `gzip`) header on any request — the gateway picks the best encoding you offered (Brotli preferred), sets Content-Encoding + Vary, and reports X-Uncompressed-Bytes / X-Compressed-Bytes / X-Compression-Ratio. Small payloads pass through uncompressed. Free, keyless-billed.",
    method: 'GET',
    path: '/v1/compression',
    creditCost: 0,
    isRecommendedForFirstCall: false,
    parameters: [],
    nextStepRecommendations: [
      {
        id: 'compression-to-console',
        title: 'Open the Compression console',
        description: 'See cumulative bandwidth saved and run a live sample.',
        category: 'sdks',
        link: '/console/compression',
      },
    ],
  },

  {
    id: 'company-hierarchy',
    name: 'Company Hierarchy',
    description: "Resolve a company's corporate family tree (F-008): the ultimate parent, intermediate parents, subsidiaries, branches, and divisions — each returned as an entity with its ownership stake, entity type, headquarters, headcount, and a registry id (CIN-style for Indian entities), so the hierarchy is anchored to registry-backed identity rather than inferred from a website. Personal or unrecognized domains return no hierarchy.",
    method: 'GET',
    path: '/v1/companies/hierarchy',
    creditCost: 3,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The company domain to resolve the corporate family for.',
        example: 'acme.com',
        placeholder: 'company.com',
        maxLength: 253,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'hierarchy-to-console',
        title: 'Visualize the family tree',
        description: 'See the whole corporate structure as an org graph.',
        category: 'sdks',
        link: '/console/hierarchy',
      },
    ],
  },

  {
    id: 'company-intent',
    name: 'Buyer Intent Signals',
    description: "Surface the topics a company is actively researching and how in-market it is (F-012). Returns a composite intent score (0–100) and a hot / warm / cool / cold tier, the topics they're surging on (with a week-over-week trend), and the contributing signals — recent funding (budget), GTM/data hiring, competitive-tech evaluation, trigger events, and content engagement — plus a recommended action. Deterministic and coherent with company enrichment, funding, and news. Personal or unrecognized domains return no intent.",
    method: 'GET',
    path: '/v1/companies/intent',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The company domain to score for buyer intent',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 253,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'intent-to-news',
        title: 'See the trigger events',
        description: 'Review the company news and events feeding the intent score.',
        category: 'sdks',
        link: '/console/studio?preset=news',
      },
    ],
  },

  {
    id: 'people-demographics',
    name: 'Demographic Append',
    description: "Append a contact's PROFESSIONAL demographics (F-014): seniority tier, department, job function, management level, decision-making / buying role, years of experience and tenure, education, and top skills — plus a composite seniority score. Compliance-native: protected characteristics (age, gender, race/ethnicity, religion) are never inferred or returned, and the response lists them under excluded_attributes. Personal or unresolvable emails return no profile.",
    method: 'GET',
    path: '/v1/people/demographics',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'The corporate email of the contact to profile.',
        example: 'jane.doe@acme.com',
        placeholder: 'user@company.com',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'demographics-to-person',
        title: 'Resolve the full person',
        description: 'Get contact details alongside the demographic signals.',
        category: 'sdks',
        link: '/console/studio?preset=person',
      },
    ],
  },

  {
    id: 'companies-job-signals',
    name: 'Job-Posting Growth Signals',
    description: "Read a company's hiring as a growth signal (F-016): open-role count, hiring velocity (surging → frozen), implied headcount growth rate, a department-by-department breakdown of where they're hiring, the specific roles, locations, seniority mix, and plain-English signals. Where a company is hiring — and how fast — is one of the earliest expansion indicators. Reuses the funding signal, so a recent raise reads as accelerated hiring. Personal or unrecognized domains return no signals.",
    method: 'GET',
    path: '/v1/companies/job-signals',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The company domain to read hiring/growth signals for.',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 253,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'job-signals-to-intent',
        title: 'Cross-check buyer intent',
        description: 'Hiring plus in-market intent is a strong expansion signal.',
        category: 'sdks',
        link: '/console/studio?preset=intent',
      },
    ],
  },

  {
    id: 'companies-merchant',
    name: 'Ecommerce Merchant Enrichment',
    description: "Detect whether a company is an ecommerce merchant and enrich the store (F-017): platform (Shopify / WooCommerce / Magento / …), business model, GMV and monthly-revenue bands, product-catalog size and top categories, average order value, payment providers, shipping regions, currencies, storefront tech stack, and a monthly-traffic band. Non-merchants come back with is_merchant:false and an explanation rather than fabricated store data. Personal or unrecognized domains return no profile.",
    method: 'GET',
    path: '/v1/companies/merchant',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The company domain to profile as an ecommerce merchant.',
        example: 'allbirds.com',
        placeholder: 'store.com',
        maxLength: 253,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'merchant-to-technographics',
        title: 'See the full tech stack',
        description: 'Detect the storefront and marketing technologies in use.',
        category: 'sdks',
        link: '/console/studio?preset=technographics',
      },
    ],
  },

  {
    id: 'company-timeseries',
    name: 'Historical Attribute Trends',
    description: "Chart how a company's attributes changed month over month (F-022): headcount, estimated revenue, technologies detected, and open roles, over a configurable window (default 24 months). Each series carries trailing-12-month growth, average month-over-month growth, and a trend (accelerating / growing / flat / declining), plus a headline momentum. The newest point of every series equals a live company lookup — history back-projects from current firmographics, so trajectory and snapshot never disagree. Deterministic.",
    method: 'GET',
    path: '/v1/companies/timeseries',
    creditCost: 2,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'The company domain to chart',
        example: 'stripe.com',
        placeholder: 'company.com',
        maxLength: 253,
      },
      {
        name: 'months',
        type: 'number',
        required: false,
        description: 'History window in months (6–36, default 24)',
        example: '24',
        placeholder: '24',
        minValue: 6,
        maxValue: 36,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'timeseries-to-funding',
        title: 'See the funding behind the growth',
        description: 'Review the rounds that fueled the headcount trajectory.',
        category: 'sdks',
        link: '/console/studio?preset=funding',
      },
    ],
  },

  {
    id: 'reconcile',
    name: 'Cross-Source Reconciliation',
    description: "Merge conflicting field values across providers into one golden record (F-027). Given a contact, the gateway gathers what each source reports for each field and reconciles them — weighting by provider reliability and recency — returning the winning value, its confidence, the winning source, source agreement, and (when providers disagree) a conflict flag with every candidate. Formatting variants are clustered so they don't count as conflicts.",
    method: 'GET',
    path: '/v1/reconcile',
    creditCost: 1,
    isRecommendedForFirstCall: false,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'The contact email to reconcile across sources',
        example: 'jane.doe@acme.com',
        placeholder: 'user@company.com',
      },
    ],
    nextStepRecommendations: [
      {
        id: 'reconcile-to-console',
        title: 'Open the Reconciliation console',
        description: 'See the golden record with per-field conflicts and candidates.',
        category: 'sdks',
        link: '/console/reconciliation',
      },
    ],
  }
];

/**
 * Get endpoint by ID
 */
export function getEndpointById(id: string): Endpoint | undefined {
  return ENDPOINTS.find(e => e.id === id);
}

/**
 * Get all endpoints for first-call (sorted with recommended first)
 */
export function getEndpointsForFirstCall(): Endpoint[] {
  const recommended = ENDPOINTS.filter(e => e.isRecommendedForFirstCall);
  const others = ENDPOINTS.filter(e => !e.isRecommendedForFirstCall);
  return [...recommended, ...others];
}

/**
 * Get recommended endpoint for first-call
 */
export function getRecommendedEndpointForFirstCall(): Endpoint | undefined {
  return ENDPOINTS.find(e => e.isRecommendedForFirstCall);
}

/**
 * Validate all endpoints have unique IDs
 */
export function validateEndpoints(): boolean {
  const ids = ENDPOINTS.map(e => e.id);
  const uniqueIds = new Set(ids);
  return ids.length === uniqueIds.size;
}

// Type exports for component usage
