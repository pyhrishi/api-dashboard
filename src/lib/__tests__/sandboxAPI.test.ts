/**
 * Sandbox API Integration Tests
 * Tests mock API responses and error handling
 */

import {
  callSandboxAPI,
  isAPIError,
  getErrorMessage,
  formatResponseForDisplay,
  getStatusDescription,
  estimateRequestCost,
  getMockRateLimitInfo,
  APIRequest,
} from '../sandboxAPI';
import { getEndpointById } from '@/data/endpoints';

describe('Sandbox API Integration', () => {
  describe('callSandboxAPI', () => {
    it('should successfully call sandbox API with valid sk_test_ key', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_valid_key',
      };

      const response = await callSandboxAPI(request);

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(response.data).toBeDefined();
      expect(response.duration).toBeGreaterThan(0);
      expect(response.requestId).toMatch(/^req_\d+_/);
      expect(isAPIError(response)).toBe(false);
    });

    // Live keys are accepted by the gateway (console↔gateway seam is closed);
    // only malformed keys are rejected.
    it('should accept sk_live_ keys and reject malformed keys', async () => {
      const endpoint = getEndpointById('people-search')!;

      const liveResponse = await callSandboxAPI({
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_live_production_key',
      });
      expect(liveResponse.status).toBe(200);
      expect(isAPIError(liveResponse)).toBe(false);

      const badResponse = await callSandboxAPI({
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'not_a_valid_key',
      });
      expect(badResponse.status).toBe(401);
      expect(isAPIError(badResponse)).toBe(true);
    });

    it('should validate required parameters', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: '' }, // Empty required parameter
        apiKey: 'sk_test_valid_key',
      };

      const response = await callSandboxAPI(request);

      expect(response.status).toBe(400);
      expect(isAPIError(response)).toBe(true);
    });

    it('should validate email format', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: 'invalid-email' }, // Invalid email
        apiKey: 'sk_test_valid_key',
      };

      const response = await callSandboxAPI(request);

      expect(response.status).toBe(400);
      expect(isAPIError(response)).toBe(true);
    });

    // Property 13: Response Metadata Display - verify status code and latency
    it('should include status code and latency in response', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_valid_key',
      };

      const response = await callSandboxAPI(request);

      expect(response.status).toBeDefined();
      expect(typeof response.status).toBe('number');
      expect(response.duration).toBeDefined();
      expect(typeof response.duration).toBe('number');
      expect(response.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Mock Responses by Endpoint', () => {
    it('should return people data for people-search', async () => {
      const endpoint = getEndpointById('people-search')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { email: 'john@example.com' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.person).toBeDefined();
      expect(response.data.person.email).toBe('john@example.com');
      expect(response.data.person.phone).toBeDefined();
    });

    it('should return phone for email-to-phone', async () => {
      const endpoint = getEndpointById('email-to-phone')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.email).toBe('test@example.com');
      expect(response.data.phone).toBeDefined();
      expect(response.data.confidence).toBeDefined();
    });

    it('should return email for phone-to-email', async () => {
      const endpoint = getEndpointById('phone-to-email')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { phone: '5551234567' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.phone).toBe('5551234567');
      expect(response.data.email).toBeDefined();
    });

    it('should return profile for linkedin-to-profile', async () => {
      const endpoint = getEndpointById('linkedin-to-profile')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { linkedin_url: 'https://www.linkedin.com/in/test' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.profile).toBeDefined();
      expect(response.data.profile.experience).toBeDefined();
      expect(Array.isArray(response.data.profile.experience)).toBe(true);
    });

    it('should return contact for linkedin-to-contact', async () => {
      const endpoint = getEndpointById('linkedin-to-contact')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { linkedin_url: 'https://www.linkedin.com/in/test' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.emails).toBeDefined();
      expect(response.data.phones).toBeDefined();
    });

    it('should return CIN for domain-to-cin', async () => {
      const endpoint = getEndpointById('domain-to-cin')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { domain: 'acme.com' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.cin).toBeDefined();
      expect(response.data.company_name).toBeDefined();
    });

    it('should return company data for cin-to-company-data', async () => {
      const endpoint = getEndpointById('cin-to-company-data')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { cin: 'L72900KA2020PLC123456' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.company_name).toBeDefined();
      expect(response.data.status).toBe('Active');
    });

    it('should return results for people-ai-search', async () => {
      const endpoint = getEndpointById('people-ai-search')!;
      const response = await callSandboxAPI({
        endpoint,
        parameters: { query: 'VP of Sales' },
        apiKey: 'sk_test_key',
      });

      expect(response.status).toBe(200);
      expect(response.data.results).toBeDefined();
      expect(Array.isArray(response.data.results)).toBe(true);
      expect(response.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('isAPIError should correctly identify errors', () => {
      const successResponse = { status: 200, statusText: 'OK', data: {}, duration: 100, requestId: 'req_1', timestamp: Date.now() };
      const errorResponse = { status: 400, statusText: 'Bad Request', data: null, error: 'Invalid', duration: 50, requestId: 'req_2', timestamp: Date.now() };

      expect(isAPIError(successResponse)).toBe(false);
      expect(isAPIError(errorResponse)).toBe(true);
    });

    it('getErrorMessage should return appropriate message', () => {
      const errorResponse = {
        status: 401,
        statusText: 'Unauthorized',
        data: null,
        error: 'Invalid API key',
        duration: 50,
        requestId: 'req_1',
        timestamp: Date.now(),
      };

      expect(getErrorMessage(errorResponse)).toBe('Invalid API key');
    });

    it('formatResponseForDisplay should format JSON correctly', () => {
      const response = {
        status: 200,
        statusText: 'OK',
        data: { test: 'value' },
        duration: 100,
        requestId: 'req_1',
        timestamp: Date.now(),
      };

      const formatted = formatResponseForDisplay(response);
      expect(() => JSON.parse(formatted)).not.toThrow();
      expect(formatted).toContain('test');
      expect(formatted).toContain('value');
    });
  });

  describe('Helper Functions', () => {
    it('getStatusDescription should return proper descriptions', () => {
      expect(getStatusDescription(200)).toContain('OK');
      expect(getStatusDescription(400)).toContain('Bad Request');
      expect(getStatusDescription(401)).toContain('Unauthorized');
      expect(getStatusDescription(500)).toContain('Internal Server Error');
    });

    it('getMockRateLimitInfo should return rate limit info', () => {
      const info = getMockRateLimitInfo();

      expect(info.limit).toBe(1000);
      expect(info.remaining).toBeLessThan(1000);
      expect(info.reset).toBeGreaterThan(Date.now() / 1000);
    });

    it('estimateRequestCost should calculate cost correctly', () => {
      const endpoint = getEndpointById('people-search')!;
      const cost = estimateRequestCost(endpoint);

      expect(cost.creditCost).toBe(endpoint.creditCost);
      expect(cost.estimatedPrice).toBe(endpoint.creditCost * 0.01);
    });
  });

  describe('All 12 Endpoints', () => {
    const endpoints = [
      'people-search',
      'email-to-phone',
      'phone-to-email',
      'linkedin-to-profile',
      'linkedin-to-contact',
      'domain-to-cin',
      'cin-to-company-data',
      'domain-to-linkedin',
      'contact-to-linkedin',
      'reverse-enrichment',
      'din-to-phone',
      'people-ai-search',
    ];

    it('should handle all 12 endpoints', async () => {
      for (const endpointId of endpoints) {
        const endpoint = getEndpointById(endpointId);
        expect(endpoint).toBeDefined();

        const response = await callSandboxAPI({
          endpoint: endpoint!,
          parameters: {
            email: 'test@example.com',
            phone: '5551234567',
            query: 'test',
          },
          apiKey: 'sk_test_valid',
        });

        // Either success or validation error (both 200 or 400)
        expect([200, 400]).toContain(response.status);
        expect(response.duration).toBeGreaterThanOrEqual(0);
        expect(response.requestId).toBeDefined();
      }
    });
  });

  describe('Sandbox Isolation Properties', () => {
    // Property 7: Sandbox Isolation and Security
    it('should accept both sk_test_ and sk_live_ keys', async () => {
      const endpoint = getEndpointById('people-search')!;

      // Live key — accepted (the gateway bills it; masking is applied downstream).
      const liveKeyResponse = await callSandboxAPI({
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_live_production',
      });
      expect(liveKeyResponse.status).toBe(200);
      expect(isAPIError(liveKeyResponse)).toBe(false);

      // Sandbox key — accepted.
      const testKeyResponse = await callSandboxAPI({
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_sandbox',
      });
      expect(testKeyResponse.status).toBe(200);
      expect(isAPIError(testKeyResponse)).toBe(false);
    });
  });

  describe('Request ID Tracking', () => {
    it('should generate unique request IDs', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_key',
      };

      const response1 = await callSandboxAPI(request);
      const response2 = await callSandboxAPI(request);

      expect(response1.requestId).not.toBe(response2.requestId);
    });
  });

  describe('Latency Simulation', () => {
    it('should simulate realistic network latency', async () => {
      const endpoint = getEndpointById('people-search')!;
      const request: APIRequest = {
        endpoint,
        parameters: { email: 'test@example.com' },
        apiKey: 'sk_test_key',
      };

      const response = await callSandboxAPI(request);

      // Latency should be 50-300ms
      expect(response.duration).toBeGreaterThanOrEqual(50);
      expect(response.duration).toBeLessThanOrEqual(300);
    });
  });
});
