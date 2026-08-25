/**
 * Code Sample Generator Unit Tests
 * Tests code generation for all languages and endpoints
 */

import {
  generateCodeSamples,
  generateCurlSample,
  generatePythonSample,
  generateNodeJsSample,
  validateGeneratedCode,
  getLanguageComment,
  generateCodeDocumentation,
  getExampleResponse,
  CodeSampleContext,
} from '../codeSampleGenerator';
import { getEndpointById } from '@/data/endpoints';

describe('Code Sample Generator', () => {
  const testContext: CodeSampleContext = {
    endpoint: getEndpointById('people-search')!,
    parameters: {
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
    },
    apiKey: 'sk_test_abc123',
  };

  describe('generateCodeSamples', () => {
    it('should generate all three language samples', () => {
      const samples = generateCodeSamples(testContext);

      expect(samples.curl).toBeDefined();
      expect(samples.python).toBeDefined();
      expect(samples.nodejs).toBeDefined();

      expect(samples.curl.length).toBeGreaterThan(0);
      expect(samples.python.length).toBeGreaterThan(0);
      expect(samples.nodejs.length).toBeGreaterThan(0);
    });
  });

  describe('generateCurlSample', () => {
    it('should generate valid curl command for GET request', () => {
      const curl = generateCurlSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(curl).toContain('curl');
      expect(curl).toContain('-X GET');
      expect(curl).toContain('-H "Authorization:');
      expect(curl).toContain('sk_test_abc123');
      expect(curl).toContain('email=john@example.com');
      expect(validateGeneratedCode(curl, 'curl')).toBe(true);
    });

    it('should include all query parameters', () => {
      const curl = generateCurlSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(curl).toContain('email');
      expect(curl).toContain('first_name');
      expect(curl).toContain('last_name');
    });

    it('should generate valid curl command for POST request', () => {
      const postEndpoint = getEndpointById('people-ai-search')!;
      const curl = generateCurlSample(
        postEndpoint,
        { query: 'VP of Sales' },
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(curl).toContain('-X POST');
      expect(curl).toContain("-d '");
      expect(curl).toContain('query');
      expect(validateGeneratedCode(curl, 'curl')).toBe(true);
    });

    // Property 8: Authorization Header Inclusion
    it('should always include sk_test_ key in Authorization header', () => {
      const curl = generateCurlSample(
        testContext.endpoint,
        testContext.parameters,
        'sk_test_testkey123',
        'https://api.zintlr.com/v1'
      );

      expect(curl).toContain('sk_test_testkey123');
      expect(curl).not.toContain('sk_live_');
    });
  });

  describe('generatePythonSample', () => {
    it('should generate valid Python code', () => {
      const python = generatePythonSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(python).toContain('import requests');
      expect(python).toContain('headers =');
      expect(python).toContain('sk_test_abc123');
      expect(python).toContain('requests.get');
      expect(python).toContain('try:');
      expect(python).toContain('except');
      expect(validateGeneratedCode(python, 'python')).toBe(true);
    });

    // Property 38: Python Sample Completeness
    it('should include requests import and error handling', () => {
      const python = generatePythonSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(python).toContain('import requests');
      expect(python).toContain('RequestException');
      expect(python).toContain('raise_for_status()');
    });

    it('should handle POST requests with data', () => {
      const postEndpoint = getEndpointById('people-ai-search')!;
      const python = generatePythonSample(
        postEndpoint,
        { query: 'VP of Sales', limit: 10 },
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(python).toContain('requests.post');
      expect(python).toContain('json=data');
      expect(python).toContain('query');
    });
  });

  describe('generateNodeJsSample', () => {
    it('should generate valid Node.js code', () => {
      const nodejs = generateNodeJsSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(nodejs).toContain('const axios');
      expect(nodejs).toContain('config =');
      expect(nodejs).toContain('sk_test_abc123');
      expect(nodejs).toContain('.then');
      expect(nodejs).toContain('.catch');
      expect(validateGeneratedCode(nodejs, 'nodejs')).toBe(true);
    });

    // Property 39: Node.js Sample Completeness
    it('should include axios import and error handling', () => {
      const nodejs = generateNodeJsSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(nodejs).toContain('const axios = require');
      expect(nodejs).toContain('axios(config)');
      expect(nodejs).toContain('.then');
      expect(nodejs).toContain('.catch');
      expect(nodejs).toContain('console.error');
    });

    it('should handle POST requests', () => {
      const postEndpoint = getEndpointById('people-ai-search')!;
      const nodejs = generateNodeJsSample(
        postEndpoint,
        { query: 'VP of Sales' },
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(nodejs).toContain("method: 'post'");
      expect(nodejs).toContain('data:');
    });
  });

  describe('validateGeneratedCode', () => {
    it('should validate curl code', () => {
      const curl = generateCurlSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(validateGeneratedCode(curl, 'curl')).toBe(true);
    });

    it('should validate Python code', () => {
      const python = generatePythonSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(validateGeneratedCode(python, 'python')).toBe(true);
    });

    it('should validate Node.js code', () => {
      const nodejs = generateNodeJsSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(validateGeneratedCode(nodejs, 'nodejs')).toBe(true);
    });

    it('should reject invalid code', () => {
      expect(validateGeneratedCode('', 'curl')).toBe(false);
      expect(validateGeneratedCode('invalid', 'python')).toBe(false);
    });
  });

  describe('Helper functions', () => {
    it('getLanguageComment should return correct comments', () => {
      expect(getLanguageComment('curl')).toContain('terminal');
      expect(getLanguageComment('python')).toContain('pip');
      expect(getLanguageComment('nodejs')).toContain('npm');
    });

    it('generateCodeDocumentation should include endpoint info', () => {
      const doc = generateCodeDocumentation(testContext.endpoint);

      expect(doc).toContain('People Search');
      expect(doc).toContain(testContext.endpoint.creditCost.toString());
      expect(doc).toContain(testContext.endpoint.method);
      expect(doc).toContain(testContext.endpoint.path);
    });

    it('getExampleResponse should return valid JSON', () => {
      const response = getExampleResponse(testContext.endpoint);
      expect(() => JSON.parse(response)).not.toThrow();
    });
  });

  describe('Property: Code Sample Generation', () => {
    // Property 9: Code Sample Generation
    it('should generate all 3 languages from one config', () => {
      const samples = generateCodeSamples(testContext);

      expect(samples).toHaveProperty('curl');
      expect(samples).toHaveProperty('python');
      expect(samples).toHaveProperty('nodejs');
    });

    // Property 36: Code Sample Syntax Validity
    it('should generate syntactically correct code for all languages', () => {
      const samples = generateCodeSamples(testContext);

      expect(validateGeneratedCode(samples.curl, 'curl')).toBe(true);
      expect(validateGeneratedCode(samples.python, 'python')).toBe(true);
      expect(validateGeneratedCode(samples.nodejs, 'nodejs')).toBe(true);
    });

    // Property 37: cURL Sample Completeness
    it('should include all headers and auth in cURL', () => {
      const curl = generateCurlSample(
        testContext.endpoint,
        testContext.parameters,
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(curl).toContain('Authorization:');
      expect(curl).toContain('Content-Type:');
      expect(curl).toContain(testContext.apiKey);
    });

    // Property 40: Reactive Code Generation
    it('should update samples when parameters change', () => {
      const sample1 = generateCurlSample(
        testContext.endpoint,
        { email: 'john@example.com' },
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      const sample2 = generateCurlSample(
        testContext.endpoint,
        { email: 'jane@example.com' },
        testContext.apiKey,
        'https://api.zintlr.com/v1'
      );

      expect(sample1).not.toEqual(sample2);
      expect(sample1).toContain('john');
      expect(sample2).toContain('jane');
    });
  });

  describe('All endpoints', () => {
    it('should generate valid code for all 12 endpoints', () => {
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

      endpoints.forEach(endpointId => {
        const endpoint = getEndpointById(endpointId);
        expect(endpoint).toBeDefined();

        const samples = generateCodeSamples({
          endpoint: endpoint!,
          parameters: {
            email: 'test@example.com',
            phone: '5551234567',
            query: 'test',
          },
          apiKey: 'sk_test_test',
        });

        expect(validateGeneratedCode(samples.curl, 'curl')).toBe(true);
        expect(validateGeneratedCode(samples.python, 'python')).toBe(true);
        expect(validateGeneratedCode(samples.nodejs, 'nodejs')).toBe(true);
      });
    });
  });
});
