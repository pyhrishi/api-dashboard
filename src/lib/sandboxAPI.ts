/**
 * Sandbox API Integration
 * Simulates API requests against sandbox environment with mock responses.
 * All requests use sk_test_ keys for safety and isolation from production.
 */

import { Endpoint } from '@/data/endpoints';
import { generateCodeSamples } from './codeSampleGenerator';

export interface APIRequest {
  endpoint: Endpoint;
  parameters: Record<string, any>;
  apiKey: string;
  baseUrl?: string;
  simulateStatus?: number;
  isIdempotentReplay?: boolean;
}

export interface APIResponse {
  status: number;
  statusText: string;
  data: any;
  duration: number; // milliseconds
  requestId: string;
  timestamp: number;
}

export interface APIError extends APIResponse {
  error: string;
  errorCode?: string;
}

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Simulate network latency (50-300ms)
 */
function simulateLatency(): Promise<void> {
  const latency = Math.random() * 250 + 50;
  return new Promise(resolve => setTimeout(resolve, latency));
}

/**
 * Main sandbox API call handler
 * Validates request and returns mock response
 */
export async function callSandboxAPI(request: APIRequest): Promise<APIResponse | APIError> {
  const startTime = performance.now();
  const requestId = generateRequestId();

  try {
    // Validate API key is sandbox (sk_test_)
    if (!request.apiKey.startsWith('sk_test_')) {
      throw createAPIError(
        401,
        'Unauthorized',
        'Only sandbox keys (sk_test_*) are allowed in first-call wizard',
        'INVALID_API_KEY',
        requestId
      );
    }

    // Validate endpoint exists
    if (!request.endpoint || !request.endpoint.id) {
      throw createAPIError(
        400,
        'Bad Request',
        'Invalid endpoint configuration',
        'INVALID_ENDPOINT',
        requestId
      );
    }

    // Validate parameters
    const paramValidation = validateRequestParameters(request.endpoint, request.parameters);
    if (!paramValidation.isValid) {
      throw createAPIError(
        400,
        'Bad Request',
        paramValidation.error!,
        'INVALID_PARAMETERS',
        requestId
      );
    }

    // Simulate network latency
    await simulateLatency();

    // Handle simulated error statuses
    if (request.simulateStatus && request.simulateStatus !== 200) {
      let errorMsg = 'An error occurred';
      let errorCode = 'UNKNOWN_ERROR';
      
      switch (request.simulateStatus) {
        case 400:
          errorMsg = 'Invalid parameters provided in the request.';
          errorCode = 'INVALID_PARAMETERS';
          break;
        case 401:
          errorMsg = 'Invalid or missing API key.';
          errorCode = 'UNAUTHORIZED';
          break;
        case 402:
          errorMsg = 'Insufficient credits to perform this operation.';
          errorCode = 'PAYMENT_REQUIRED';
          break;
        case 429:
          errorMsg = 'Too many requests. Please slow down.';
          errorCode = 'RATE_LIMITED';
          break;
        case 500:
          errorMsg = 'An internal server error occurred.';
          errorCode = 'INTERNAL_ERROR';
          break;
      }
      
      throw createAPIError(
        request.simulateStatus,
        getStatusDescription(request.simulateStatus).split(' - ')[0],
        errorMsg,
        errorCode,
        requestId
      );
    }

    // Generate mock response
    const mockResponse = generateMockResponse(request.endpoint, request.parameters);
    const duration = Math.round(performance.now() - startTime);

    return {
      status: 200,
      statusText: 'OK',
      data: mockResponse,
      duration,
      requestId,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    const duration = Math.round(performance.now() - startTime);

    if (error.isAPIError) {
      return {
        ...error,
        duration,
        timestamp: Date.now(),
      };
    }

    // Unknown error
    return {
      status: 500,
      statusText: 'Internal Server Error',
      data: null,
      error: 'An unexpected error occurred',
      errorCode: 'INTERNAL_ERROR',
      duration,
      requestId,
      timestamp: Date.now(),
    };
  }
}

/**
 * Validate request parameters against endpoint definition
 */
function validateRequestParameters(
  endpoint: Endpoint,
  parameters: Record<string, any>
): { isValid: boolean; error?: string } {
  const allowedParamNames = new Set(endpoint.parameters.map(p => p.name));
  
  // 1. Strict unknown parameter check
  for (const key of Object.keys(parameters)) {
    if (!allowedParamNames.has(key)) {
      return {
        isValid: false,
        error: `Strict Validation Failed: Unknown parameter '${key}' is not allowed for this endpoint.`,
      };
    }
  }

  // 2. Validate all defined parameters
  for (const param of endpoint.parameters) {
    const value = parameters[param.name];
    const isProvided = value !== undefined && value !== null && value !== '';

    // Check required
    if (param.required && !isProvided) {
      return {
        isValid: false,
        error: `Missing required parameter: ${param.name}`,
      };
    }

    // Check type and constraints if provided
    if (isProvided) {
      // Basic string validation
      if (param.type === 'string' && typeof value !== 'string') {
        return {
          isValid: false,
          error: `Parameter '${param.name}' must be a string.`,
        };
      }

      // Email validation
      if (param.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(value))) {
          return {
            isValid: false,
            error: `Invalid email format for parameter: ${param.name}`,
          };
        }
      }

      // Phone validation
      if (param.type === 'phone') {
        const digitsOnly = String(value).replace(/\D/g, '');
        if (digitsOnly.length < 10 || digitsOnly.length > 15) {
          return {
            isValid: false,
            error: `Invalid phone number for parameter: ${param.name}`,
          };
        }
      }

      // Number validation
      if (param.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          return {
            isValid: false,
            error: `Invalid number for parameter: ${param.name}`,
          };
        }
      }

      // Boolean validation
      if (param.type === 'boolean') {
        const strVal = String(value).toLowerCase();
        if (strVal !== 'true' && strVal !== 'false' && strVal !== '1' && strVal !== '0') {
          return {
            isValid: false,
            error: `Parameter '${param.name}' must be a boolean (true/false).`,
          };
        }
      }

      // Max Length validation
      if (param.maxLength && String(value).length > param.maxLength && param.type !== 'array') {
        return {
          isValid: false,
          error: `Parameter '${param.name}' exceeds maximum length of ${param.maxLength} characters.`,
        };
      }

      // Array validation
      if (param.type === 'array') {
        if (!Array.isArray(value)) {
          return {
            isValid: false,
            error: `Parameter '${param.name}' must be a JSON array.`,
          };
        }
        if (param.maxLength && value.length > param.maxLength) {
          return {
            isValid: false,
            error: `Parameter '${param.name}' array exceeds maximum length of ${param.maxLength} items.`,
          };
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * Generate mock response based on endpoint
 */
const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Sam', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Harper'];
const LAST_NAMES = ['Developer', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez'];
const ROLES = ['Senior Software Engineer', 'Product Manager', 'Data Scientist', 'CTO', 'VP of Engineering', 'UX Designer', 'Marketing Director', 'DevOps Engineer'];
const COMPANIES = ['Acme Corp', 'Globex', 'Soylent', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Massive Dynamic'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMockResponse(endpoint: Endpoint, parameters: Record<string, any>): any {
  switch (endpoint.id) {
    case 'identity-resolve': {
      const q = String(parameters.query || '').trim();
      let type = 'unknown';
      if (q.includes('@')) type = 'email';
      else if (q.includes('linkedin.com')) type = 'linkedin';
      else if (/^\+?[0-9]+$/.test(q)) type = 'phone';
      else if (q.includes('.')) type = 'domain';
      
      if (type === 'domain') {
        return {
          type: 'company',
          resolved_from: 'domain',
          profile: {
            id: `comp_${Date.now()}`,
            name: `${q.split('.')[0].toUpperCase()} Corp`,
            domain: q,
            industry: 'Technology',
            headquarters: 'San Francisco, CA'
          }
        };
      } else {
        return {
          type: 'person',
          resolved_from: type,
          profile: {
            id: `pers_${Date.now()}`,
            name: `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`,
            title: getRandomItem(ROLES),
            company: getRandomItem(COMPANIES),
            email: type === 'email' ? q : `${getRandomItem(FIRST_NAMES).toLowerCase()}@${getRandomItem(COMPANIES).replace(' ', '').toLowerCase()}.com`,
            phone: type === 'phone' ? q : `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
            linkedin_url: type === 'linkedin' ? q : `https://linkedin.com/in/${Math.random().toString(36).substring(7)}`
          }
        };
      }
    }
    case 'batch-company-enrich': {
      const domains = parameters.domains || [];
      return {
        results: domains.map((domain: string, idx: number) => ({
          domain,
          status: 'success',
          data: {
            name: `${domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)} Corp`,
            industry: ['Technology', 'Finance', 'Healthcare'][idx % 3],
            employeeCount: 50 + (idx * 150),
            revenue: '$1M - $10M',
          }
        }))
      };
    }
    case 'company-employees': {
      const limit = Number(parameters.limit) || 10;
      let offset = 0;
      
      if (parameters.cursor) {
        try {
          const decoded = JSON.parse(atob(parameters.cursor));
          offset = decoded.offset || 0;
        } catch(e) {
          // ignore invalid cursor
        }
      }

      // Generate base dataset
      const totalMockSize = 145;
      let allEmployees = Array.from({ length: totalMockSize }).map((_, i) => {
        // Deterministic mock generation
        const depts = ['Engineering', 'Sales', 'Marketing', 'Product', 'HR'];
        const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis'];
        
        const dept = depts[i % depts.length];
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        
        return {
          id: `emp_${i}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${parameters.domain || 'example.com'}`,
          name: `${firstName} ${lastName}`,
          title: `Staff ${dept} Specialist`,
          department: dept
        };
      });

      // Apply Filter
      if (parameters.department) {
        allEmployees = allEmployees.filter(e => 
          e.department.toLowerCase() === parameters.department.toLowerCase()
        );
      }

      // Apply Sort
      if (parameters.sort) {
        const desc = parameters.sort.startsWith('-');
        const field = desc ? parameters.sort.substring(1) : parameters.sort;
        
        allEmployees.sort((a: any, b: any) => {
          if (a[field] < b[field]) return desc ? 1 : -1;
          if (a[field] > b[field]) return desc ? -1 : 1;
          return 0;
        });
      }

      const totalEmployees = allEmployees.length;
      const hasMore = offset + limit < totalEmployees;
      const nextCursor = hasMore ? btoa(JSON.stringify({ offset: offset + limit })) : null;

      const employees = allEmployees.slice(offset, offset + limit);

      return {
        success: true,
        employees,
        pagination: {
          total: totalEmployees,
          limit,
          has_more: hasMore,
          next_cursor: nextCursor
        }
      };
    }

    case 'people-search':
      return {
        success: true,
        person: {
          id: 'person_' + Math.random().toString(36).substring(2, 9),
          email: parameters.email || 'user@example.com',
          first_name: parameters.first_name || 'John',
          last_name: parameters.last_name || 'Doe',
          phone: '+1-555-0123',
          company: 'Acme Corporation',
          title: 'Senior Software Engineer',
          location: 'San Francisco, CA',
          linkedin_url: 'https://www.linkedin.com/in/johndoe',
          confidence: 0.92,
        },
      };

    case 'email-to-phone':
      return {
        success: true,
        email: parameters.email || 'user@example.com',
        phone: '+1-555-0123',
        confidence: 0.95,
        carrier: 'Verizon',
      };

    case 'phone-to-email':
      return {
        success: true,
        phone: parameters.phone || '5551234567',
        email: 'john.doe@acme.com',
        confidence: 0.92,
        company: 'Acme Corporation',
      };

    case 'linkedin-to-profile':
      return {
        success: true,
        profile: {
          name: 'John Doe',
          headline: 'Senior Software Engineer at Acme',
          bio: 'Building the future of enterprise software',
          experience: [
            {
              title: 'Senior Software Engineer',
              company: 'Acme Corporation',
              duration: '3 years',
              description: 'Led platform engineering initiatives',
            },
          ],
          education: [
            {
              degree: 'BS Computer Science',
              school: 'Stanford University',
              year: 2015,
            },
          ],
          skills: ['TypeScript', 'React', 'Node.js', 'AWS'],
          endorsements: 245,
        },
      };

    case 'linkedin-to-contact':
      return {
        success: true,
        emails: [
          {
            email: 'john.doe@acme.com',
            confidence: 0.98,
            type: 'work',
          },
        ],
        phones: [
          {
            phone: '+1-555-0123',
            confidence: 0.92,
            type: 'direct',
          },
        ],
        company: 'Acme Corporation',
      };

    case 'domain-to-cin':
      return {
        success: true,
        domain: parameters.domain || 'acme.com',
        cin: 'L72900KA2020PLC123456',
        company_name: 'Acme Corporation Pvt Ltd',
      };

    case 'cin-to-company-data':
      return {
        success: true,
        cin: parameters.cin || 'L72900KA2020PLC123456',
        company_name: 'Acme Corporation Pvt Ltd',
        registration_date: '2020-01-15',
        status: 'Active',
        authorized_capital: '10000000',
        paid_up_capital: '5000000',
        employees: 450,
        annual_revenue: '50000000',
      };

    case 'domain-to-linkedin':
      return {
        success: true,
        domain: parameters.domain || 'acme.com',
        linkedin_url: 'https://www.linkedin.com/company/acme-corporation',
        company_name: 'Acme Corporation',
        employees: 450,
      };

    case 'contact-to-linkedin':
      return {
        success: true,
        first_name: parameters.first_name || 'John',
        last_name: parameters.last_name || 'Doe',
        linkedin_url: 'https://www.linkedin.com/in/johndoe',
        confidence: 0.89,
      };

    case 'reverse-enrichment':
      return {
        success: true,
        query: parameters.query || '192.168.1.1',
        company: 'Acme Corporation',
        domain: 'acme.com',
        employees: 450,
        industry: 'Software Engineering',
      };

    case 'din-to-phone':
      return {
        success: true,
        din: parameters.din || '00123456',
        name: 'John Doe',
        phone: '+1-555-0123',
        email: 'john.doe@acme.com',
        title: 'Director',
        company: 'Acme Corporation',
      };

    case 'people-ai-search':
      return {
        success: true,
        query: parameters.query || 'VP of Sales',
        results: [
          {
            id: 'person_' + Math.random().toString(36).substring(2, 9),
            name: 'Jane Smith',
            title: 'VP of Sales',
            company: 'SaaS Startup Inc',
            email: 'jane@saasstartup.com',
            phone: '+1-555-0124',
            location: 'Bangalore',
            confidence: 0.94,
          },
          {
            id: 'person_' + Math.random().toString(36).substring(2, 9),
            name: 'Sarah Johnson',
            title: 'VP, Sales Operations',
            company: 'Another SaaS Co',
            email: 'sarah@anothersaas.com',
            phone: '+1-555-0125',
            location: 'Bangalore',
            confidence: 0.91,
          },
        ],
        total_results: 2,
        limit: parameters.limit || 10,
      };

    default:
      return {
        success: true,
        data: { message: 'Mock response' },
      };
  }
}

/**
 * Create API error object
 */
function createAPIError(
  status: number,
  statusText: string,
  message: string,
  errorCode: string,
  requestId: string
): APIError & { isAPIError: true } {
  return {
    isAPIError: true,
    status,
    statusText,
    data: null,
    error: message,
    errorCode,
    duration: 0,
    requestId,
    timestamp: Date.now(),
  };
}

/**
 * Helper to check if response is an error
 */
export function isAPIError(response: APIResponse | APIError): response is APIError {
  return (response as APIError).error !== undefined;
}

/**
 * Helper to get error message from response
 */
export function getErrorMessage(response: APIResponse | APIError): string {
  if (isAPIError(response)) {
    return response.error || response.statusText;
  }
  return response.statusText;
}

/**
 * Helper to format response for display
 */
export function formatResponseForDisplay(response: APIResponse | APIError): string {
  if (isAPIError(response)) {
    return JSON.stringify(
      {
        success: false,
        error: {
          code: response.errorCode || 'UNKNOWN_ERROR',
          message: response.error || response.statusText,
        },
        metadata: {
          requestId: response.requestId,
          timestamp: response.timestamp,
        }
      },
      null,
      2
    );
  }

  // Remove the wrapper if data is already wrapped (so we don't double wrap mock responses)
  const payload = response.data?.success !== undefined && response.data?.data 
    ? response.data.data 
    : response.data;

  return JSON.stringify(
    {
      success: true,
      data: payload,
      metadata: {
        requestId: response.requestId,
        timestamp: response.timestamp,
        processingTimeMs: response.duration,
      }
    }, 
    null, 
    2
  );
}

/**
 * Get HTTP status description
 */
export function getStatusDescription(status: number): string {
  const descriptions: Record<number, string> = {
    200: 'OK - Request successful',
    201: 'Created - Resource created',
    400: 'Bad Request - Invalid parameters',
    401: 'Unauthorized - Invalid API key',
    402: 'Payment Required - Insufficient credits',
    404: 'Not Found - Endpoint not found',
    429: 'Too Many Requests - Rate limited',
    500: 'Internal Server Error - Server error',
    502: 'Bad Gateway - Service unavailable',
    503: 'Service Unavailable - Maintenance',
  };

  return descriptions[status] || `HTTP ${status}`;
}

/**
 * Mock rate limit info
 */
export function getMockRateLimitInfo() {
  return {
    limit: 1000,
    remaining: 987,
    reset: Math.floor(Date.now() / 1000) + 3600,
  };
}

/**
 * Mock cost estimation
 */
export function estimateRequestCost(endpoint: Endpoint): {
  creditCost: number;
  estimatedPrice: number;
} {
  const creditCost = endpoint.creditCost;
  // Rough estimate: $0.01 per credit
  const estimatedPrice = creditCost * 0.01;

  return { creditCost, estimatedPrice };
}
