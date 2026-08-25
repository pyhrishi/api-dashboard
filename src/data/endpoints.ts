/**
 * Endpoint Metadata Structure
 * Defines all 12 API endpoints with parameters, descriptions, credit costs, and next-step recommendations.
 * Used by RequestBuilder and FirstCallWizard components.
 */

export type ParameterType = 'string' | 'email' | 'phone' | 'number';
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
  creditCost: number;
  isRecommendedForFirstCall: boolean;
  parameters: EndpointParameter[];
  nextStepRecommendations: NextStepRecommendation[];
}

/**
 * All 12 API Endpoints with complete metadata
 */
export const ENDPOINTS: Endpoint[] = [
  {
    id: 'people-search',
    name: 'People Search',
    description: 'Search for a person by email, name, or phone. Returns contact details, company info, and professional data.',
    method: 'GET',
    path: '/people-search',
    creditCost: 1,
    isRecommendedForFirstCall: true,
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
    description: 'Convert any corporate email address into a direct-dial phone number. 99.2% coverage on US B2B contacts.',
    method: 'GET',
    path: '/email-to-phone',
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
    path: '/phone-to-email',
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
    path: '/linkedin-to-profile',
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
    path: '/linkedin-to-contact',
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
    path: '/domain-to-cin',
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
    path: '/cin-to-company-data',
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
    path: '/domain-to-linkedin',
    creditCost: 1,
    isRecommendedForFirstCall: false,
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
    path: '/contact-to-linkedin',
    creditCost: 2,
    isRecommendedForFirstCall: false,
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
    path: '/reverse-enrichment',
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
    path: '/din-to-phone',
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
    path: '/people-ai-search',
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
