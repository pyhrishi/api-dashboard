/**
 * Endpoint Metadata Structure
 * The single source of truth for the Zinbit API catalog — every endpoint with its
 * parameters, descriptions, credit costs, and next-step recommendations.
 * Consumed by the docs, Endpoint Explorer, code generators, OpenAPI/Postman specs,
 * the CLI, and the landing-page catalog (lib/api-catalog.tsx).
 */

export type ParameterType = 'string' | 'email' | 'phone' | 'number' | 'array';
export type HTTPMethod = 'GET' | 'POST';
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
        description: 'Field to sort by (e.g., name, -name, department)',
        example: '-name',
        placeholder: 'name or -name',
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
