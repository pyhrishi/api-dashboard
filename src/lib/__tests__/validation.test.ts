/**
 * Validation System Unit Tests
 * Tests all validator functions with various input scenarios
 */

import {
  validateParameter,
  validateAllParameters,
  hasValidationErrors,
  getFirstError,
  sanitizePhone,
  sanitizeEmail,
  getValidationHint,
  validationErrorsToArray,
} from '../validation';
import { EndpointParameter } from '@/data/endpoints';

describe('Validation System', () => {
  describe('validateParameter - Email', () => {
    const emailParam: EndpointParameter = {
      name: 'email',
      type: 'email',
      required: true,
      description: 'Email address',
      example: 'user@example.com',
      placeholder: 'user@example.com',
    };

    it('should accept valid emails', () => {
      const testCases = [
        'john@example.com',
        'user.name@company.co.uk',
        'test+tag@domain.org',
      ];
      
      testCases.forEach(email => {
        const result = validateParameter(emailParam, email);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid emails', () => {
      const testCases = [
        'invalid',
        '@example.com',
        'user@',
        'user @example.com',
      ];
      
      testCases.forEach(email => {
        const result = validateParameter(emailParam, email);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('valid email');
      });
    });

    it('should reject empty required email', () => {
      const result = validateParameter(emailParam, '');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should allow empty optional email', () => {
      const optionalEmailParam = { ...emailParam, required: false };
      const result = validateParameter(optionalEmailParam, '');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Property Tests', () => {
    it('should block requests with missing required parameters (Property 11)', () => {
      const param: EndpointParameter = {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email',
        example: 'user@example.com',
      };

      const result = validateParameter(param, undefined);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should provide specific error messages (Property 34)', () => {
      const emailParam: EndpointParameter = {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email',
        example: 'user@example.com',
      };

      const result = validateParameter(emailParam, 'invalid');
      expect(result.error).toContain('user@example.com');
    });

    it('should clear errors on correction (Property 35)', () => {
      const emailParam: EndpointParameter = {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email',
        example: 'user@example.com',
      };

      const invalidResult = validateParameter(emailParam, 'invalid');
      expect(invalidResult.isValid).toBe(false);

      const validResult = validateParameter(emailParam, 'valid@example.com');
      expect(validResult.isValid).toBe(true);
      expect(validResult.error).toBeUndefined();
    });
  });

  describe('validateParameter - Phone', () => {
    const phoneParam: EndpointParameter = {
      name: 'phone',
      type: 'phone',
      required: true,
      description: 'Phone number',
      example: '5551234567',
      placeholder: '555-123-4567',
    };

    it('should accept valid phone numbers', () => {
      const testCases = [
        '5551234567',
        '555-123-4567',
        '(555) 123-4567',
        '+1-555-123-4567',
      ];
      
      testCases.forEach(phone => {
        const result = validateParameter(phoneParam, phone);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid phone numbers', () => {
      const testCases = [
        '123',
        '12345678901234567',
        'abcdefghij',
      ];
      
      testCases.forEach(phone => {
        const result = validateParameter(phoneParam, phone);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateParameter - Number', () => {
    const numberParam: EndpointParameter = {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Result limit',
      example: '10',
      minValue: 1,
      maxValue: 100,
    };

    it('should accept valid numbers in range', () => {
      const testCases = [1, 10, 50, 100];
      testCases.forEach(num => {
        const result = validateParameter(numberParam, num);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject numbers outside range', () => {
      const testCases = [0, -5, 101, 1000];
      testCases.forEach(num => {
        const result = validateParameter(numberParam, num);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateAllParameters', () => {
    const parameters: EndpointParameter[] = [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email',
        example: 'user@example.com',
      },
      {
        name: 'phone',
        type: 'phone',
        required: false,
        description: 'Phone',
        example: '5551234567',
      },
    ];

    it('should return no errors for valid data', () => {
      const values = {
        email: 'john@example.com',
        phone: '5551234567',
      };
      const errors = validateAllParameters(parameters, values);
      expect(hasValidationErrors(errors)).toBe(false);
    });

    it('should return errors for invalid data', () => {
      const values = {
        email: 'invalid-email',
        phone: '123',
      };
      const errors = validateAllParameters(parameters, values);
      expect(hasValidationErrors(errors)).toBe(true);
      expect(errors.email).toBeDefined();
    });
  });

  describe('Helper functions', () => {
    it('sanitizePhone should remove non-digits', () => {
      expect(sanitizePhone('555-123-4567')).toBe('5551234567');
    });

    it('sanitizeEmail should lowercase and trim', () => {
      expect(sanitizeEmail('  JOHN@EXAMPLE.COM  ')).toBe('john@example.com');
    });

    it('getFirstError should return first error', () => {
      const errors = { field1: 'Error 1', field2: 'Error 2' };
      expect(getFirstError(errors)).toBeDefined();
    });
  });
});
