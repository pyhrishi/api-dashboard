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
  // Check required parameters
  for (const param of endpoint.parameters) {
    if (param.required) {
      const value = parameters[param.name];
      if (value === undefined || value === null || value === '') {
        return {
          isValid: false,
          error: `Missing required parameter: ${param.name}`,
        };
      }

      // Basic type validation
      if (param.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(value))) {
          return {
            isValid: false,
            error: `Invalid email format for parameter: ${param.name}`,
          };
        }
      }

      if (param.type === 'phone') {
        const digitsOnly = String(value).replace(/\D/g, '');
        if (digitsOnly.length < 10 || digitsOnly.length > 15) {
          return {
            isValid: false,
            error: `Invalid phone number for parameter: ${param.name}`,
          };
        }
      }

      if (param.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          return {
            isValid: false,
            error: `Invalid number for parameter: ${param.name}`,
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
function generateMockResponse(endpoint: Endpoint, parameters: Record<string, any>): any {
  switch (endpoint.id) {
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
        error: response.error,
        errorCode: response.errorCode,
        message: response.statusText,
      },
      null,
      2
    );
  }

  return JSON.stringify(response.data, null, 2);
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
